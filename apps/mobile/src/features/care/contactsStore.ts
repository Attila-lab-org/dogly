/**
 * Numeri utili locali (il tuo veterinario) — AsyncStorage per cane.
 */
export type SavedVetContact = {
  name: string;
  phone: string;
  notes?: string;
};

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

let injectedBackend: KeyValueStorage | null = null;

export function setCareContactsStorageBackend(backend: KeyValueStorage | null): void {
  injectedBackend = backend;
}

async function storage(): Promise<KeyValueStorage | null> {
  if (injectedBackend) return injectedBackend;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default;
  } catch {
    return null;
  }
}

function keyFor(dogId: string): string {
  return `care:vet:v1:${dogId.trim() || 'default'}`;
}

export function normalizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+]/g, '').trim();
}

export function isCallablePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6;
}

export async function loadSavedVet(dogId: string): Promise<SavedVetContact | null> {
  const store = await storage();
  if (!store) return null;
  try {
    const raw = await store.getItem(keyFor(dogId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedVetContact>;
    const name = String(parsed.name || '').trim();
    const phone = normalizePhoneInput(String(parsed.phone || ''));
    if (!name || !isCallablePhone(phone)) return null;
    const notes = String(parsed.notes || '').trim();
    return notes ? { name, phone, notes } : { name, phone };
  } catch {
    return null;
  }
}

export async function saveSavedVet(
  dogId: string,
  contact: SavedVetContact,
): Promise<SavedVetContact> {
  const store = await storage();
  const cleaned: SavedVetContact = {
    name: contact.name.trim(),
    phone: normalizePhoneInput(contact.phone),
    ...(contact.notes?.trim() ? { notes: contact.notes.trim() } : {}),
  };
  if (!cleaned.name || !isCallablePhone(cleaned.phone)) {
    throw new Error('Nome e telefono validi obbligatori');
  }
  if (store) {
    await store.setItem(keyFor(dogId), JSON.stringify(cleaned));
  }
  return cleaned;
}

export async function clearSavedVet(dogId: string): Promise<void> {
  const store = await storage();
  if (!store) return;
  if (store.removeItem) {
    await store.removeItem(keyFor(dogId));
    return;
  }
  await store.setItem(keyFor(dogId), '');
}
