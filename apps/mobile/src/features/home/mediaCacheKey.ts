/**
 * Cache key for signed Storage URLs: drop the signature query so remints
 * of the same object do not bust Image / thumbnail / tint caches.
 */
export function mediaCacheKey(uri: string): string {
  const bare = uri.split('?')[0] ?? uri;
  return bare;
}
