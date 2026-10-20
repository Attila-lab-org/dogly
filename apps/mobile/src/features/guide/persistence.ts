type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const memory = new Map<string, string>();
let injectedStorage: StorageLike | null = null;
const KEY_PREFIX = 'dogly.guide.v1.';
const LOCALE_KEY = `${KEY_PREFIX}locale`;

function memoryStorage(): StorageLike {
  return {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
  };
}

async function getStorage(): Promise<StorageLike> {
  if (injectedStorage) return injectedStorage;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default as unknown as StorageLike;
  } catch {
    return memoryStorage();
  }
}

export function guideStorageKey(page: string, dogId?: string) {
  return `${KEY_PREFIX}${page}.${dogId || 'default'}`;
}

export async function hasSeenGuide(page: string, dogId?: string) {
  return (await (await getStorage()).getItem(guideStorageKey(page, dogId))) === 'seen';
}

export async function markGuideSeen(page: string, dogId?: string) {
  await (await getStorage()).setItem(guideStorageKey(page, dogId), 'seen');
}

export async function readGuideLocale(): Promise<'it' | 'en'> {
  return (await (await getStorage()).getItem(LOCALE_KEY)) === 'en' ? 'en' : 'it';
}

export async function saveGuideLocale(locale: 'it' | 'en') {
  await (await getStorage()).setItem(LOCALE_KEY, locale);
}

/** Test/dev helper: keeps persistence deterministic without touching the device. */
export function setGuideStorageForTests(storage: StorageLike | null) {
  injectedStorage = storage;
}

export function resetGuideStorageForTests() {
  memory.clear();
  injectedStorage = null;
}
