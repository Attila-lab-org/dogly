/**
 * Test dell'hero Home ("il cane ti parla"):
 * - cascata del messaggio (agenda > pattern > digestione > saluto);
 * - finestre temporali (7 giorni agenda, 4 giorni digestione);
 * - nessun dato inventato: input assenti → solo saluto di fascia oraria;
 * - flag "mostrato oggi" con storage iniettabile (roundtrip per cane).
 */
import {
  DIGESTIVE_REMINDER_DAYS,
  HERO_CARE_WINDOW_DAYS,
  dayPartForHour,
  loadHeroShownDay,
  randomAffectionateLine,
  saveHeroShownDay,
  selectHeroMessage,
  setHeroStorageBackend,
  splitWords,
} from '../features/home/dogHeroCopy';
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

describe('hero shown-day persistence', () => {
  it('roundtrips the day key scoped per dog', async () => {
    setHeroStorageBackend(memoryStorage());
    expect(await loadHeroShownDay('dog-1')).toBeNull();
    await saveHeroShownDay(localDayKey(), 'dog-1');
    expect(await loadHeroShownDay('dog-1')).toBe(localDayKey());
    expect(await loadHeroShownDay('dog-2')).toBeNull();
  });
});
