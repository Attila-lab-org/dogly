import { createMemoryUploadDatabase } from './memoryUploadDatabase';
import type { UploadQueueDatabase } from './uploadQueue';

export function openUploadQueueDatabase(): UploadQueueDatabase {
  return createMemoryUploadDatabase();
}
