/**
 * Test "mai finto successo" (gap audit):
 * - fix 1: il feedback a 3 vie propaga l'errore invece di accendere "Salvato";
 * - fix 2: la processing mock rispetta gli stati terminali/retry richiesti;
 * - fix 4: "Registra di nuovo" scarta la riga pending dalla coda upload;
 * - fix 3: payload della notifica "risultato pronto" con data.href.
 */
import { saveBehaviorFeedback } from '../features/core/feedback';
import { mockProcessingAction } from '../features/behavior/processing';
import { buildResultReadyContent } from '../features/behavior/notify';
import {
  createUploadQueue,
  discardUploadsForUri,
  UploadQueueDatabase,
} from '../lib/uploadQueue';
import { behaviorResultsMock } from '../mocks/core';

jest.mock('../features/behavior/api', () => ({
  postBehaviorFeedback: jest.fn(),
}));

import { postBehaviorFeedback } from '../features/behavior/api';

const postFeedbackMock = postBehaviorFeedback as jest.Mock;

/** Fake in-memory dell'interfaccia minima usata dalla coda (come uploadQueue.test). */
function createFakeDb(): UploadQueueDatabase {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    exec: () => {},
    run(sql, params = []) {
      if (sql.startsWith('INSERT INTO pending_uploads')) {
        const [id, user_id, dog_id, domain, local_uri, client_request_id, created_at, updated_at] =
          params as string[];
        rows.set(id, {
          id, user_id, dog_id, domain, local_uri,
          state: 'local_pending', client_request_id,
          event_id: null, upload_url: null, upload_url_expires_at: null,
          retry_count: 0, last_error: null, created_at, updated_at,
        });
        return { changes: 1 };
      }
      if (sql.startsWith('DELETE FROM pending_uploads')) {
        const deleted = rows.delete(params[0] as string);
        return { changes: deleted ? 1 : 0 };
      }
      if (sql.startsWith('UPDATE pending_uploads')) {
        const [state, event_id, upload_url, upload_url_expires_at, last_error, updated_at, id] =
          params as [string, string | null, string | null, string | null, string | null, string, string];
        const r = rows.get(id)!;
        Object.assign(r, { state, event_id, upload_url, upload_url_expires_at, last_error, updated_at });
        return { changes: 1 };
      }
      throw new Error(`SQL non gestito dal fake: ${sql}`);
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      const all = [...rows.values()];
      let result: Record<string, unknown>[];
      if (sql.includes('WHERE id = ?')) result = all.filter((r) => r.id === params[0]);
      else if (sql.includes('WHERE user_id = ?')) result = all.filter((r) => r.user_id === params[0]);
      else result = all;
      return result as T[];
    },
  };
}

describe('fix 1 — feedback a 3 vie onesto (mai finto "Salvato")', () => {
  afterEach(() => {
    postFeedbackMock.mockReset();
  });

  it('in mock gate (eventi demo evt-*) salva solo in locale', async () => {
    const result = behaviorResultsMock['evt-play'];
    const previous = result.feedback;
    await expect(saveBehaviorFeedback('evt-play', 'YES')).resolves.toBe('YES');
    expect(result.feedback).toBe('YES');
    expect(postFeedbackMock).not.toHaveBeenCalled();
    result.feedback = previous;
  });

  it('successo reale → ritorna il valore salvato dal server', async () => {
    postFeedbackMock.mockResolvedValue({
      event_id: 'real-event-1',
      value: 'NO',
      recorded: true,
    });
    await expect(saveBehaviorFeedback('real-event-1', 'NO')).resolves.toBe('NO');
    expect(postFeedbackMock).toHaveBeenCalledWith('real-event-1', 'NO');
  });

  it('POST fallita (offline/errore API) → rigetta, nessun finto salvataggio', async () => {
    postFeedbackMock.mockRejectedValue(new Error('offline'));
    await expect(saveBehaviorFeedback('real-event-2', 'YES')).rejects.toThrow(
      'offline',
    );
    // nessuna patch locale su un evento non mock
    expect(behaviorResultsMock['real-event-2']).toBeUndefined();
  });

  it('API non configurata (mock gate dev senza backend) → solo locale', async () => {
    postFeedbackMock.mockRejectedValue(
      new Error('EXPO_PUBLIC_API_URL non configurata: imposta l’URL'),
    );
    await expect(
      saveBehaviorFeedback('real-event-3', 'UNKNOWN'),
    ).resolves.toBe('UNKNOWN');
  });
});

