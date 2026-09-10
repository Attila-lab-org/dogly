export type PendingBehaviorUpload = {
  localUri: string;
  durationMs: number;
  hasAudio: boolean;
  contentType?: string;
  dogId: string;
};

let pending: PendingBehaviorUpload | null = null;

export function setPendingBehaviorUpload(next: PendingBehaviorUpload): void {
  pending = next;
}

export function peekPendingBehaviorUpload(): PendingBehaviorUpload | null {
  return pending;
}

export function clearPendingBehaviorUpload(): void {
  pending = null;
}
