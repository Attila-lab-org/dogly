import {
  clearPendingBehaviorUpload,
  peekPendingBehaviorUpload,
  setPendingBehaviorUpload,
} from '../features/behavior/pendingUpload';
import {
  forgetWebClipBlob,
  peekWebClipBlob,
  rememberWebClipBlob,
} from '../lib/webClipBlob';

describe('pendingBehaviorUpload', () => {
  afterEach(() => {
    clearPendingBehaviorUpload();
    forgetWebClipBlob('blob:https://dogly.local/clip');
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

  it('tiene i byte del video anche se l’URL blob non è più leggibile', () => {
    const clip = new Blob(['webm-bytes'], { type: 'video/webm' });
    rememberWebClipBlob('blob:https://dogly.local/clip', clip);
    expect(peekWebClipBlob('blob:https://dogly.local/clip')).toBe(clip);
    forgetWebClipBlob('blob:https://dogly.local/clip');
    expect(peekWebClipBlob('blob:https://dogly.local/clip')).toBeUndefined();
  });
});
