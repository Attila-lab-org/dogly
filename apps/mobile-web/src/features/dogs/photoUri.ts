export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export function isLocalPhotoUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  // ImagePicker can return platform-specific schemes (for example asset:/ on
  // Android). Only already-uploaded remote URLs must be excluded.
  return !/^https?:\/\//i.test(uri);
}

export function contentTypeFromUri(uri: string): ImageContentType {
  const path = uri.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function asImageContentType(value: string | undefined): ImageContentType | null {
  const type = (value ?? '').split(';', 1)[0].toLowerCase();
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') {
    return type;
  }
  if (type === 'image/jpg') return 'image/jpeg';
  return null;
}

/** blob: non ha estensione: il MIME vero sta nel Blob. */
export async function detectImageContentType(uri: string): Promise<ImageContentType> {
  if (uri.startsWith('blob:') || uri.startsWith('http')) {
    try {
      const response = await fetch(uri);
      const fromBlob = asImageContentType((await response.blob()).type);
      if (fromBlob) return fromBlob;
    } catch {
      // fallback sull'estensione
    }
  }
  return contentTypeFromUri(uri);
}
