import { forgetWebClipBlob } from '../../lib/webClipBlob';

export type PendingBehaviorUpload = {
  localUri: string;
  durationMs: number;
  hasAudio: boolean;
  contentType?: string;
  dogId: string;
  returnTo?: 'ask';
  sessionId?: string;
};

let pending: PendingBehaviorUpload | null = null;
const STORAGE_KEY = 'dogly.behavior.pending-upload.v1';
const DRAFT_TTL_MS = 30 * 60 * 1000;

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function clearStoredDraft(storage: Storage | null): void {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

export function setPendingBehaviorUpload(next: PendingBehaviorUpload): void {
  pending = next;
  try { browserStorage()?.setItem(STORAGE_KEY, JSON.stringify({ ...next, savedAt: Date.now() })); } catch { /* best effort */ }
}

export function peekPendingBehaviorUpload(): PendingBehaviorUpload | null {
  if (pending) return pending;
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as (PendingBehaviorUpload & { savedAt?: number }) | null;
    if (!stored || typeof stored.savedAt !== 'number' || stored.savedAt <= Date.now() - DRAFT_TTL_MS) {
      clearStoredDraft(storage);
      return null;
    }
    const { savedAt: _savedAt, ...draft } = stored;
    pending = draft;
    return pending;
  } catch {
    clearStoredDraft(storage);
    return null;
  }
}

export function clearPendingBehaviorUpload(): void {
  const draft = pending ?? peekPendingBehaviorUpload();
  pending = null;
  if (draft?.localUri) forgetWebClipBlob(draft.localUri);
  clearStoredDraft(browserStorage());
}
