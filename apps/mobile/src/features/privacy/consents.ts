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

const STORAGE_KEY = 'dogly.consents.v1';
const POLICY_VERSION = 'privacy-beta/v1';

let consents: ConsentState = { ...consentsMock };
let hydrated = false;
let remoteHydrated = false;

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
    await storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Carica cache locale e, in real mode, riconcilia con il server autorevole. */
export async function hydrateConsents(options?: {
  syncRemote?: boolean;
}): Promise<boolean> {
  if (!hydrated) {
    hydrated = true;
    const storage = getKeyValueStorage();
    if (storage) {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
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
 * Aggiorna un consenso e lo persiste. In caso di errore di scrittura fa
 * revert allo stato precedente e restituisce false (mai finto successo).
 * Senza storage nativo (test/web) vale la sola sessione.
 */
export async function setConsent(
  key: keyof ConsentState,
  value: boolean,
  options?: { syncRemote?: boolean },
): Promise<boolean> {
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
      });
      consents = fromApi(remote);
      remoteHydrated = true;
      emit();
      await persistLocal(consents);
      return true;
    } catch {
      consents = previous;
      emit();
      return false;
    }
  }

  if (await persistLocal(consents)) {
    return true;
  }
  consents = previous;
  emit();
  return false;
}

/** Solo test: riporta lo store ai default e dimentica l'hydration. */
export function resetConsentsForTests(): void {
  consents = { ...consentsMock };
  hydrated = false;
  remoteHydrated = false;
  emit();
}
