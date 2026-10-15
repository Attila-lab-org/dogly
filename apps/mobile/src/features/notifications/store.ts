/**
 * Preferenze notifiche: cache locale per la UI e consenso globale sincronizzato
 * col server quando l'API è configurata. Le categorie restano locali finché il
 * backend non espone preferenze distinte per tipo di messaggio.
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
  resultReady: false,
  newPattern: false,
  digestiveTrend: false,
  weeklySummary: false,
  checkIn: true,
};

let preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let writeVersion = 0;

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
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const storage = getKeyValueStorage();
    if (storage) {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
          const next = { ...preferences };
          (Object.keys(next) as Array<keyof NotificationPreferences>).forEach((key) => {
            if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
          });
          preferences = next;
          emit();
        }
      } catch {
        // storage illeggibile: restano i default di sessione
      }
    }
    hydrated = true;
  })();
  try {
    await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }
}

export async function setNotificationPreference(
  key: keyof NotificationPreferences,
  value: boolean,
) : Promise<boolean> {
  const previous = preferences;
  const version = ++writeVersion;
  const next = { ...preferences, [key]: value };
  preferences = next;
  emit();
  const storage = getKeyValueStorage();
  try {
    if (storage) await storage.setItem(STORAGE_KEY, JSON.stringify(next));
    const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    if (Boolean(runtimeEnv?.EXPO_PUBLIC_API_URL)) {
      const notificationsEnabled = Object.values(next).some(Boolean);
      const { api } = require('../../lib/apiClient') as typeof import('../../lib/apiClient');
      await api.patch('/v1/me/consents', {
        policy_version: 'privacy-beta/v1',
        notifications: notificationsEnabled,
      });
    }
    return true;
  } catch {
    if (version === writeVersion && preferences === next) {
      preferences = previous;
      emit();
      if (storage) {
        await storage.setItem(STORAGE_KEY, JSON.stringify(previous)).catch(() => undefined);
      }
    }
    return false;
  }
}

/** Solo test: riporta lo store ai default e dimentica l'hydration. */
export function resetNotificationPreferencesForTests(): void {
  preferences = { ...DEFAULT_PREFERENCES };
  hydrated = false;
  hydrationPromise = null;
  writeVersion = 0;
  emit();
}
