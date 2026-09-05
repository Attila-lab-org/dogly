import type { AnalysisDomain, MediaUploadState } from '../contracts/types';

/**
 * Coda pending-upload su SQLite (Spec V1 sez. 5.3):
 * i media registrati sopravvivono al riavvio dell'app.
 * L'AI non viene MAI eseguita offline: la coda gestisce solo
 * upload → processing (server) → completamento.
 *
 * Macchina a stati (sez. 5.3):
 * local_pending → upload_initializing → uploading → uploaded → processing
 *   → completed / recoverable_error / terminal_error
 * L'URL firmato scaduto può essere rinnovato senza ri-registrare se il
 * file locale esiste ancora (recoverable_error → upload_initializing).
 */

export interface PendingUpload {
  id: string;
  userId: string;
  dogId: string;
  domain: AnalysisDomain;
  localUri: string;
  state: MediaUploadState;
  /** Idempotenza lato server (sez. 22: unique client_request_id) */
  clientRequestId: string;
  eventId: string | null;
  uploadUrl: string | null;
  uploadUrlExpiresAt: string | null;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Interfaccia minima del DB: permette di testare la coda con un fake in-memory. */
export interface UploadQueueDatabase {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): { changes: number };
  all<T>(sql: string, params?: unknown[]): T[];
}

/** Transizioni consentite della macchina a stati (sez. 5.3). */
export const ALLOWED_TRANSITIONS: Record<MediaUploadState, MediaUploadState[]> = {
  local_pending: ['upload_initializing', 'terminal_error'],
  upload_initializing: ['uploading', 'local_pending', 'recoverable_error', 'terminal_error'],
  uploading: ['uploaded', 'local_pending', 'recoverable_error', 'terminal_error'],
  uploaded: ['processing', 'recoverable_error', 'terminal_error'],
  processing: ['completed', 'recoverable_error', 'terminal_error'],
  completed: [],
  recoverable_error: ['upload_initializing', 'local_pending', 'terminal_error'],
  terminal_error: [],
};

const TERMINAL_STATES: MediaUploadState[] = ['completed', 'terminal_error'];

