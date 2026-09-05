/**
 * Store dei consensi privacy (Spec V1 sez. 23.1): separati, ricerca/training
 * OFF di default, modificabili in qualsiasi momento.
 * Persistenza locale via AsyncStorage (sopravvivono al riavvio).
 * TODO(backend): sincronizzare con il server quando esiste un endpoint
 * consensi (oggi openapi.json non espone /v1/me/consents — vedi
 * docs/CURSOR_BACKEND_TASKS.md).
 */
import { useSyncExternalStore } from 'react';
import type { ConsentState } from '../secondary/types';
import { consentsMock } from '../../mocks/secondary';
import { getKeyValueStorage } from '../notifications/persistence';

const STORAGE_KEY = 'dogly.consents.v1';

let consents: ConsentState = { ...consentsMock };
let hydrated = false;

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

/** Carica i consensi persistiti (idempotente). Chiamata all'apertura settings. */
export async function hydrateConsents(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const storage = getKeyValueStorage();
  if (!storage) return;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    consents = {
      service: typeof parsed.service === 'boolean' ? parsed.service : consents.service,
      researchTraining:
        typeof parsed.researchTraining === 'boolean'
          ? parsed.researchTraining
          : consents.researchTraining,
      notifications:
        typeof parsed.notifications === 'boolean'
          ? parsed.notifications
          : consents.notifications,
      keepClip:
        typeof parsed.keepClip === 'boolean' ? parsed.keepClip : consents.keepClip,
    };
    emit();
  } catch {
    // storage illeggibile: restano i default di sessione
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
): Promise<boolean> {
  const previous = consents;
  consents = { ...consents, [key]: value };
  emit();

  const storage = getKeyValueStorage();
  if (!storage) return true;
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(consents));
    return true;
  } catch {
    consents = previous;
    emit();
    return false;
  }
}

/** Solo test: riporta lo store ai default e dimentica l'hydration. */
export function resetConsentsForTests(): void {
  consents = { ...consentsMock };
  hydrated = false;
  emit();
}
