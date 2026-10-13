export type WebPickedVideo = {
  uri: string;
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

const ACCEPTED = 'video/mp4,video/quicktime,video/webm,video/*';

export function pickWebVideo(): Promise<WebPickedVideo | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Selezione video non disponibile in questo browser.'));
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED;
  input.multiple = false;
  input.style.position = 'fixed';
  input.style.left = '0';
  input.style.top = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  document.body.appendChild(input);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: WebPickedVideo | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      const uri = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
        finish({ uri, blob: file, durationMs, mimeType: file.type || 'video/mp4' });
      };
      video.onerror = () => {
        reject(new Error('Non sono riuscito a leggere la durata del video.'));
      };
      video.src = uri;
    });
    input.addEventListener('cancel', () => finish(null));
    try {
      input.click();
    } catch (error) {
      input.remove();
      reject(error);
    }
  });
}
