/** A one-shot Home message. Only an opaque ID travels through navigation. */
type PendingMessage = {
  id: string;
  ownerId: string;
  dogId: string;
  text: string;
  createdAt: number;
};
const MAX_AGE_MS = 5 * 60 * 1000;
let pending: PendingMessage | null = null;

export function prepareHomeMessage(ownerId: string, dogId: string, text: string): string | null {
  const trimmed = text.trim();
  if (!ownerId || !dogId || !trimmed || trimmed.length > 4000) return null;
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  pending = { id, ownerId, dogId, text: trimmed, createdAt: Date.now() };
  return id;
}

export function readHomeMessage(id: string | null | undefined, ownerId: string | null, dogId: string): string | null {
  if (!pending || !id) return null;
  if (Date.now() - pending.createdAt >= MAX_AGE_MS) {
    pending = null;
    return null;
  }
  if (pending.id !== id || pending.ownerId !== ownerId || pending.dogId !== dogId) return null;
  return pending.text;
}

export function takeHomeMessage(id: string | null | undefined, ownerId: string | null, dogId: string): string | null {
  const text = readHomeMessage(id, ownerId, dogId);
  if (text !== null) pending = null;
  return text;
}

export function clearHomeMessage(): void {
  pending = null;
}
