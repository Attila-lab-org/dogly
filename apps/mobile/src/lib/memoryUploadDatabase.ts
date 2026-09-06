import type { UploadQueueDatabase } from './uploadQueue';

/** Coda in memoria per web/test: expo-sqlite su browser non è disponibile. */
export function createMemoryUploadDatabase(): UploadQueueDatabase {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    exec: () => undefined,
    run(sql, params = []) {
      if (sql.includes('INSERT INTO pending_uploads')) {
        const [
          id,
          user_id,
          dog_id,
          domain,
          local_uri,
          client_request_id,
          created_at,
          updated_at,
        ] = params as string[];
        rows.set(id, {
          id,
          user_id,
          dog_id,
          domain,
          local_uri,
          state: 'local_pending',
          client_request_id,
          event_id: null,
          upload_url: null,
          upload_url_expires_at: null,
          retry_count: 0,
          last_error: null,
          created_at,
          updated_at,
        });
        return { changes: 1 };
      }
      if (
        sql.includes("SET state = 'local_pending'") &&
        sql.includes("IN ('upload_initializing', 'uploading')")
      ) {
        let changes = 0;
        for (const row of rows.values()) {
          if (row.state === 'upload_initializing' || row.state === 'uploading') {
            row.state = 'local_pending';
            row.updated_at = params[0];
            changes += 1;
          }
        }
        return { changes };
      }
      if (sql.includes('SET retry_count')) {
        const [retry_count, updated_at, id] = params as [number, string, string];
        const row = rows.get(id);
        if (!row) return { changes: 0 };
        row.retry_count = retry_count;
        row.updated_at = updated_at;
        return { changes: 1 };
      }
      if (sql.includes('UPDATE pending_uploads')) {
        const [
          state,
          event_id,
          upload_url,
          upload_url_expires_at,
          last_error,
          updated_at,
          id,
        ] = params as [
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
        ];
        const row = rows.get(id);
        if (!row) return { changes: 0 };
        Object.assign(row, {
          state,
          event_id,
          upload_url,
          upload_url_expires_at,
          last_error,
          updated_at,
        });
        return { changes: 1 };
      }
      if (sql.includes('DELETE FROM pending_uploads')) {
        return { changes: rows.delete(params[0] as string) ? 1 : 0 };
      }
      return { changes: 0 };
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      const all = [...rows.values()];
      let result = all;
      if (sql.includes('WHERE id = ?')) {
        result = all.filter((row) => row.id === params[0]);
      } else if (sql.includes('state NOT IN')) {
        const excluded = params.slice(1) as string[];
        result = all.filter(
          (row) =>
            row.user_id === params[0] && !excluded.includes(row.state as string),
        );
      } else if (sql.includes('WHERE user_id = ?')) {
        result = all.filter((row) => row.user_id === params[0]);
      }
      return result as T[];
    },
  };
}
