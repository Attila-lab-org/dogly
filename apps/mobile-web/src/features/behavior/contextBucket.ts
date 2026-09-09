import type { ContextBucket } from '../../contracts/types';

/**
 * Client-side hint only. The video is the source of truth: unless the hour
 * strongly suggests rest, send UNKNOWN and let the backend derive PLAY /
 * DOOR_EXIT / FEEDING from the observation (backend task 47).
 */
export function deriveContextBucketHint(now: Date = new Date()): ContextBucket {
  const hour = now.getHours();
  if (hour >= 22 || hour < 6) return 'REST';
  return 'UNKNOWN';
}
