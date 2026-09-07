/**
 * Pipeline upload digestivo: coda SQLite (domain DIGESTIVE) → init →
 * PUT firmato → complete. Specchio del flusso behavior: il file locale
 * viene cancellato solo dopo upload verificato (complete OK).
 */
import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { completeFecalCapture, initFecalCapture } from './api';
import { putSignedUpload } from '../../lib/signedUpload';
import {
  activeUploadForUri,
  discardUploadsForUri,
  getUploadQueue,
  markUploadsCompletedForEvent,
  recordUploadFailure,
} from '../../lib/uploadQueue';
import { contentTypeFromUri } from '../dogs/photoUri';

const draining = new Set<string>();

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileBytes(localUri: string): Promise<number> {
  if (
    Platform.OS === 'web' &&
    (localUri.startsWith('blob:') || localUri.startsWith('http'))
  ) {
    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error(`Lettura foto fallita (${response.status})`);
    }
    return Math.max(1, (await response.blob()).size);
  }

  try {
    const info = await getInfoAsync(localUri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return Math.max(1, info.size);
    }
  } catch {
    // fallback
  }
  return 1;
}

async function deleteLocalIfExists(uri: string): Promise<void> {
  if (Platform.OS === 'web' && uri.startsWith('blob:')) {
    URL.revokeObjectURL(uri);
    return;
  }

  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {
    // già rimosso
  }
}

/**
 * Processa un pending digestivo fino a `processing` (analisi lato server).
 * Ritorna eventId quando l'upload è verificato. Il complete digestivo è
 * keyato su event_id (non capture_id come behavior).
 */
export async function processPendingDigestiveUpload(
  id: string,
  onInitialized?: (eventId: string) => void,
): Promise<string | null> {
  if (draining.has(id)) return null;
  draining.add(id);
  const queue = getUploadQueue();
  let initializedNotified = false;
  const notifyInitialized = (eventId: string) => {
    if (initializedNotified) return;
    initializedNotified = true;
    onInitialized?.(eventId);
  };

  try {
    let item = queue.get(id);
    if (!item) return null;
    if (item.state === 'completed' || item.state === 'terminal_error') {
      return item.eventId;
    }

    if (
      item.state === 'recoverable_error' ||
      item.state === 'local_pending'
    ) {
      item = queue.transitionTo(id, 'upload_initializing');
    }

    const contentType = contentTypeFromUri(item.localUri);

    if (
      item.state === 'upload_initializing' ||
      (item.state === 'uploading' && !item.uploadUrl)
    ) {
      if (item.state !== 'upload_initializing') {
        item = queue.transitionTo(id, 'upload_initializing');
      }
      const bytes = await fileBytes(item.localUri);
      const init = await initFecalCapture({
        dog_id: item.dogId,
        client_request_id: item.clientRequestId,
        bytes,
        content_type: contentType,
      });
      item = queue.transitionTo(id, 'uploading', {
        eventId: init.event_id,
        uploadUrl: init.upload.url,
        uploadUrlExpiresAt: init.upload.expires_at,
      });
      notifyInitialized(init.event_id);
    }

    item = queue.get(id)!;
    if (item.eventId) notifyInitialized(item.eventId);

    if (item.state === 'uploading' && item.uploadUrl) {
      const expired =
        item.uploadUrlExpiresAt &&
        Date.parse(item.uploadUrlExpiresAt) < Date.now();
      if (expired) {
        throw new Error('URL upload scaduto');
      }
      await putSignedUpload(item.uploadUrl, item.localUri, contentType);
      item = queue.transitionTo(id, 'uploaded');
    }

    item = queue.get(id)!;

    if (item.state === 'uploaded') {
      const eventId = item.eventId;
      if (!eventId) {
        throw new Error('Upload digestivo senza eventId dopo init');
      }
      const complete = await completeFecalCapture(
        eventId,
        `${item.clientRequestId}:complete`,
      );
      item = queue.transitionTo(id, 'processing', {
        eventId: complete.event_id,
      });
      await deleteLocalIfExists(item.localUri);
    }

    item = queue.get(id)!;
    return item.eventId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload fallito';
    try {
      recordUploadFailure(getUploadQueue(), id, message);
    } catch {
      try {
        getUploadQueue().transitionTo(id, 'terminal_error', {
          lastError: message,
        });
      } catch {
        // ignore
      }
    }
    throw err;
  } finally {
    draining.delete(id);
  }
}

export type EnqueueDigestivePhotoInput = {
  userId: string;
  dogId: string;
  localUri: string;
  onInitialized?: (eventId: string, uploadId: string) => void;
};

/** Enqueue + process. Ritorna eventId quando l'upload è verificato. */
export async function enqueueAndUploadDigestivePhoto(
  input: EnqueueDigestivePhotoInput,
): Promise<{ uploadId: string; eventId: string }> {
  const queue = getUploadQueue();
  const existing = activeUploadForUri(
    queue,
    input.userId,
    'DIGESTIVE',
    input.localUri,
  );
  if (existing) {
    const eventId = await processPendingDigestiveUpload(
      existing.id,
      (initializedEventId) =>
        input.onInitialized?.(initializedEventId, existing.id),
    );
    if (!eventId) throw new Error('Retry upload digestivo senza eventId');
    return { uploadId: existing.id, eventId };
  }

  const uploadId = newId('upl');
  const clientRequestId = newId('crid');

  queue.enqueue({
    id: uploadId,
    userId: input.userId,
    dogId: input.dogId,
    domain: 'DIGESTIVE',
    localUri: input.localUri,
    clientRequestId,
  });

  const eventId = await processPendingDigestiveUpload(
    uploadId,
    (initializedEventId) =>
      input.onInitialized?.(initializedEventId, uploadId),
  );
  if (!eventId) {
    throw new Error('Upload completato senza eventId');
  }
  return { uploadId, eventId };
}

export function markDigestiveUploadCompletedForEvent(eventId: string): void {
  markUploadsCompletedForEvent(getUploadQueue(), eventId);
}

/**
 * "Rifai la foto" dopo un upload fallito: scarta la riga pending dalla
 * coda SQLite e pulisce il file locale scartato.
 */
export async function discardPendingDigestivePhoto(
  userId: string,
  localUri: string,
): Promise<void> {
  const removed = discardUploadsForUri(getUploadQueue(), userId, localUri);
  if (removed.length > 0) await deleteLocalIfExists(localUri);
}
