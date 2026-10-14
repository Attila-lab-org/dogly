/**
 * Test dell'hero Home ("il cane ti parla"):
 * - cascata del messaggio (agenda sempre > rotazione > saluto);
 * - rotazione giornaliera deterministica tra pattern, consiglio razza,
 *   promemoria digestione;
 * - archetipi di razza (nomi comuni, Mix, sconosciuta) e consigli per fascia;
 * - finestre temporali (7 giorni agenda, 4 giorni digestione);
 * - nessun dato inventato: input assenti → solo saluto di fascia oraria;
 * - flag "mostrato oggi" con storage iniettabile (roundtrip per cane).
 */
import {
  DIGESTIVE_REMINDER_DAYS,
  HERO_CARE_WINDOW_DAYS,
  dailySeedIndex,
  dayPartForHour,
  loadHeroShownDay,
  randomAffectionateLine,
  saveHeroShownDay,
  selectHeroMessage,
  setHeroStorageBackend,
  splitWords,
  type HeroMessageInput,
} from '../features/home/dogHeroCopy';
import {
  breedArchetypeFor,
  breedTipFor,
} from '../features/dogs/breedTraits';
import { localDayKey } from '../features/checkin/persistence';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

afterEach(() => setHeroStorageBackend(null));

describe('dayPartForHour', () => {
  it('maps the day into morning, afternoon and evening', () => {
    expect(dayPartForHour(7)).toBe('morning');
    expect(dayPartForHour(13)).toBe('afternoon');
    expect(dayPartForHour(21)).toBe('evening');
    expect(dayPartForHour(2)).toBe('evening');
  });
});

describe('selectHeroMessage', () => {
  it('prioritizes the upcoming care event within the window', () => {
    const message = selectHeroMessage({
      hour: 10,
      careHint: { eventType: 'PARASITE_TREATMENT', daysUntil: 3 },
      patternTitle: 'Si gratta dopo la pioggia',
      daysSinceDigestive: null,
    });
    expect(message.kind).toBe('care');
    expect(message.text).toContain('tra 3 giorni');
    expect(message.text).toContain('antiparassitario');
  });

  it('uses oggi/domani for near care events', () => {
    expect(
      selectHeroMessage({
        hour: 10,
        careHint: { eventType: 'VET_VISIT', daysUntil: 0 },
      }).text,
    ).toContain('oggi');
    expect(
      selectHeroMessage({
        hour: 10,
        careHint: { eventType: 'VACCINE', daysUntil: 1 },
      }).text,
    ).toContain('domani');
  });

  it('ignores care events beyond the window', () => {
    const message = selectHeroMessage({
      hour: 10,
      careHint: { eventType: 'EXAM', daysUntil: HERO_CARE_WINDOW_DAYS + 1 },
      patternTitle: 'Dorme dopo pranzo',
    });
    expect(message.kind).toBe('pattern');
    expect(message.text).toContain('Dorme dopo pranzo');
  });

  it('reminds the digestive check after the threshold or when never done', () => {
    expect(
      selectHeroMessage({ hour: 10, daysSinceDigestive: null }).kind,
    ).toBe('digestive');
    expect(
      selectHeroMessage({
        hour: 10,
        daysSinceDigestive: DIGESTIVE_REMINDER_DAYS,
      }).kind,
    ).toBe('digestive');
    expect(
      selectHeroMessage({
        hour: 10,
        daysSinceDigestive: DIGESTIVE_REMINDER_DAYS - 1,
      }).kind,
    ).toBe('greeting');
  });

  it('never invents data: without inputs it falls back to the greeting', () => {
    expect(selectHeroMessage({ hour: 9 }).kind).toBe('greeting');
    expect(
      selectHeroMessage({
        hour: 9,
        careHint: null,
        patternTitle: undefined,
        daysSinceDigestive: undefined,
      }).kind,
    ).toBe('greeting');
    expect(selectHeroMessage({ hour: 9 }).text).toContain('Buongiorno');
    expect(selectHeroMessage({ hour: 20 }).text).toContain('Buonasera');
  });
});

describe('affectionate lines', () => {
  it('picks a deterministic line from the list', () => {
    expect(randomAffectionateLine(() => 0)).toBe('Ti voglio un mondo di bene!');
    expect(randomAffectionateLine(() => 0.999)).not.toBe('');
  });
});

describe('splitWords', () => {
  it('splits the bubble text into words', () => {
    expect(splitWords('Ciao bello!')).toEqual(['Ciao', 'bello!']);
  });
});