describe('fix 2 — processing mock: mai redirect forzato a evt-play', () => {
  it('gli stati terminali mock restano visibili (stay)', () => {
    expect(
      mockProcessingAction({ eventId: 'evt-rejected', status: 'REJECTED_QUALITY' }),
    ).toEqual({ type: 'stay' });
    expect(
      mockProcessingAction({ eventId: 'evt-failed', status: 'FAILED_TERMINAL' }),
    ).toEqual({ type: 'stay' });
  });

  it('il retry automatico resta con il banner (stay, nessun finto completamento)', () => {
    expect(
      mockProcessingAction({ eventId: 'evt-retrying', status: 'FAILED_RETRYABLE' }),
    ).toEqual({ type: 'stay' });
  });

  it('un mock COMPLETED va al proprio risultato, non a evt-play', () => {
    expect(
      mockProcessingAction({ eventId: 'evt-ambiguous', status: 'COMPLETED' }),
    ).toEqual({ type: 'redirect-result', eventId: 'evt-ambiguous' });
  });

  it('solo gli stati in-progress simulano la pipeline che completa', () => {
    expect(
      mockProcessingAction({ eventId: 'evt-processing', status: 'OBSERVING' }),
    ).toEqual({ type: 'simulate-progress' });
    expect(
      mockProcessingAction({ eventId: 'evt-queued', status: 'QUEUED' }),
    ).toEqual({ type: 'simulate-progress' });
  });
});

describe('fix 4 — "Registra di nuovo" scarta la riga pending dalla coda', () => {
  const baseInput = {
    userId: 'u1',
    dogId: 'd1',
    domain: 'BEHAVIOR' as const,
    localUri: 'file:///clip.mp4',
  };

  it('rimuove tutte le righe pending per il file scartato', () => {
    const queue = createUploadQueue(createFakeDb());
    queue.enqueue({ ...baseInput, id: 'up1', clientRequestId: 'req-1' });
    queue.enqueue({ ...baseInput, id: 'up2', clientRequestId: 'req-2' });
    queue.enqueue({
      ...baseInput,
      id: 'up3',
      clientRequestId: 'req-3',
      localUri: 'file:///altro.mp4',
    });

    const removed = discardUploadsForUri(queue, 'u1', 'file:///clip.mp4');

    expect(removed.sort()).toEqual(['up1', 'up2']);
    expect(queue.get('up1')).toBeNull();
    expect(queue.get('up2')).toBeNull();
    expect(queue.get('up3')).not.toBeNull();
    expect(queue.listByUser('u1')).toHaveLength(1);
  });

  it('non tocca le righe di altri utenti con lo stesso file', () => {
    const queue = createUploadQueue(createFakeDb());
    queue.enqueue({ ...baseInput, id: 'up1', clientRequestId: 'req-1' });
    queue.enqueue({
      ...baseInput,
      id: 'up2',
      userId: 'u2',
      clientRequestId: 'req-2',
    });

    discardUploadsForUri(queue, 'u1', 'file:///clip.mp4');

    expect(queue.get('up1')).toBeNull();
    expect(queue.get('up2')).not.toBeNull();
  });

  it('senza righe corrispondenti è un no-op', () => {
    const queue = createUploadQueue(createFakeDb());
    expect(discardUploadsForUri(queue, 'u1', 'file:///inesistente.mp4')).toEqual([]);
  });
});

describe('fix 3 — notifica "risultato pronto" (payload e deep link)', () => {
  it('porta data.href al risultato e personalizza col nome del cane', () => {
    const content = buildResultReadyContent('evt-123', 'Luna');
    expect(content.data.href).toBe('/behavior/result/evt-123');
    expect(content.title).toContain('Luna');
    expect(content.body).toContain('Luna');
  });
});
