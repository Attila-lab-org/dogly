/**
 * Test del workstream Home/Diario/Check-in (dati reali):
 * - mapping DiaryItem API → DiaryEntry UI (retention, domini ammessi);
 * - deriveHomeState: ultima analisi, processing, new user da timeline reale;
 * - formatInsightTimestamp: Oggi/Ieri/data;
 * - check-in: frequenza persistita (shouldShowWelcomeCheckIn) e storage
 *   AsyncStorage iniettabile (roundtrip prefs + ultima risposta).
 */
import {
  deriveHomeState,
  formatInsightTimestamp,
  mapDiaryItemToEntry,
  probabilisticInsightLabel,
  type ApiDiaryItem,
} from '../features/home/api';
import {
  loadCheckInPrefs,
  loadLastCheckInAnswer,
  localDayKey,
  saveCheckInPrefs,
  saveLastCheckInAnswer,
  setCheckInStorageBackend,
  type KeyValueStorage,
} from '../features/checkin/persistence';
import {
  getCheckInSnapshot,
  hydrateCheckIn,
  shouldShowWelcomeCheckIn,
} from '../features/checkin/store';

function diaryItem(partial: Partial<ApiDiaryItem>): ApiDiaryItem {
  return {
    id: 'evt-x',
    domain: 'BEHAVIOR',
    dog_id: 'dog-1',
    status: 'COMPLETED',
    title: 'Sembra rilassato',
    summary: null,
    retention_state: 'TEMPORARY',
    created_at: '2026-09-04T09:30:00Z',
    ...partial,
  };
}

describe('mapDiaryItemToEntry', () => {
  it('mappa campi e retention DELETED → mediaDeleted', () => {
    const entry = mapDiaryItemToEntry(
      diaryItem({ retention_state: 'DELETED', summary: 'Corpo disteso' }),
    );
    expect(entry).not.toBeNull();
    expect(entry?.mediaDeleted).toBe(true);
    expect(entry?.subtitle).toBe('Corpo disteso');
    expect(entry?.refId).toBe('evt-x');
  });

  it('DELETE_PENDING conta come media cancellato', () => {
    expect(
      mapDiaryItemToEntry(diaryItem({ retention_state: 'DELETE_PENDING' }))
        ?.mediaDeleted,
    ).toBe(true);
  });

  it('FOOD_LABEL non è un dominio del Diario → null', () => {
    expect(mapDiaryItemToEntry(diaryItem({ domain: 'FOOD_LABEL' }))).toBeNull();
  });

  it('stato non completato → sottotitolo di stato onesto', () => {
    expect(
      mapDiaryItemToEntry(diaryItem({ status: 'OBSERVING' }))?.subtitle,
    ).toBe('Analisi in corso');
  });
});

describe('deriveHomeState (sez. 6 Home)', () => {
  const now = new Date('2026-09-04T20:00:00Z');

  it('nessun evento reale → isNewUser, niente insight né processing', () => {
    const derived = deriveHomeState([], now);
    expect(derived.isNewUser).toBe(true);
    expect(derived.lastInsight).toBeNull();
    expect(derived.processingEventId).toBeNull();
  });

  it("ultima analisi = behavior COMPLETED più recente, processing = non terminale", () => {
    const derived = deriveHomeState(
      [
        diaryItem({
          id: 'evt-proc',
          status: 'OBSERVING',
          created_at: '2026-09-04T19:00:00Z',
        }),
        diaryItem({ id: 'evt-done', created_at: '2026-09-04T09:30:00Z' }),
        diaryItem({
          id: 'fecal-1',
          domain: 'DIGESTIVE',
          created_at: '2026-09-04T07:00:00Z',
        }),
      ],
      now,
    );
    expect(derived.isNewUser).toBe(false);
    expect(derived.processingEventId).toBe('evt-proc');
    expect(derived.lastInsight?.eventId).toBe('evt-done');
    expect(derived.lastInsight?.label).toBe('Sembra rilassato');
  });

  it('upload bloccato non tiene la Home sul banner analisi in corso', () => {
    const derived = deriveHomeState(
      [diaryItem({ id: 'evt-upload', status: 'UPLOADING' })],
      now,
    );
    expect(derived.processingEventId).toBeNull();
  });

  it('eventi falliti terminali non contano come processing', () => {
    const derived = deriveHomeState(
      [diaryItem({ id: 'evt-fail', status: 'FAILED_TERMINAL' })],
      now,
    );
    expect(derived.processingEventId).toBeNull();
    expect(derived.lastInsight).toBeNull();
  });
});