describe('daily rotation', () => {
  const candidatesInput: HeroMessageInput = {
    hour: 10,
    patternTitle: 'Si gratta dopo la pioggia',
    breedTip: 'Consiglio di prova.',
    daysSinceDigestive: null,
  };

  it('is stable within the same day for the same dog', () => {
    const first = selectHeroMessage({
      ...candidatesInput,
      dayKey: '2026-06-10',
      dogId: 'dog-1',
    });
    const second = selectHeroMessage({
      ...candidatesInput,
      dayKey: '2026-06-10',
      dogId: 'dog-1',
    });
    expect(first).toEqual(second);
    expect(['pattern', 'breed', 'digestive']).toContain(first.kind);
  });

  it('covers different candidates across different days', () => {
    const kinds = new Set<string>();
    for (let day = 1; day <= 30; day += 1) {
      const message = selectHeroMessage({
        ...candidatesInput,
        dayKey: `2026-06-${String(day).padStart(2, '0')}`,
        dogId: 'dog-1',
      });
      kinds.add(message.kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
    expect(kinds.has('greeting')).toBe(false);
    expect(kinds.has('care')).toBe(false);
  });

  it('lets the breed tip win on some days', () => {
    const kinds = new Set<string>();
    for (let day = 1; day <= 30; day += 1) {
      const message = selectHeroMessage({
        hour: 10,
        breedTip: 'Noi Border Collie abbiamo la testa che corre.',
        daysSinceDigestive: null,
        dayKey: `2026-07-${String(day).padStart(2, '0')}`,
        dogId: 'dog-2',
      });
      kinds.add(message.kind);
    }
    expect(kinds).toEqual(new Set(['breed', 'digestive']));
  });

  it('care event always wins over every candidate', () => {
    const message = selectHeroMessage({
      ...candidatesInput,
      careHint: { eventType: 'VET_VISIT', daysUntil: 2 },
      dayKey: '2026-06-10',
      dogId: 'dog-1',
    });
    expect(message.kind).toBe('care');
  });

  it('dailySeedIndex stays inside the candidate range', () => {
    expect(dailySeedIndex('2026-06-10', 'dog-1', 0)).toBe(0);
    for (let day = 1; day <= 28; day += 1) {
      const index = dailySeedIndex(`2026-05-${day}`, 'dog-1', 3);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(3);
    }
  });
});

describe('breed archetypes', () => {
  it('maps common breed names to the right archetype', () => {
    expect(breedArchetypeFor('Border Collie')).toBe('herding');
    expect(breedArchetypeFor('Pastore Tedesco')).toBe('herding');
    expect(breedArchetypeFor('Labrador Retriever')).toBe('retriever');
    expect(breedArchetypeFor('Beagle')).toBe('hound');
    expect(breedArchetypeFor('Jack Russell Terrier')).toBe('terrier');
    expect(breedArchetypeFor('Boston Terrier')).toBe('toy');
    expect(breedArchetypeFor('Cane Corso')).toBe('molossi');
    expect(breedArchetypeFor('Bovaro del Bernese')).toBe('molossi');
    expect(breedArchetypeFor('Bovaro delle Fiandre')).toBe('herding');
    expect(breedArchetypeFor('Siberian Husky')).toBe('nordic');
    expect(breedArchetypeFor('Chihuahua')).toBe('toy');
    expect(breedArchetypeFor('Greyhound')).toBe('sighthound');
    expect(breedArchetypeFor('Piccolo Levriero Italiano')).toBe('sighthound');
    expect(breedArchetypeFor('Bracco Italiano')).toBe('pointer');
    expect(breedArchetypeFor('Schnauzer Nano')).toBe('pinscher');
  });

  it('maps Mix and unknown breeds to their fallbacks', () => {
    expect(breedArchetypeFor('Mix')).toBe('mixed');
    expect(breedArchetypeFor('incrocio')).toBe('mixed');
    expect(breedArchetypeFor('Razza Inventata')).toBe('generic');
    expect(breedArchetypeFor(null)).toBe('generic');
    expect(breedArchetypeFor(undefined)).toBe('generic');
    expect(breedArchetypeFor('  ')).toBe('generic');
  });

  it('composes tips in the dog voice, adapted to the day part', () => {
    expect(breedTipFor('Border Collie', 'morning')).toContain(
      'Noi Border Collie',
    );
    expect(breedTipFor('Mix', 'morning')).toContain('meticci');
    expect(breedTipFor(null, 'evening')).not.toContain('{breed}');
    expect(breedTipFor('Siberian Husky', 'afternoon')).not.toContain(
      'Noi Siberian Husky',
    );
  });

  it('prefers the enrichment tip when the dog stays alone many hours', () => {
    const tip = breedTipFor('Beagle', 'morning', { timeAlone: 'MANY_HOURS' });
    expect(tip).toContain('resto solo tante ore');
    expect(breedTipFor('Beagle', 'morning', { timeAlone: 'LITTLE' })).toContain(
      'naso',
    );
  });
});

describe('hero shown-day persistence', () => {
  it('roundtrips the day key scoped per dog', async () => {
    setHeroStorageBackend(memoryStorage());
    expect(await loadHeroShownDay('dog-1')).toBeNull();
    await saveHeroShownDay(localDayKey(), 'dog-1');
    expect(await loadHeroShownDay('dog-1')).toBe(localDayKey());
    expect(await loadHeroShownDay('dog-2')).toBeNull();
  });
});
