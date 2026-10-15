/**
 * Seen-state locale per anelli storie (Momenti-as-stories).
 * Niente TTL server: solo “visto fino a questa foto” sul device.
 */
import { getKeyValueStorage } from '@/features/notifications/persistence';

const keyFor = (dogId: string) => `dogly.social.storySeen.${dogId}`;

export async function getLastSeenPhotoId(dogId: string): Promise<string | null> {
  try {
    const storage = getKeyValueStorage();
    if (!storage) return null;
    return await storage.getItem(keyFor(dogId));
  } catch {
    return null;
  }
}

export async function setLastSeenPhotoId(
  dogId: string,
  photoId: string,
): Promise<void> {
  try {
    const storage = getKeyValueStorage();
    if (!storage) return;
    await storage.setItem(keyFor(dogId), photoId);
  } catch {
    /* ignore */
  }
}
