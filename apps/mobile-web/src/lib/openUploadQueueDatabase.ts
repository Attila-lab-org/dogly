import type { UploadQueueDatabase } from './uploadQueue';

const DB_NAME = 'cbi-pending-uploads.db';

export function openUploadQueueDatabase(): UploadQueueDatabase {
  // require lazy: expo-sqlite è un modulo nativo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const native = SQLite.openDatabaseSync(DB_NAME);
  return {
    exec: (sql) => native.execSync(sql),
    run: (sql, params) => {
      const result = native.runSync(sql, ...((params as never[]) ?? []));
      return { changes: result.changes };
    },
    all: (sql, params) => native.getAllSync(sql, ...((params as never[]) ?? [])),
  };
}
