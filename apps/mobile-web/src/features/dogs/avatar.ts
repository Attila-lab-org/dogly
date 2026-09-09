/**
 * Upload avatar cane: init firmato → PUT → complete (stesso pattern dei clip).
 */
import { getInfoAsync } from 'expo-file-system/legacy';

import { putSignedUpload } from '../../lib/signedUpload';
import { completeDogAvatar, initDogAvatar } from './api';
import { contentTypeFromUri } from './photoUri';

export { contentTypeFromUri, isLocalPhotoUri } from './photoUri';

async function localBytes(localUri: string): Promise<number | undefined> {
  try {
    const info = await getInfoAsync(localUri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return Math.max(1, info.size);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Salva la foto locale sul backend. Ritorna l'URL firmato di lettura. */
export async function persistDogAvatar(
  dogId: string,
  localUri: string,
): Promise<string | null> {
  const contentType = contentTypeFromUri(localUri);
  const bytes = await localBytes(localUri);
  const init = await initDogAvatar(dogId, {
    content_type: contentType,
    bytes,
  });
  await putSignedUpload(init.upload.url, localUri, contentType);
  const completed = await completeDogAvatar(dogId, {
    storage_path: init.storage_path,
    bytes,
  });
  return completed.photo_url;
}
