/**
 * Boundary di persistenza locale chiave/valore (AsyncStorage).
 * Il require è lazy e protetto: in ambienti senza modulo nativo (test node,
 * web senza polyfill) resta null e gli store ricadono sulla memoria.
 * I test iniettano uno storage fake via setKeyValueStorageForTests.
 */

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let storageOverride: KeyValueStorage | null = null;

/** Solo test: inietta uno storage fake (null per tornare al lazy require). */
export function setKeyValueStorageForTests(
  storage: KeyValueStorage | null,
): void {
  storageOverride = storage;
}

export function getKeyValueStorage(): KeyValueStorage | null {
  if (storageOverride) return storageOverride;
  try {
    const mod = require('@react-native-async-storage/async-storage') as
      | (KeyValueStorage & { default?: KeyValueStorage })
      | undefined;
    return mod ? mod.default ?? mod : null;
  } catch {
    return null;
  }
}
