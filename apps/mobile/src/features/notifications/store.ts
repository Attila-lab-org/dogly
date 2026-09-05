/**
 * Preferenze notifiche: persistite localmente via AsyncStorage, così
 * "le modifiche vengono salvate subito" è vero anche dopo il riavvio.
 * La persistenza è best-effort: se lo storage non è disponibile il valore
 * resta valido per la sessione corrente.
 */
import { useSyncExternalStore } from 'react';
import { getKeyValueStorage } from './persistence';

export interface NotificationPreferences {
  careReminders: boolean;
  resultReady: boolean;
  newPattern: boolean;
  digestiveTrend: boolean;
  weeklySummary: boolean;
  checkIn: boolean;
}

const STORAGE_KEY = 'dogly.notification-preferences.v1';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  careReminders: true,
  resultReady: true,
  newPattern: true,
  digestiveTrend: true,
  weeklySummary: false,
  checkIn: true,
};

let preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
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
  return preferences;
}

export function useNotificationPreferences() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getNotificationPreferences() {
  return preferences;
}

/** Carica le preferenze persistite (idempotente). */
export async function hydrateNotificationPreferences(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const storage = getKeyValueStorage();
  if (!storage) return;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    const next = { ...preferences };
    (Object.keys(next) as Array<keyof NotificationPreferences>).forEach((key) => {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
    });
    preferences = next;
    emit();
  } catch {
    // storage illeggibile: restano i default di sessione
  }
}

export function setNotificationPreference(
  key: keyof NotificationPreferences,
  value: boolean,
) {
  preferences = { ...preferences, [key]: value };
  emit();
  const storage = getKeyValueStorage();
  if (!storage) return;
  void storage
    .setItem(STORAGE_KEY, JSON.stringify(preferences))
    .catch(() => undefined);
}

/** Solo test: riporta lo store ai default e dimentica l'hydration. */
export function resetNotificationPreferencesForTests(): void {
  preferences = { ...DEFAULT_PREFERENCES };
  hydrated = false;
  emit();
}