describe('probabilisticInsightLabel', () => {
  it('traduce il codice tassonomico e garantisce wording prudente', () => {
    expect(probabilisticInsightLabel('RELAX_REST')).toMatch(/^Sembra /);
    expect(probabilisticInsightLabel('Probabilmente vuole uscire')).toBe(
      'Probabilmente vuole uscire',
    );
  });
});

describe('formatInsightTimestamp', () => {
  const local = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m - 1, d, h, min);

  it('Oggi / Ieri / data completa', () => {
    const now = local(2026, 9, 4, 20, 0);
    expect(
      formatInsightTimestamp(local(2026, 9, 4, 9, 30).toISOString(), now),
    ).toBe('Oggi, 09:30');
    expect(
      formatInsightTimestamp(local(2026, 9, 3, 18, 12).toISOString(), now),
    ).toBe('Ieri, 18:12');
    expect(
      formatInsightTimestamp(local(2026, 8, 30, 8, 5).toISOString(), now),
    ).toMatch(/30/);
  });
});

describe('check-in: frequenza e persistenza', () => {
  it('shouldShowWelcomeCheckIn rispetta la frequenza', () => {
    const today = '2026-09-04';
    expect(shouldShowWelcomeCheckIn(null, 'normal', today)).toBe(true);
    expect(shouldShowWelcomeCheckIn('2026-09-04', 'normal', today)).toBe(false);
    expect(shouldShowWelcomeCheckIn('2026-09-03', 'normal', today)).toBe(true);
    expect(shouldShowWelcomeCheckIn('2026-09-02', 'light', today)).toBe(false);
    expect(shouldShowWelcomeCheckIn('2026-09-01', 'light', today)).toBe(true);
    expect(shouldShowWelcomeCheckIn('2026-09-04', 'monitoring', today)).toBe(true);
  });

  it('roundtrip prefs + ultima risposta su storage iniettato', async () => {
    const mem = new Map<string, string>();
    const fake: KeyValueStorage = {
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => void mem.set(k, v),
    };
    setCheckInStorageBackend(fake);
    try {
      await saveCheckInPrefs({ frequency: 'light', smartReminders: false });
      await expect(loadCheckInPrefs()).resolves.toEqual({
        frequency: 'light',
        smartReminders: false,
      });

      await saveLastCheckInAnswer({ dayKey: '2026-09-04', concern: 'soft' });
      await expect(loadLastCheckInAnswer()).resolves.toEqual({
        dayKey: '2026-09-04',
        concern: 'soft',
      });
    } finally {
      setCheckInStorageBackend(null);
    }
  });

  it('payload corrotto → null, mai crash', async () => {
    const fake: KeyValueStorage = {
      getItem: async () => '{non-json',
      setItem: async () => {},
    };
    setCheckInStorageBackend(fake);
    try {
      await expect(loadCheckInPrefs()).resolves.toBeNull();
      await expect(loadLastCheckInAnswer()).resolves.toBeNull();
    } finally {
      setCheckInStorageBackend(null);
    }
  });

  it('hydrate: già risposto oggi → il modal non riappare a freddo', async () => {
    const mem = new Map<string, string>();
    const fake: KeyValueStorage = {
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => void mem.set(k, v),
    };
    setCheckInStorageBackend(fake);
    try {
      await saveLastCheckInAnswer({
        dayKey: localDayKey(),
        concern: 'soft',
      });
      await hydrateCheckIn();
      const snap = getCheckInSnapshot();
      expect(snap.hydrated).toBe(true);
      expect(snap.welcomePending).toBe(false);
    } finally {
      setCheckInStorageBackend(null);
    }
  });
});
