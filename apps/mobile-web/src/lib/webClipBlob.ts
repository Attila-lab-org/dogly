/**
 * Tiene il Blob del video in memoria. Su web, chiudere la telecamera può
 * invalidare l'URL blob: — i byte restano qui per l'invio.
 */
const blobs = new Map<string, Blob>();

export function rememberWebClipBlob(uri: string, blob: Blob): void {
  blobs.set(uri, blob);
}

export function peekWebClipBlob(uri: string): Blob | undefined {
  return blobs.get(uri);
}

export function forgetWebClipBlob(uri: string): void {
  blobs.delete(uri);
}
