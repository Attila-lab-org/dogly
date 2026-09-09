/**
 * PUT su URL firmato Supabase. Su Android `fetch(file://)` non legge il file
 * della fotocamera: usare uploadAsync nativo, come avatar e album.
 */
import {
  createUploadTask,
  FileSystemUploadType,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { createRequestTimeout } from './requestTimeout';

export const SIGNED_UPLOAD_TIMEOUT_MS = 60_000;

export async function putSignedUpload(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  timeoutMs = SIGNED_UPLOAD_TIMEOUT_MS,
): Promise<void> {
  if (Platform.OS === 'web') {
    const timeout = createRequestTimeout(timeoutMs);
    try {
      const fileResponse = await fetch(localUri, {
        signal: timeout.controller.signal,
      });
      const body = await fileResponse.blob();
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body,
        signal: timeout.controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Upload firmato fallito (${response.status})`);
      }
    } catch (error) {
      if (timeout.controller.signal.aborted) {
        throw new Error('Upload scaduto. Controlla la connessione e riprova.');
      }
      throw error;
    } finally {
      timeout.clear();
    }
    return;
  }

  const task = createUploadTask(uploadUrl, localUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType },
    uploadType: FileSystemUploadType.BINARY_CONTENT,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void task.cancelAsync();
  }, timeoutMs);
  let uploaded;
  try {
    uploaded = await task.uploadAsync();
  } catch (error) {
    if (timedOut) {
      throw new Error('Upload scaduto. Controlla la connessione e riprova.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (timedOut || !uploaded) {
    throw new Error('Upload scaduto. Controlla la connessione e riprova.');
  }
  if (uploaded.status < 200 || uploaded.status >= 300) {
    throw new Error(`Upload firmato fallito (${uploaded.status})`);
  }
}
