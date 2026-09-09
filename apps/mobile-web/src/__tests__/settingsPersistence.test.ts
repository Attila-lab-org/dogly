/**
 * Persistenza preferenze (notifiche + consensi privacy) e gating Apple.
 * Gli store usano un boundary iniettabile (features/notifications/persistence):
 * qui iniettiamo uno storage fake in memoria e simuliamo il riavvio app
 * resettando lo stato in-sessione e ri-idratando dallo storage.
 */
import {
  getNotificationPreferences,
  hydrateNotificationPreferences,
  resetNotificationPreferencesForTests,
  setNotificationPreference,
} from '../features/notifications/store';
import {
  setKeyValueStorageForTests,
  type KeyValueStorage,
} from '../features/notifications/persistence';
import {
  getConsents,
  hydrateConsents,
  resetConsentsForTests,
  setConsent,
} from '../features/privacy/consents';
import { shouldOfferAppleSignIn } from '../features/auth/appleSignIn';

function createFakeStorage(
  overrides?: Partial<KeyValueStorage>,
): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    ...overrides,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  resetNotificationPreferencesForTests();
  resetConsentsForTests();
});

afterAll(() => {
  setKeyValueStorageForTests(null);
});

describe('preferenze notifiche persistite', () => {
  it('sopravvivono a un riavvio (re-hydrate dallo storage)', async () => {
    const storage = createFakeStorage();
    setKeyValueStorageForTests(storage);

    setNotificationPreference('weeklySummary', true);
    setNotificationPreference('careReminders', false);
    await flush();
    expect(storage.data.size).toBeGreaterThan(0);

    // Simula riavvio: stato in memoria tornato ai default.
    resetNotificationPreferencesForTests();
    expect(getNotificationPreferences().weeklySummary).toBe(false);

    await hydrateNotificationPreferences();
    expect(getNotificationPreferences().weeklySummary).toBe(true);
    expect(getNotificationPreferences().careReminders).toBe(false);
    // Chiavi mai toccate restano ai default.
    expect(getNotificationPreferences().checkIn).toBe(true);
  });

  it('ignora uno storage corrotto senza rompere i default', async () => {
    const storage = createFakeStorage();
    storage.data.set('dogly.notification-preferences.v1', '{non-json');
    setKeyValueStorageForTests(storage);

    await hydrateNotificationPreferences();
    expect(getNotificationPreferences().careReminders).toBe(true);
  });

  it('senza storage nativo resta funzionale in sessione', async () => {
    setKeyValueStorageForTests(null);
    setNotificationPreference('resultReady', false);
    expect(getNotificationPreferences().resultReady).toBe(false);
    await hydrateNotificationPreferences();
    expect(getNotificationPreferences().resultReady).toBe(false);
  });
});

describe('consensi privacy persistiti', () => {
  it('setConsent persiste e hydrate ripristina dopo riavvio', async () => {
    const storage = createFakeStorage();
    setKeyValueStorageForTests(storage);

    const saved = await setConsent('researchTraining', true);
    expect(saved).toBe(true);
    expect(getConsents().researchTraining).toBe(true);

    resetConsentsForTests();
    expect(getConsents().researchTraining).toBe(false);

    await hydrateConsents();
    expect(getConsents().researchTraining).toBe(true);
  });

  it('errore di scrittura → revert e false (mai finto successo)', async () => {
    const storage = createFakeStorage({
      setItem: () => Promise.reject(new Error('disk full')),
    });
    setKeyValueStorageForTests(storage);

    const before = getConsents().keepClip;
    const saved = await setConsent('keepClip', !before);
    expect(saved).toBe(false);
    expect(getConsents().keepClip).toBe(before);
  });
});

describe('gating Sign in with Apple (ADR-001)', () => {
  it('visibile solo su iOS con Apple disponibile', () => {
    expect(shouldOfferAppleSignIn('ios', true)).toBe(true);
    expect(shouldOfferAppleSignIn('ios', false)).toBe(false);
    expect(shouldOfferAppleSignIn('android', true)).toBe(false);
    expect(shouldOfferAppleSignIn('web', true)).toBe(false);
  });
});
