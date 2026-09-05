/**
 * Upload avatar cane: init firmato → PUT → complete (stesso pattern dei clip).
 */
import {
  FileSystemUploadType,
  getInfoAsync,
  uploadAsync,
} from 'expo-file-system/legacy';

import { completeDogAvatar, initDogAvatar } from './api';
import { contentTypeFromUri } from './photoUri';

export { contentTypeFromUri, isLocalPhotoUri } from './photoUri';

async function fileBytes(localUri: string): Promise<number> {
  try {
    const info = await getInfoAsync(localUri);
    if (
      info.exists &&
      'size' in info &&
      typeof info.size === 'number' &&
      info.size > 0
    ) {
      return info.size;
    }
  } catch {
    // L'errore esplicito sotto evita di dichiarare una dimensione falsa.
  }
  throw new Error('Non riesco a leggere il file scelto. Prova con un’altra foto.');
}

async function putSignedUpload(
  uploadUrl: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  const response = await uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType },
    uploadType: FileSystemUploadType.BINARY_CONTENT,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload avatar fallito (${response.status})`);
  }
}

/** Salva la foto locale sul backend. Ritorna l'URL firmato di lettura. */
export async function persistDogAvatar(
  dogId: string,
  localUri: string,
): Promise<string | null> {
  const contentType = contentTypeFromUri(localUri);
  const bytes = await fileBytes(localUri);
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
