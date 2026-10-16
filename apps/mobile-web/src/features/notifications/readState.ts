/**
 * Stato locale di lettura del centro notifiche.
 * Le notifiche sono informative e non richiedono un endpoint dedicato: il
 * proprietario le legge sul dispositivo e il pallino resta fino all'apertura.
 */
import { useSyncExternalStore } from 'react';
import { getKeyValueStorage } from './persistence';

const STORAGE_KEY = 'dogly.notifications.read.v1';

let readKeys = new Set<string>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return readKeys;
}

export function notificationKey(kind: 'care' | 'result', id: string): string {
  return `${kind}:${id}`;
}

export function useReadNotificationKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export async function hydrateReadNotificationKeys(): Promise<void> {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const storage = getKeyValueStorage();
    if (storage) {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          readKeys = new Set(parsed.filter((value): value is string => typeof value === 'string'));
          emit();
        }
      } catch {
        // Una cache corrotta non deve bloccare il centro notifiche.
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

export async function markNotificationRead(key: string): Promise<void> {
  await hydrateReadNotificationKeys();
  if (readKeys.has(key)) return;
  readKeys = new Set(readKeys).add(key);
  emit();
  const storage = getKeyValueStorage();
  if (storage) {
    await storage.setItem(STORAGE_KEY, JSON.stringify([...readKeys])).catch(() => undefined);
  }
}
