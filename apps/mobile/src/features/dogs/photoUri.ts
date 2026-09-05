export function isLocalPhotoUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  // ImagePicker can return platform-specific schemes (for example asset:/ on
  // Android). Only already-uploaded remote URLs must be excluded.
  return !/^https?:\/\//i.test(uri);
}

export function contentTypeFromUri(
  uri: string,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  const path = uri.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
