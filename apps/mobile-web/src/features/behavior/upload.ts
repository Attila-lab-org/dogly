/**
 * Pipeline upload comportamentale: coda SQLite → init → PUT firmato → complete.
 * Cancella il file locale solo dopo upload verificato (complete OK).
 */
import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  completeBehaviorCapture,
  getBehaviorEvent,
  initBehaviorCapture,
  isTerminalBehaviorStatus,
} from './api';
import { deriveContextBucketHint } from './contextBucket';
import { processPendingDigestiveUpload } from '../digestive/upload';
import { persistTodayVsUsual } from '../checkin/sync';
import { getCheckInSnapshot } from '../checkin/store';
import { putSignedUpload } from '../../lib/signedUpload';
import {
  activeUploadForUri,
  discardUploadsForUri,
  getUploadQueue,
  markUploadsCompletedForEvent,
  recordUploadFailure,
  uploadRetryDelayMs,
} from '../../lib/uploadQueue';

const draining = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();
let recoverStarted = false;

type VideoContentType = 'video/mp4' | 'video/quicktime' | 'video/webm';

function asVideoContentType(value?: string | null): VideoContentType | null {
  const type = (value ?? '').split(';', 1)[0].toLowerCase();
  if (type === 'video/webm' || type === 'video/quicktime' || type === 'video/mp4') {
    return type;
  }
  return null;
}

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
    // handled below
  }
  throw new Error(
    'Non riesco a leggere il video sul dispositivo. Registralo di nuovo.',
  );
}

async function detectVideoContentType(localUri: string): Promise<VideoContentType> {
  if (localUri.startsWith('blob:') || localUri.startsWith('http')) {
    const response = await fetch(localUri);
    const fromBlob = asVideoContentType((await response.blob()).type);
    if (fromBlob) return fromBlob;
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
 *
 * Concorrenza: se un drain in background sta già processando questo id,
 * le chiamate concorrenti (es. retry utente) condividono la stessa promise
 * invece di ricevere `null` e lanciare un errore spurio "Upload completato
 * senza eventId".
 */
export async function processPendingUpload(id: string): Promise<string | null> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const promise = processPendingUploadInner(id);
  inflight.set(id, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(id);
  }
}

async function processPendingUploadInner(id: string): Promise<string | null> {
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
    const durationMs = item.durationMs ?? 8_000;
    const hasAudio = item.hasAudio ?? true;
    const contentType = (item.contentType ?? 'video/mp4') as VideoContentType;
    const checkIn = getCheckInSnapshot().analysisContext;
    if (checkIn?.dogId === item.dogId) {
      await persistTodayVsUsual(item.dogId, checkIn, false).catch(() => {
        // Offline: the local banner remains; the next upload retries.
      });
    }

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
        duration_ms: Math.max(1000, durationMs),
        has_audio: hasAudio,
        bytes,
        content_type: contentType,
        context_bucket: deriveContextBucketHint(),
      });
      item = queue.transitionTo(id, 'uploading', {
        eventId: init.event_id,
        uploadUrl: init.upload.url,
        uploadUrlExpiresAt: init.upload.expires_at,
        captureId: init.capture_id,
      });
    }

    item = queue.get(id)!;

    if (item.state === 'uploading' && item.uploadUrl) {
      const expired =
        item.uploadUrlExpiresAt &&
        Date.parse(item.uploadUrlExpiresAt) < Date.now();
      if (expired) {
        throw new Error('URL upload scaduto');
      }
      // FIX 1.5: a previous PUT may have succeeded but the response was lost
      // (network drop mid-flight). On retry, re-PUTting the same path can
      // fail if the object already exists. Try the PUT; if it fails, attempt
      // complete_capture directly — the backend verifies object_exists and
      // will proceed if the bytes are already there.
      try {
        await putSignedUpload(item.uploadUrl, item.localUri, contentType);
      } catch (putError) {
        let captureId = item.captureId;
        if (!captureId) {
          // Should not happen in uploading state, but guard anyway.
          throw putError;
        }
        try {
          const complete = await completeBehaviorCapture(
            captureId,
            `${item.clientRequestId}:complete`,
          );
          // Object already existed: backend verified it. Skip to processing.
          item = queue.transitionTo(id, 'uploaded', {
            eventId: complete.event_id,
          });
          item = queue.transitionTo(id, 'processing', {
            eventId: complete.event_id,
          });
          await deleteLocalIfExists(item.localUri);
          return item.eventId;
        } catch {
          // complete failed too: the object really isn't there. Re-throw the
          // original PUT error so the queue records a recoverable failure.
          throw putError;
        }
      }
      item = queue.transitionTo(id, 'uploaded');
    }

    item = queue.get(id)!;

    if (item.state === 'uploaded') {
      let captureId = item.captureId;
      if (!captureId) {
        const bytes = await fileBytes(item.localUri);
        const init = await initBehaviorCapture({
          dog_id: item.dogId,
          client_request_id: item.clientRequestId,
          duration_ms: Math.max(1000, durationMs),
          has_audio: hasAudio,
          bytes,
          content_type: contentType,
          context_bucket: deriveContextBucketHint(),
        });
        captureId = init.capture_id;
        queue.transitionTo(id, 'uploaded', {
          eventId: init.event_id,
          captureId,
        });
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

export type EnqueueCaptureInput = {
  userId: string;
  dogId: string;
  localUri: string;
  durationMs: number;
  hasAudio: boolean;
  contentType?: string;
};

/**
 * Enqueue + process. Ritorna eventId quando l'upload è completo e verificato.
 */
export async function enqueueAndUploadBehaviorClip(
  input: EnqueueCaptureInput,
): Promise<{ uploadId: string; eventId: string }> {
  const queue = getUploadQueue();
  const existing = activeUploadForUri(
    queue,
    input.userId,
    'BEHAVIOR',
    input.localUri,
  );
  if (existing) {
    const eventId = await processPendingUpload(existing.id);
    if (!eventId) throw new Error('Retry upload senza eventId');
    return { uploadId: existing.id, eventId };
  }

  const uploadId = newId('upl');
  const clientRequestId = newId('crid');
  const contentType =
    asVideoContentType(input.contentType) ??
    (await detectVideoContentType(input.localUri));
  queue.enqueue({
    id: uploadId,
    userId: input.userId,
    dogId: input.dogId,
    domain: 'BEHAVIOR',
    localUri: input.localUri,
    clientRequestId,
    durationMs: input.durationMs,
    hasAudio: input.hasAudio,
    contentType,
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
      item.domain === 'BEHAVIOR' &&
      item.state === 'processing' &&
      item.eventId
    ) {
      try {
        const event = await getBehaviorEvent(item.eventId);
        if (isTerminalBehaviorStatus(event.status)) {
          queue.transitionTo(item.id, 'completed');
        }
      } catch {
        // Stato remoto non disponibile: sarà riconciliato al prossimo resume.
      }
      continue;
    }
    if (
      item.state === 'local_pending' ||
      item.state === 'recoverable_error' ||
      item.state === 'upload_initializing' ||
      item.state === 'uploading' ||
      item.state === 'uploaded'
    ) {
      try {
        const delayMs = uploadRetryDelayMs(item.retryCount);
        const elapsedMs = Date.now() - Date.parse(item.updatedAt);
        if (delayMs > elapsedMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayMs - elapsedMs),
          );
        }
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
  markUploadsCompletedForEvent(getUploadQueue(), eventId);
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
  if (removed.length > 0) await deleteLocalIfExists(localUri);
}