function rowToUpload(row: Record<string, unknown>): PendingUpload {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    dogId: row.dog_id as string,
    domain: row.domain as AnalysisDomain,
    localUri: row.local_uri as string,
    state: row.state as MediaUploadState,
    clientRequestId: row.client_request_id as string,
    eventId: (row.event_id as string | null) ?? null,
    uploadUrl: (row.upload_url as string | null) ?? null,
    uploadUrlExpiresAt: (row.upload_url_expires_at as string | null) ?? null,
    retryCount: (row.retry_count as number) ?? 0,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class InvalidTransitionError extends Error {
  constructor(from: MediaUploadState, to: MediaUploadState) {
    super(`Transizione upload non consentita: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export interface EnqueueInput {
  id: string;
  userId: string;
  dogId: string;
  domain: AnalysisDomain;
  localUri: string;
  clientRequestId: string;
}

export interface UploadQueue {
  enqueue(input: EnqueueInput): PendingUpload;
  get(id: string): PendingUpload | null;
  transitionTo(
    id: string,
    next: MediaUploadState,
    patch?: Partial<Pick<PendingUpload, 'eventId' | 'uploadUrl' | 'uploadUrlExpiresAt' | 'lastError'>>,
  ): PendingUpload;
  /** Errore recuperabile: incrementa retryCount e salva lastError */
  markRecoverable(id: string, error: string): PendingUpload;
  listByUser(userId: string): PendingUpload[];
  /** Upload che richiedono lavoro (non completati, non terminali) */
  listActive(userId: string): PendingUpload[];
  /**
   * Al riavvio dell'app: upload_initializing/uploading sono stati interrotti
   * dal processo precedente → tornano a local_pending per ripartire.
   */
  recoverInterrupted(): number;
  remove(id: string): void;
}

export function createUploadQueue(db: UploadQueueDatabase): UploadQueue {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      dog_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'local_pending',
      client_request_id TEXT NOT NULL UNIQUE,
      event_id TEXT,
      upload_url TEXT,
      upload_url_expires_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_uploads_user_state
      ON pending_uploads (user_id, state);
  `);

  function mustGet(id: string): PendingUpload {
    const found = queue.get(id);
    if (!found) throw new Error(`Pending upload non trovato: ${id}`);
    return found;
  }

  const queue: UploadQueue = {
    enqueue(input) {
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO pending_uploads
          (id, user_id, dog_id, domain, local_uri, state, client_request_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'local_pending', ?, ?, ?)`,
        [input.id, input.userId, input.dogId, input.domain, input.localUri, input.clientRequestId, now, now],
      );
      return mustGet(input.id);
    },

    get(id) {
      const rows = db.all<Record<string, unknown>>(
        'SELECT * FROM pending_uploads WHERE id = ?',
        [id],
      );
      return rows.length ? rowToUpload(rows[0]) : null;
    },

    transitionTo(id, next, patch = {}) {
      const current = mustGet(id);
      if (!ALLOWED_TRANSITIONS[current.state].includes(next)) {
        throw new InvalidTransitionError(current.state, next);
      }
      const now = new Date().toISOString();
      db.run(
        `UPDATE pending_uploads
           SET state = ?, event_id = ?, upload_url = ?, upload_url_expires_at = ?,
               last_error = ?, updated_at = ?
         WHERE id = ?`,
        [
          next,
          patch.eventId !== undefined ? patch.eventId : current.eventId,
          patch.uploadUrl !== undefined ? patch.uploadUrl : current.uploadUrl,
          patch.uploadUrlExpiresAt !== undefined ? patch.uploadUrlExpiresAt : current.uploadUrlExpiresAt,
          patch.lastError !== undefined ? patch.lastError : current.lastError,
          now,
          id,
        ],
      );
      return mustGet(id);
    },

    markRecoverable(id, error) {
      const current = mustGet(id);
      const next = queue.transitionTo(id, 'recoverable_error', { lastError: error });
      db.run(
        'UPDATE pending_uploads SET retry_count = ?, updated_at = ? WHERE id = ?',
        [current.retryCount + 1, new Date().toISOString(), id],
      );
      return { ...next, retryCount: current.retryCount + 1 };
    },

    listByUser(userId) {
      return db
        .all<Record<string, unknown>>(
          'SELECT * FROM pending_uploads WHERE user_id = ? ORDER BY created_at ASC',
          [userId],
        )
        .map(rowToUpload);
    },

    listActive(userId) {
      const placeholders = TERMINAL_STATES.map(() => '?').join(', ');
      return db
        .all<Record<string, unknown>>(
          `SELECT * FROM pending_uploads
             WHERE user_id = ? AND state NOT IN (${placeholders})
             ORDER BY created_at ASC`,
          [userId, ...TERMINAL_STATES],
        )
        .map(rowToUpload);
    },

    recoverInterrupted() {
      const now = new Date().toISOString();
      const res = db.run(
        `UPDATE pending_uploads SET state = 'local_pending', updated_at = ?
           WHERE state IN ('upload_initializing', 'uploading')`,
        [now],
      );
      return res.changes;
    },

    remove(id) {
      db.run('DELETE FROM pending_uploads WHERE id = ?', [id]);
    },
  };

  return queue;
}

const DB_NAME = 'cbi-pending-uploads.db';

/**
 * Rimuove dalla coda tutte le righe pending per un file locale (es. "Registra
 * di nuovo" dopo un upload fallito): senza rimozione la coda riproverebbe un
 * upload che l'utente ha esplicitamente scartato. Ritorna gli id rimossi.
 */
export function discardUploadsForUri(
  queue: UploadQueue,
  userId: string,
  localUri: string,
): string[] {
  const removed: string[] = [];
  for (const item of queue.listByUser(userId)) {
    if (item.localUri === localUri) {
      queue.remove(item.id);
      removed.push(item.id);
    }
  }
  return removed;
}

let defaultQueue: UploadQueue | null = null;

/** Coda di produzione (SQLite on-device). Lazy: aperta al primo uso. */
export function getUploadQueue(): UploadQueue {
  if (!defaultQueue) {
    // require lazy: expo-sqlite è un modulo nativo e non deve essere caricato
    // in contesti senza runtime nativo (es. unit test jest in node).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
    const native = SQLite.openDatabaseSync(DB_NAME);
    const db: UploadQueueDatabase = {
      exec: (sql) => native.execSync(sql),
      run: (sql, params) => {
        const r = native.runSync(sql, ...(params as never[] ?? []));
        return { changes: r.changes };
      },
      all: (sql, params) => native.getAllSync(sql, ...(params as never[] ?? [])),
    };
    defaultQueue = createUploadQueue(db);
  }
  return defaultQueue;
}
