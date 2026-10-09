import type { RealtimeSession } from './api';

const STORAGE_KEY = 'dogly.realtime.handoff.v1';
const HANDOFF_TTL_MS = 30 * 60 * 1000;
const MAX_STORED_MESSAGES = 20;
const MAX_MESSAGE_TEXT = 2000;

type CompactMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type PendingHandoff<T = unknown> = {
  session: RealtimeSession;
  messages: T[];
  savedAt: number;
};

type StoredHandoff = {
  session: RealtimeSession;
  messages: CompactMessage[];
  savedAt: number;
};

type HandoffStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

let pending: PendingHandoff | null = null;
let storageOverride: HandoffStorage | null = null;

export function setRealtimeSessionStorageForTests(storage: HandoffStorage | null): void {
  storageOverride = storage;
}

function getHandoffStorage(): HandoffStorage | null {
  if (storageOverride) return storageOverride;
  try {
    const mod = require('@react-native-async-storage/async-storage') as
      | (HandoffStorage & { default?: HandoffStorage })
      | undefined;
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

/** Test-only reset for simulating a cold app process. */
export function resetRealtimeSessionBridgeForTests(): void {
  pending = null;
}

/** Clears a handoff when the authenticated owner signs out. */
export async function clearRealtimeSessionHandoff(): Promise<void> {
  pending = null;
  await clearStoredHandoff();
}

function compactMessages(messages: unknown[]): CompactMessage[] {
  return messages
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
    .filter(
      (message) =>
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string',
    )
    .slice(-MAX_STORED_MESSAGES)
    .map((message) => ({
      id: message.id as string,
      role: message.role as CompactMessage['role'],
      text: (message.text as string).slice(0, MAX_MESSAGE_TEXT),
    }));
}

function validSession(session: RealtimeSession, savedAt: number): boolean {
  const expiresAt = Date.parse(session.expires_at);
  return (
    Boolean(session.id) &&
    Boolean(session.dog_id) &&
    session.status === 'ACTIVE' &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    Number.isFinite(savedAt) &&
    savedAt > Date.now() - HANDOFF_TTL_MS
  );
}

async function clearStoredHandoff(): Promise<void> {
  try {
    const storage = getHandoffStorage();
    if (!storage) return;
    if (storage.removeItem) await storage.removeItem(STORAGE_KEY);
    else await storage.setItem(STORAGE_KEY, '');
  } catch {
    // Best effort: the in-memory handoff is still cleared by the caller.
  }
}

export async function rememberRealtimeSession<T>(
  session: RealtimeSession,
  messages: T[],
): Promise<void> {
  const savedAt = Date.now();
  pending = { session, messages: [...messages], savedAt };
  try {
    const storage = getHandoffStorage();
    if (!storage) return;
    const stored: StoredHandoff = {
      session,
      messages: compactMessages(messages),
      savedAt,
    };
    await storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Best effort: the handoff remains available while the app process lives.
  }
}

export async function resumeRealtimeSession<T>(
  id: string,
  dogId: string,
): Promise<{ session: RealtimeSession; messages: T[] } | null> {
  const memory = pending;
  pending = null;
  let stored: StoredHandoff | null = null;
  try {
    const storage = getHandoffStorage();
    const raw = await storage?.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as StoredHandoff;
  } catch {
    stored = null;
  }
  await clearStoredHandoff();

  const candidate = memory ?? stored;
  if (
    !candidate ||
    candidate.session.id !== id ||
    candidate.session.dog_id !== dogId ||
    !validSession(candidate.session, candidate.savedAt)
  ) {
    return null;
  }
  return {
    session: candidate.session,
    messages: [...candidate.messages] as T[],
  };
}
