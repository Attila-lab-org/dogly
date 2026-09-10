import {
  contentTypeFromUri,
  detectImageContentType,
} from '../features/dogs/photoUri';
import { normalizeImageMime } from '../features/photos/webPickImage';

describe('MIME foto', () => {
  it('dalle estensioni usa jpeg di default sui blob senza path', () => {
    expect(contentTypeFromUri('blob:https://dogly.test/abc')).toBe('image/jpeg');
    expect(contentTypeFromUri('file:///photo.png')).toBe('image/png');
    expect(contentTypeFromUri('file:///photo.webp')).toBe('image/webp');
  });

  it('legge il tipo reale dal blob, non dall’URL', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      blob: async () => ({ type: 'image/png' }),
    })) as unknown as typeof fetch;

    await expect(detectImageContentType('blob:https://dogly.test/abc')).resolves.toBe(
      'image/png',
    );

    globalThis.fetch = originalFetch;
  });

  it('normalizza alias jpeg', () => {
    expect(normalizeImageMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeImageMime('image/webp; charset=binary')).toBe('image/webp');
    expect(normalizeImageMime('image/heic')).toBe('image/jpeg');
  });
});
