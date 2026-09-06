/**
 * Pipeline upload comportamentale: coda SQLite → init → PUT firmato → complete.
 * Cancella il file locale solo dopo upload verificato (complete OK).
 */
import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  completeBehaviorCapture,
  initBehaviorCapture,
} from './api';
import { processPendingDigestiveUpload } from '../digestive/upload';
import { putSignedUpload } from '../../lib/signedUpload';
import { discardUploadsForUri, getUploadQueue } from '../../lib/uploadQueue';

const draining = new Set<string>();
let recoverStarted = false;

type VideoContentType = 'video/mp4' | 'video/quicktime' | 'video/webm';
type UploadMeta = {
  durationMs: number;
  hasAudio: boolean;
  contentType: VideoContentType;
  captureId?: string;
};
const uploadMeta = new Map<string, UploadMeta>();

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileBytes(localUri: string): Promise<number> {
  if (localUri.startsWith('blob:') || localUri.startsWith('http')) {
    const response = await fetch(localUri);
    const blob = await response.blob();
    return Math.max(1, blob.size);
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

async function detectVideoContentType(localUri: string): Promise<VideoContentType> {
  if (localUri.startsWith('blob:') || localUri.startsWith('http')) {
    const response = await fetch(localUri);
    const type = (await response.blob()).type.split(';', 1)[0].toLowerCase();
    if (type === 'video/webm' || type === 'video/quicktime') return type;
  }
  return 'video/mp4';
}

async function deleteLocalIfExists(uri: string): Promise<void> {
  if (uri.startsWith('blob:')) {
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
 * Processa un singolo pending upload fino a `processing` (AI lato server).
 * Ritorna eventId quando l'upload è verificato.
 */
export async function processPendingUpload(id: string): Promise<string | null> {
  if (draining.has(id)) return null;
  draining.add(id);
  const queue = getUploadQueue();

  try {
    let item = queue.get(id);
    if (!item) return null;
    if (item.state === 'completed' || item.state === 'terminal_error') {
      return item.eventId;
    }

    if (item.state === 'recoverable_error') {
      item = queue.transitionTo(id, 'upload_initializing');
    } else if (item.state === 'local_pending') {
      item = queue.transitionTo(id, 'upload_initializing');
    }

    item = queue.get(id)!;
    const meta = uploadMeta.get(id) ?? {
      durationMs: 8000,
      hasAudio: true,
      contentType: 'video/mp4',
    };
    const contentType = meta.contentType;

    if (
      item.state === 'upload_initializing' ||
      (item.state === 'uploading' && !item.uploadUrl)
    ) {
      if (item.state !== 'upload_initializing') {
        item = queue.transitionTo(id, 'upload_initializing');
      }
      const bytes = await fileBytes(item.localUri);
      const init = await initBehaviorCapture({
        dog_id: item.dogId,
        client_request_id: item.clientRequestId,
        duration_ms: Math.max(1000, meta.durationMs),
        has_audio: meta.hasAudio,
        bytes,
        content_type: contentType,
        context_bucket: 'UNKNOWN',
      });
      uploadMeta.set(id, { ...meta, captureId: init.capture_id });
      item = queue.transitionTo(id, 'uploading', {
        eventId: init.event_id,
        uploadUrl: init.upload.url,
        uploadUrlExpiresAt: init.upload.expires_at,
      });
    }

    item = queue.get(id)!;

    if (item.state === 'uploading' && item.uploadUrl) {
      const expired =
        item.uploadUrlExpiresAt &&
        Date.parse(item.uploadUrlExpiresAt) < Date.now();
      if (expired) {
        queue.markRecoverable(id, 'URL upload scaduto');
        draining.delete(id);
        return processPendingUpload(id);
      }
      await putSignedUpload(item.uploadUrl, item.localUri, contentType);
      item = queue.transitionTo(id, 'uploaded');
    }

    item = queue.get(id)!;

    if (item.state === 'uploaded') {
      let captureId = uploadMeta.get(id)?.captureId;
      if (!captureId) {
        const bytes = await fileBytes(item.localUri);
        const init = await initBehaviorCapture({
          dog_id: item.dogId,
          client_request_id: item.clientRequestId,
          duration_ms: Math.max(1000, meta.durationMs),
          has_audio: meta.hasAudio,
          bytes,
          content_type: contentType,
          context_bucket: 'UNKNOWN',
        });
        captureId = init.capture_id;
        uploadMeta.set(id, { ...meta, captureId });
        if (init.event_id) {
          queue.transitionTo(id, 'uploaded', { eventId: init.event_id });
        }
      }
      const complete = await completeBehaviorCapture(
        captureId,
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
      getUploadQueue().markRecoverable(id, message);
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

export type EnqueueCaptureInput = {
  userId: string;
  dogId: string;
  localUri: string;
  durationMs: number;
  hasAudio: boolean;
};

/**
 * Enqueue + process. Ritorna eventId quando l'upload è completo e verificato.
 */
export async function enqueueAndUploadBehaviorClip(
  input: EnqueueCaptureInput,
): Promise<{ uploadId: string; eventId: string }> {
  const queue = getUploadQueue();
  const uploadId = newId('upl');
  const clientRequestId = newId('crid');
  const contentType = await detectVideoContentType(input.localUri);
  uploadMeta.set(uploadId, {
    durationMs: input.durationMs,
    hasAudio: input.hasAudio,
    contentType,
  });

  queue.enqueue({
    id: uploadId,
    userId: input.userId,
    dogId: input.dogId,
    domain: 'BEHAVIOR',
    localUri: input.localUri,
    clientRequestId,
  });

  const eventId = await processPendingUpload(uploadId);
  if (!eventId) {
    throw new Error('Upload completato senza eventId');
  }
  return { uploadId, eventId };
}

/** Al boot / resume: recupera interrupted e drena la coda attiva. */
export async function recoverAndDrainUploads(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const queue = getUploadQueue();
  if (!recoverStarted) {
    queue.recoverInterrupted();
    recoverStarted = true;
  }
  const active = queue.listActive(userId);
  for (const item of active) {
    if (
      item.state === 'local_pending' ||
      item.state === 'recoverable_error' ||
      item.state === 'upload_initializing' ||
      item.state === 'uploading' ||
      item.state === 'uploaded'
    ) {
      try {
        if (item.domain === 'DIGESTIVE') {
          await processPendingDigestiveUpload(item.id);
        } else {
          await processPendingUpload(item.id);
        }
      } catch {
        // resta in recoverable; riproverà al prossimo resume
      }
    }
  }
}

/** Quando il polling evento arriva a COMPLETED, chiude la riga coda. */
export function markUploadCompletedForEvent(eventId: string): void {
  const queue = getUploadQueue();
  for (const [uploadId] of uploadMeta) {
    const item = queue.get(uploadId);
    if (item?.eventId === eventId && item.state === 'processing') {
      try {
        queue.transitionTo(uploadId, 'completed');
      } catch {
        // ignore
      }
    }
  }
}

/**
 * "Registra di nuovo" dopo un upload fallito: scarta la riga pending dalla
 * coda SQLite (altrimenti il drain la riproverebbe a ogni resume) e pulisce
 * il file locale scartato.
 */
export async function discardPendingBehaviorClip(
  userId: string,
  localUri: string,
): Promise<void> {
  const removed = discardUploadsForUri(getUploadQueue(), userId, localUri);
  for (const id of removed) uploadMeta.delete(id);
  if (removed.length > 0) await deleteLocalIfExists(localUri);
}
