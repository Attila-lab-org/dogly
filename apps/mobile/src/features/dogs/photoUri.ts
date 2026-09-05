export function isLocalPhotoUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library:')
  );
}

export function contentTypeFromUri(
  uri: string,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  const path = uri.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
