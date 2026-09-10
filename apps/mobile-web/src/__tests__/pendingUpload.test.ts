import {
  clearPendingBehaviorUpload,
  peekPendingBehaviorUpload,
  setPendingBehaviorUpload,
} from '../features/behavior/pendingUpload';

describe('pendingBehaviorUpload', () => {
  afterEach(() => {
    clearPendingBehaviorUpload();
  });

  it('consegna il video alla pagina di invio senza tenere la telecamera', () => {
    expect(peekPendingBehaviorUpload()).toBeNull();
    setPendingBehaviorUpload({
      localUri: 'blob:https://dogly.local/clip',
      durationMs: 8000,
      hasAudio: true,
      contentType: 'video/webm',
      dogId: 'dog-1',
    });
    expect(peekPendingBehaviorUpload()).toEqual({
      localUri: 'blob:https://dogly.local/clip',
      durationMs: 8000,
      hasAudio: true,
      contentType: 'video/webm',
      dogId: 'dog-1',
    });
    clearPendingBehaviorUpload();
    expect(peekPendingBehaviorUpload()).toBeNull();
  });
});
