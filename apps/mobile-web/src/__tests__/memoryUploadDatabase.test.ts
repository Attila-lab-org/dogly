import { createMemoryUploadDatabase } from '../lib/memoryUploadDatabase';
import { createUploadQueue } from '../lib/uploadQueue';

describe('coda upload in memoria (web)', () => {
  it('persiste content_type, durata, audio e capture_id', () => {
    const queue = createUploadQueue(createMemoryUploadDatabase());
    queue.enqueue({
      id: 'up1',
      userId: 'u1',
      dogId: 'd1',
      domain: 'BEHAVIOR',
      localUri: 'blob:https://dogly.test/clip',
      clientRequestId: 'req-1',
      durationMs: 8_000,
      hasAudio: false,
      contentType: 'video/webm',
    });
    queue.transitionTo('up1', 'upload_initializing');
    queue.transitionTo('up1', 'uploading', { captureId: 'capture-1' });

    expect(queue.get('up1')).toMatchObject({
      durationMs: 8_000,
      hasAudio: false,
      contentType: 'video/webm',
      captureId: 'capture-1',
      localUri: 'blob:https://dogly.test/clip',
    });
  });
});
