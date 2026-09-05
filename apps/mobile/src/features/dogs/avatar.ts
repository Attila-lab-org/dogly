/**
 * Upload avatar cane: init firmato → PUT → complete (stesso pattern dei clip).
 */
import {
  FileSystemUploadType,
  uploadAsync,
} from 'expo-file-system/legacy';

import { completeDogAvatar, initDogAvatar } from './api';
import { contentTypeFromUri } from './photoUri';

export { contentTypeFromUri, isLocalPhotoUri } from './photoUri';

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
  const init = await initDogAvatar(dogId, {
    content_type: contentType,
  });
  await putSignedUpload(init.upload.url, localUri, contentType);
  const completed = await completeDogAvatar(dogId, {
    storage_path: init.storage_path,
  });
  return completed.photo_url;
}
