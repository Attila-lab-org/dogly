/**
 * Store dei consensi privacy (Spec V1 sez. 23.1): separati, ricerca/training
 * OFF di default, modificabili in qualsiasi momento.
 * Il server è la fonte autorevole in real mode; AsyncStorage mantiene una
 * cache locale per il bootstrap e per il mock gate.
 */
import { useSyncExternalStore } from 'react';
import type { ConsentState } from '../secondary/types';
import { consentsMock } from '../../mocks/secondary';
import { getKeyValueStorage } from '../notifications/persistence';

const STORAGE_KEY_PREFIX = 'dogly.consents.v1';
let activeUserId: string | null = null;
let accountGeneration = 0;
function storageKey(userId = activeUserId) {
  return `${STORAGE_KEY_PREFIX}.${userId ?? 'anonymous'}`;
}
export const POLICY_VERSION = 'privacy/v2';

let consents: ConsentState = { ...consentsMock };
let hydrated = false;
let remoteHydrated = false;
const syncKeys = new Map<keyof ConsentState, string>();

function newSyncKey(key: keyof ConsentState): string {
  const existing = syncKeys.get(key);
  if (existing) return existing;
  const value = `consent-${key}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  syncKeys.set(key, value);
  return value;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return consents;
}

export function useConsents(): ConsentState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getConsents(): ConsentState {
  return consents;
}

type ApiConsents = {
  service_terms: boolean;
  research_training: boolean;
  notifications: boolean;
  media_retention: boolean;
};

function fromApi(value: ApiConsents): ConsentState {
  return {
    service: value.service_terms,
    researchTraining: value.research_training,
    notifications: value.notifications,
    keepClip: value.media_retention,
  };
}

async function persistLocal(value: ConsentState): Promise<boolean> {
  const storage = getKeyValueStorage();
  if (!storage) return true;
  try {
    await storage.setItem(storageKey(), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Carica cache locale e, in real mode, riconcilia con il server autorevole. */
export async function hydrateConsents(options?: {
  syncRemote?: boolean;
  userId?: string | null;
}): Promise<boolean> {
  if (options?.userId !== undefined && options.userId !== activeUserId) {
    activeUserId = options.userId ?? null;
    accountGeneration += 1;
    hydrated = false;
    remoteHydrated = false;
    consents = { ...consentsMock };
    emit();
  }
  const generation = accountGeneration;
  const userId = activeUserId;
  if (!hydrated) {
    hydrated = true;
    const storage = getKeyValueStorage();
    if (storage) {
      try {
        const raw = await storage.getItem(storageKey(userId));
        if (generation !== accountGeneration || userId !== activeUserId) return false;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ConsentState>;
          consents = {
            service:
              typeof parsed.service === 'boolean' ? parsed.service : consents.service,
            researchTraining:
              typeof parsed.researchTraining === 'boolean'
                ? parsed.researchTraining
                : consents.researchTraining,
            notifications:
              typeof parsed.notifications === 'boolean'
                ? parsed.notifications
                : consents.notifications,
            keepClip:
              typeof parsed.keepClip === 'boolean'
                ? parsed.keepClip
                : consents.keepClip,
          };
          emit();
        }
      } catch {
        // Cache illeggibile: il server può ancora ripristinare lo stato.
      }
    }
  }

  if (!options?.syncRemote || remoteHydrated) return true;
  try {
    const { api } = await import('../../lib/apiClient');
    const remote = await api.get<ApiConsents>('/v1/me/consents');
    if (generation !== accountGeneration || userId !== activeUserId) return false;
    consents = fromApi(remote);
    remoteHydrated = true;
    emit();
    await persistLocal(consents);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dopo il login: registra SERVICE_TERMS perché Welcome dice
 * "Continuando accetti". Non ri-scrive se è già granted.
 */
export async function ensureServiceTermsRecorded(): Promise<void> {
  const synced = await hydrateConsents({ syncRemote: true });
  if (synced && getConsents().service) return;
  await setConsent('service', true, { syncRemote: true });
}

/**
 * Aggiorna un consenso e lo persiste. In caso di errore di scrittura fa
 * revert allo stato precedente e restituisce false (mai finto successo).
 * Senza storage nativo (test/web) vale la sola sessione.
 */
export async function setConsent(
  key: keyof ConsentState,
  value: boolean,
  options?: { syncRemote?: boolean },
): Promise<boolean> {
  const generation = accountGeneration;
  const userId = activeUserId;
  const previous = consents;
  consents = { ...consents, [key]: value };
  emit();

  if (options?.syncRemote) {
    const field = {
      service: 'service_terms',
      researchTraining: 'research_training',
      notifications: 'notifications',
      keepClip: 'media_retention',
    }[key];
    try {
      const { api } = await import('../../lib/apiClient');
      const remote = await api.patch<ApiConsents>('/v1/me/consents', {
        policy_version: POLICY_VERSION,
        [field]: value,
      }, { headers: { 'X-Idempotency-Key': newSyncKey(key) } });
      if (generation !== accountGeneration || userId !== activeUserId) return false;
      syncKeys.delete(key);
      consents = fromApi(remote);
      remoteHydrated = true;
      emit();
      await persistLocal(consents);
      if (key === 'notifications' && consents.notifications) {
        const { registerDevicePushToken } = await import('../notifications/pushToken');
        void registerDevicePushToken();
      }
      return true;
    } catch {
      if (generation !== accountGeneration || userId !== activeUserId) return false;
      consents = previous;
      emit();
      return false;
    }
  }

  if (generation !== accountGeneration || userId !== activeUserId) return false;
  if (await persistLocal(consents)) {
    return true;
  }
  consents = previous;
  emit();
  return false;
}

/** Solo test: riporta lo store ai default e dimentica l'hydration. */
export function resetConsentsForUser(userId: string | null): void {
  accountGeneration += 1;
  activeUserId = userId;
  consents = { ...consentsMock };
  hydrated = false;
  remoteHydrated = false;
  syncKeys.clear();
  emit();
}

export function resetConsentsForTests(): void {
  activeUserId = null;
  accountGeneration += 1;
  consents = { ...consentsMock };
  hydrated = false;
  remoteHydrated = false;
  syncKeys.clear();
  emit();
}
