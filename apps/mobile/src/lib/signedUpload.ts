/**
 * PUT su URL firmato Supabase. Su Android `fetch(file://)` non legge il file
 * della fotocamera: usare uploadAsync nativo, come avatar e album.
 */
import {
  FileSystemUploadType,
  uploadAsync,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export async function putSignedUpload(
  uploadUrl: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const fileResponse = await fetch(localUri);
    const body = await fileResponse.blob();
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`Upload firmato fallito (${response.status})`);
    }
    return;
  }

  const uploaded = await uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType },
    uploadType: FileSystemUploadType.BINARY_CONTENT,
  });
  if (uploaded.status < 200 || uploaded.status >= 300) {
    throw new Error(`Upload firmato fallito (${uploaded.status})`);
  }
}
