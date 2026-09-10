/**
 * Picker foto per il browser.
 *
 * expo-image-picker su web:
 * 1. aspetta i permessi (anche se sono finti) e perde il gesto del tap;
 * 2. apre l’input con dispatchEvent(click), che Chrome/Safari ignorano.
 * Senza un input.click() nello stesso gesto, fotocamera e galleria non partono.
 */

export type WebImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type WebPickedImage = {
  uri: string;
  mimeType: WebImageMime;
  bytes: number;
};

const ALLOWED_MIME: Record<string, WebImageMime> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export function normalizeImageMime(value: string | undefined): WebImageMime {
  const type = (value ?? '').split(';', 1)[0].toLowerCase();
  return ALLOWED_MIME[type] ?? 'image/jpeg';
}

async function fileToAllowedImage(file: File): Promise<WebPickedImage> {
  const type = (file.type ?? '').split(';', 1)[0].toLowerCase();
  if (type in ALLOWED_MIME && file.size > 0) {
    return {
      uri: URL.createObjectURL(file),
      mimeType: ALLOWED_MIME[type],
      bytes: file.size,
    };
  }

  if (typeof createImageBitmap !== 'function') {
    return {
      uri: URL.createObjectURL(file),
      mimeType: 'image/jpeg',
      bytes: Math.max(1, file.size),
    };
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Non sono riuscito a leggere questa foto.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('Conversione foto fallita.'))),
      'image/jpeg',
      0.92,
    );
  });
  return {
    uri: URL.createObjectURL(blob),
    mimeType: 'image/jpeg',
    bytes: Math.max(1, blob.size),
  };
}

/**
 * Apre fotocamera o galleria. Deve essere chiamata nello stesso stack del tap,
 * senza `await` prima di questo ingresso.
 */
export function pickWebImage(options: { capture?: boolean } = {}): Promise<WebPickedImage | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Selezione foto non disponibile in questo browser.'));
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/*';
  input.multiple = false;
  if (options.capture) {
    input.setAttribute('capture', 'environment');
  }
  // iOS ignora click() su input con display:none.
  input.style.position = 'fixed';
  input.style.left = '0';
  input.style.top = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.overflow = 'hidden';
  input.style.zIndex = '-1';
  document.body.appendChild(input);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: WebPickedImage | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      void fileToAllowedImage(file).then(finish, reject);
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
