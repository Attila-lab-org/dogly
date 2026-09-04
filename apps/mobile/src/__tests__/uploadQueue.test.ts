import {
  ALLOWED_TRANSITIONS,
  createUploadQueue,
  InvalidTransitionError,
  UploadQueueDatabase,
} from '../lib/uploadQueue';
import { MEDIA_UPLOAD_STATES } from '../contracts/types';

/** Fake in-memory dell'interfaccia minima usata dalla coda. */
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
      if (sql.includes("SET state = 'local_pending'") && sql.includes("IN ('upload_initializing', 'uploading')")) {
        let changes = 0;
        for (const r of rows.values()) {
          if (r.state === 'upload_initializing' || r.state === 'uploading') {
            r.state = 'local_pending';
            r.updated_at = params[0];
            changes += 1;
          }
        }
        return { changes };
      }
      if (sql.includes('SET retry_count')) {
        const [retry_count, updated_at, id] = params as [number, string, string];
        const r = rows.get(id)!;
        r.retry_count = retry_count;
        r.updated_at = updated_at;
        return { changes: 1 };
      }
      if (sql.startsWith('UPDATE pending_uploads')) {
        const [state, event_id, upload_url, upload_url_expires_at, last_error, updated_at, id] =
          params as [string, string | null, string | null, string | null, string | null, string, string];
        const r = rows.get(id)!;
        Object.assign(r, { state, event_id, upload_url, upload_url_expires_at, last_error, updated_at });
        return { changes: 1 };
      }
      if (sql.startsWith('DELETE FROM pending_uploads')) {
        const deleted = rows.delete(params[0] as string);
        return { changes: deleted ? 1 : 0 };
      }
      throw new Error(`SQL non gestito dal fake: ${sql}`);
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      const all = [...rows.values()];
      let result: Record<string, unknown>[];
      if (sql.includes('WHERE id = ?')) result = all.filter((r) => r.id === params[0]);
      else if (sql.includes('state NOT IN')) {
        const excluded = params.slice(1) as string[];
        result = all.filter((r) => r.user_id === params[0] && !excluded.includes(r.state as string));
      } else if (sql.includes('WHERE user_id = ?')) result = all.filter((r) => r.user_id === params[0]);
      else result = all;
      return result as T[];
    },
  };
}

function makeQueue() {
  return createUploadQueue(createFakeDb());
}

const baseInput = {
  id: 'up1',
  userId: 'u1',
  dogId: 'd1',
  domain: 'BEHAVIOR' as const,
  localUri: 'file:///clip.mp4',
  clientRequestId: 'req-1',
};

describe('uploadQueue — macchina a stati media (sez. 5.3)', () => {
  it('gli stati canonici sono esattamente quelli della spec', () => {
    expect([...MEDIA_UPLOAD_STATES]).toEqual([
      'local_pending',
      'upload_initializing',
      'uploading',
      'uploaded',
      'processing',
      'completed',
      'recoverable_error',
      'terminal_error',
    ]);
    for (const s of MEDIA_UPLOAD_STATES) {
      expect(ALLOWED_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('percorso felice completo: local_pending → … → completed', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    expect(q.get('up1')!.state).toBe('local_pending');
    q.transitionTo('up1', 'upload_initializing', {
      uploadUrl: 'https://signed-url',
      uploadUrlExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    q.transitionTo('up1', 'uploading');
    q.transitionTo('up1', 'uploaded');
    q.transitionTo('up1', 'processing', { eventId: 'evt-1' });
    const done = q.transitionTo('up1', 'completed');
    expect(done.state).toBe('completed');
    expect(done.eventId).toBe('evt-1');
    expect(q.listActive('u1')).toHaveLength(0);
  });

  it('rifiuta transizioni non consentite', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    expect(() => q.transitionTo('up1', 'completed')).toThrow(InvalidTransitionError);
    expect(() => q.transitionTo('up1', 'processing')).toThrow(InvalidTransitionError);
  });

  it('URL firmato scaduto: recoverable_error → upload_initializing (rinnovo senza ri-registrare)', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    q.transitionTo('up1', 'upload_initializing');
    q.transitionTo('up1', 'uploading');
    const rec = q.markRecoverable('up1', 'UPLOAD_URL_EXPIRED');
    expect(rec.state).toBe('recoverable_error');
    expect(rec.retryCount).toBe(1);
    expect(rec.lastError).toBe('UPLOAD_URL_EXPIRED');
    expect(q.transitionTo('up1', 'upload_initializing').state).toBe('upload_initializing');
  });

  it('recoverInterrupted: riavvio app riporta a local_pending gli upload interrotti', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    q.enqueue({ ...baseInput, id: 'up2', clientRequestId: 'req-2' });
    q.transitionTo('up1', 'upload_initializing');
    q.transitionTo('up1', 'uploading');
    q.transitionTo('up2', 'upload_initializing');
    expect(q.recoverInterrupted()).toBe(2);
    expect(q.get('up1')!.state).toBe('local_pending');
    expect(q.get('up2')!.state).toBe('local_pending');
  });

  it('terminal_error è uno stato finale', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    q.transitionTo('up1', 'terminal_error');
    expect(() => q.transitionTo('up1', 'local_pending')).toThrow(InvalidTransitionError);
    expect(q.listActive('u1')).toHaveLength(0);
  });

  it('listByUser isola per utente e remove elimina', () => {
    const q = makeQueue();
    q.enqueue(baseInput);
    q.enqueue({ ...baseInput, id: 'up2', userId: 'u2', clientRequestId: 'req-2' });
    expect(q.listByUser('u1')).toHaveLength(1);
    q.remove('up1');
    expect(q.get('up1')).toBeNull();
    expect(q.listByUser('u1')).toHaveLength(0);
  });
});
