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
  ageYearsFrom,
  buildHeroTips,
  dailySeedIndex,
  dayPartForHour,
  loadHeroShownDay,
  loadShownTipIds,
  randomAffectionateLine,
  saveHeroShownDay,
  saveShownTipIds,
  selectHeroMessage,
  setHeroStorageBackend,
  shuffleTips,
  splitWords,
  SHOWN_TIPS_LIMIT,
  type HeroMessageInput,
  type HeroTipsInput,
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

describe('buildHeroTips deck', () => {
  const baseInput: HeroTipsInput = {
    dogId: 'dog-1',
    dayKey: '2026-08-03',
    hour: 9,
    month: 8,
  };

  const ids = (input: HeroTipsInput) => buildHeroTips(input).map((t) => t.id);

  it('care event is always the first card (urgent beats everything)', () => {
    const tips = buildHeroTips({
      ...baseInput,
      careHint: { eventType: 'VACCINE', daysUntil: 2 },
      weather: { temperatureC: 34, weatherCode: 1 },
      patternTitle: 'Si gratta dopo la pioggia',
    });
    expect(tips[0].id).toBe('care:VACCINE:2');
    expect(tips[0].priority).toBe('urgent');
    expect(tips[0].route).toBe('/care');
    expect(tips[0].adviceLine).toBeTruthy();
    // meteo estremo: secondo urgente
    expect(tips[1].id).toBe('weather:torrid');
    expect(tips[1].priority).toBe('urgent');
  });

  it('same day same deck, different days shuffle the normal cards', () => {
    const first = ids(baseInput);
    expect(ids(baseInput)).toEqual(first);
    const firstTips = new Set<string>();
    for (let day = 1; day <= 30; day += 1) {
      const dayKey = `2026-09-${String(day).padStart(2, '0')}`;
      firstTips.add(buildHeroTips({ ...baseInput, dayKey, month: 9 })[0].id);
    }
    expect(firstTips.size).toBeGreaterThan(1);
  });

  it('never invents data: empty input yields greeting + safe evergreen tips', () => {
    const tips = buildHeroTips(baseInput);
    expect(tips.every((tip) => tip.priority === 'normal')).toBe(true);
    expect(ids(baseInput)).toContain('greeting');
    expect(ids(baseInput)).toContain('season:08');
    expect(ids(baseInput)).toContain('evergreen:water');
    expect(ids(baseInput)).toContain('nutrition:snacks');
    expect(ids(baseInput)).toContain('mind:sniff');
    expect(ids(baseInput).some((id) => id.startsWith('weather:'))).toBe(false);
  });

  it('weather produces the right urgent cards', () => {
    expect(ids({ ...baseInput, weather: { temperatureC: 33, weatherCode: 0 } })[0])
      .toBe('weather:torrid');
    expect(ids({ ...baseInput, weather: { temperatureC: 29, weatherCode: 0 } })[0])
      .toBe('weather:hot');
    expect(ids({ ...baseInput, weather: { temperatureC: 2, weatherCode: 0 } })[0])
      .toBe('weather:cold');
    expect(ids({ ...baseInput, weather: { temperatureC: 18, weatherCode: 61 } })[0])
      .toBe('weather:rain');
    const snowy = ids({ ...baseInput, weather: { temperatureC: -1, weatherCode: 73 } });
    // freddo urgente (temperatura) + neve urgente (condizione), max 2 meteo
    expect(snowy.slice(0, 2)).toEqual(['weather:cold', 'weather:snow']);
    expect(ids({ ...baseInput, weather: { temperatureC: 20, weatherCode: 95 } })[0])
      .toBe('weather:storm');
    const humid = ids({
      ...baseInput,
      weather: { temperatureC: 27, weatherCode: 1, humidityPct: 85 },
    });
    expect(humid[0]).toBe('weather:humid');
    // mite → carte normali prominenti, niente urgente; niente stagionale
    const mild = buildHeroTips({
      ...baseInput,
      weather: { temperatureC: 21, weatherCode: 1 },
    });
    expect(mild.some((tip) => tip.id === 'weather:perfect')).toBe(true);
    expect(mild.some((tip) => tip.id.startsWith('season:'))).toBe(false);
    expect(mild.every((tip) => tip.priority === 'normal')).toBe(true);
    // meteo sempre tra le prime 3 quando disponibile
    expect(mild.slice(0, 3).some((tip) => tip.id.startsWith('weather:'))).toBe(true);
  });

  it('temperature bands each have a card', () => {
    const band = (t: number) =>
      buildHeroTips({ ...baseInput, weather: { temperatureC: t, weatherCode: 0 } })
        .find((tip) => tip.id.startsWith('weather:'))?.id;
    expect(band(35)).toBe('weather:torrid');
    expect(band(29)).toBe('weather:hot');
    expect(band(24)).toBe('weather:warm');
    expect(band(16)).toBe('weather:perfect');
    expect(band(8)).toBe('weather:chilly');
    expect(band(2)).toBe('weather:cold');
  });

  it('caps weather at 2 cards even with condition + temperature', () => {
    const tips = buildHeroTips({
      ...baseInput,
      weather: { temperatureC: 33, weatherCode: 61, windSpeedKmh: 45 },
    });
    expect(tips.filter((tip) => tip.id.startsWith('weather:')).length)
      .toBeLessThanOrEqual(2);
    // torrido (urgent) + pioggia (urgent): entrambe presenti
    expect(tips[0].id).toBe('weather:torrid');
    expect(tips[1].id).toBe('weather:rain');
  });

  it('excludes recently shown cards when the deck stays rich enough', () => {
    const all = ids(baseInput);
    const recent = all.filter((id) => !id.startsWith('care:')).slice(0, 10);
    const filtered = ids({ ...baseInput, recentTipIds: recent });
    for (const id of recent) {
      expect(filtered).not.toContain(id);
    }
    expect(filtered.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps everything when exclusion would shrink the deck too much', () => {
    const all = ids(baseInput);
    const filtered = ids({ ...baseInput, recentTipIds: all });
    expect(filtered.length).toBe(all.length);
  });

  it('builds a rich deck (>= 15 cards) with full data', () => {
    const rich = buildHeroTips({
      ...baseInput,
      weather: { temperatureC: 24, weatherCode: 1 },
      breedTip: 'Consiglio di razza.',
      patternTitle: 'Dorme dopo pranzo',
      daysSinceDigestive: 6,
      ageYears: 0.5,
      coatType: 'double',
      foodDataKnown: true,
      activeFoodName: 'Canistar Adult',
      activeFoodMonths: 4,
    });
    expect(rich.length).toBeGreaterThanOrEqual(15);
  });

  it('offers a soft location card only when permission was denied', () => {
    expect(ids({ ...baseInput, locationDenied: true })).toContain('weather:permission');
    expect(ids(baseInput)).not.toContain('weather:permission');
    // con meteo disponibile la carta permesso non serve
    expect(
      ids({
        ...baseInput,
        locationDenied: true,
        weather: { temperatureC: 20, weatherCode: 1 },
      }),
    ).not.toContain('weather:permission');
  });

  it('cold advice mentions the coat for small dogs only', () => {
    const cold = (smallSize: boolean) =>
      buildHeroTips({
        ...baseInput,
        smallSize,
        weather: { temperatureC: 0, weatherCode: 1 },
      })[0];
    expect(cold(true).adviceLine).toContain('cappottino');
    expect(cold(false).adviceLine).not.toContain('cappottino');
  });

  it('puppy and senior cards follow age', () => {
    const puppy = ids({ ...baseInput, ageYears: 0.5 });
    expect(puppy).toContain('age:puppy:explore');
    expect(puppy).toContain('age:puppy:teeth');
    const senior = ids({ ...baseInput, ageYears: 9 });
    expect(senior).toContain('age:senior:joints');
    const adult = ids({ ...baseInput, ageYears: 4 });
    expect(adult.some((id) => id.startsWith('age:'))).toBe(false);
  });

  it('food cards: same food >= 3 months, missing food, fresh food skipped', () => {
    const same = buildHeroTips({
      ...baseInput,
      foodDataKnown: true,
      activeFoodName: 'Canistar Adult',
      activeFoodMonths: 4,
    });
    const sameCard = same.find((tip) => tip.id.startsWith('food:same'));
    expect(sameCard?.dogLine).toContain('Canistar Adult');
    expect(sameCard?.route).toBe('/nutrition/foods');
    expect(sameCard?.adviceLine).toContain('veterinario');

    const missing = ids({ ...baseInput, foodDataKnown: true, activeFoodName: null });
    expect(missing).toContain('food:missing');

    const fresh = ids({
      ...baseInput,
      foodDataKnown: true,
      activeFoodName: 'Canistar Adult',
      activeFoodMonths: 1,
    });
    expect(fresh.some((id) => id.startsWith('food:'))).toBe(false);

    // dati non caricati → nessuna carta alimentazione inventata
    expect(ids(baseInput).some((id) => id.startsWith('food:'))).toBe(false);
  });

  it('digestive reminder and pattern carry route and advice', () => {
    const tips = buildHeroTips({
      ...baseInput,
      daysSinceDigestive: DIGESTIVE_REMINDER_DAYS,
      patternTitle: 'Dorme dopo pranzo',
    });
    const digestive = tips.find((tip) => tip.id === 'digestive:reminder');
    expect(digestive?.route).toBe('/digestive');
    expect(digestive?.adviceLine).toBeTruthy();
    const pattern = tips.find((tip) => tip.id === 'pattern:Dorme dopo pranzo');
    expect(pattern?.route).toBe('/patterns');
    expect(pattern?.adviceLine).toBeTruthy();
  });

  it('shuffleTips keeps every card exactly once', () => {
    const tips = buildHeroTips(baseInput);
    const shuffled = shuffleTips(tips, Math.random);
    expect(shuffled.map((t) => t.id).sort()).toEqual(
      tips.map((t) => t.id).sort(),
    );
  });
});

describe('ageYearsFrom', () => {
  it('prefers birthDate over the label', () => {
    const now = new Date('2026-08-03T12:00:00');
    expect(ageYearsFrom('2021-08-01', null, now)).toBeCloseTo(5, 0);
    expect(ageYearsFrom('2026-02-01', null, now)).toBeCloseTo(0.5, 1);
  });

  it('parses italian age labels and bails out honestly', () => {
    expect(ageYearsFrom(null, '5 anni')).toBe(5);
    expect(ageYearsFrom(null, '8 mesi')).toBeCloseTo(8 / 12, 5);
    expect(ageYearsFrom(null, 'Taglia media')).toBeNull();
    expect(ageYearsFrom(undefined, undefined)).toBeNull();
  });
});

describe('shown tips persistence', () => {
  it('roundtrips ids capped at the limit, scoped per dog', async () => {
    setHeroStorageBackend(memoryStorage());
    expect(await loadShownTipIds('dog-1')).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `tip:${i}`);
    await saveShownTipIds(many, 'dog-1');
    const stored = await loadShownTipIds('dog-1');
    expect(stored.length).toBe(SHOWN_TIPS_LIMIT);
    expect(stored[stored.length - 1]).toBe('tip:19');
    expect(await loadShownTipIds('dog-2')).toEqual([]);
  });
});

describe('hero shown-day persistence', () => {  it('roundtrips the day key scoped per dog', async () => {
    setHeroStorageBackend(memoryStorage());
    expect(await loadHeroShownDay('dog-1')).toBeNull();
    await saveHeroShownDay(localDayKey(), 'dog-1');
    expect(await loadHeroShownDay('dog-1')).toBe(localDayKey());
    expect(await loadHeroShownDay('dog-2')).toBeNull();
  });
});
