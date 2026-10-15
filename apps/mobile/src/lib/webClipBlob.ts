/**
 * Keeps the web video available after leaving the camera route. The memory
 * map is the fast path; IndexedDB is a best-effort recovery path for a page
 * reload while the upload screen is open.
 */
const blobs = new Map<string, Blob>();
const DB_NAME = 'dogly-media';
const STORE_NAME = 'clips';

type StoredClip = { uri: string; blob: Blob };

function openClipDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'uri' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function rememberWebClipBlob(uri: string, blob: Blob): void {
  blobs.set(uri, blob);
  void openClipDb().then((db) => {
    if (!db) return;
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ uri, blob } satisfies StoredClip);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    } catch {
      db.close();
    }
  });
}

export function peekWebClipBlob(uri: string): Blob | undefined {
  return blobs.get(uri);
}

export async function restoreWebClipBlob(uri: string): Promise<Blob | undefined> {
  const inMemory = blobs.get(uri);
  if (inMemory) return inMemory;
  const db = await openClipDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(uri);
      request.onsuccess = () => {
        const stored = request.result as StoredClip | undefined;
        if (stored?.blob) blobs.set(uri, stored.blob);
        db.close();
        resolve(stored?.blob);
      };
      request.onerror = () => { db.close(); resolve(undefined); };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

export function forgetWebClipBlob(uri: string): void {
  blobs.delete(uri);
  void openClipDb().then((db) => {
    if (!db) return;
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(uri);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    } catch {
      db.close();
    }
  });
}
