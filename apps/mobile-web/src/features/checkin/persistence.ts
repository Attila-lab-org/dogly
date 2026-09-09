/**
 * Persistenza check-in su AsyncStorage: preferenze (frequenza,
 * smartReminders) e ultima risposta, così il modal non riappare a ogni
 * avvio a freddo se si è già risposto (frequenza giornaliera di default).
 *
 * Il backend storage è iniettabile (setCheckInStorageBackend) per i test;
 * in app si usa @react-native-async-storage/async-storage, caricato con
 * import dinamico per non rompere Jest in ambiente node.
 */
import type { CheckInPreferences } from './types';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const PREFS_KEY = 'checkin:prefs:v1';
const LAST_ANSWER_KEY = 'checkin:last-answer:v1';

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setCheckInStorageBackend(backend: KeyValueStorage | null): void {
  injectedBackend = backend;
}

async function storage(): Promise<KeyValueStorage | null> {
  if (injectedBackend) return injectedBackend;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default;
  } catch {
    return null;
  }
}

/** Giorno locale YYYY-MM-DD (la frequenza ragiona su giorni, non ore). */
export function localDayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function loadCheckInPrefs(): Promise<CheckInPreferences | null> {
  const store = await storage();
  if (!store) return null;
  try {
    const raw = await store.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckInPreferences>;
    const frequency = parsed.frequency;
    if (
      frequency !== 'light' &&
      frequency !== 'normal' &&
      frequency !== 'monitoring'
    ) {
      return null;
    }
    return {
      frequency,
      smartReminders: parsed.smartReminders !== false,
    };
  } catch {
    return null;
  }
}

export async function saveCheckInPrefs(prefs: CheckInPreferences): Promise<void> {
  const store = await storage();
  if (!store) return;
  try {
    await store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // persistenza best-effort: lo stato in memoria resta valido
  }
}

export interface PersistedCheckInAnswer {
  /** Giorno locale (localDayKey) in cui si è risposto */
  dayKey: string;
  concern: 'soft' | 'off';
}

export async function loadLastCheckInAnswer(): Promise<PersistedCheckInAnswer | null> {
  const store = await storage();
  if (!store) return null;
  try {
    const raw = await store.getItem(LAST_ANSWER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCheckInAnswer>;
    if (
      typeof parsed.dayKey !== 'string' ||
      (parsed.concern !== 'soft' && parsed.concern !== 'off')
    ) {
      return null;
    }
    return { dayKey: parsed.dayKey, concern: parsed.concern };
  } catch {
    return null;
  }
}

export async function saveLastCheckInAnswer(
  answer: PersistedCheckInAnswer,
): Promise<void> {
  const store = await storage();
  if (!store) return;
  try {
    await store.setItem(LAST_ANSWER_KEY, JSON.stringify(answer));
  } catch {
    // persistenza best-effort
  }
}
