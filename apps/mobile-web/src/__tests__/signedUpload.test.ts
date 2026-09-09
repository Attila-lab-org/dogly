const mockUploadAsync = jest.fn();
const mockCancelAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(() => ({
    uploadAsync: mockUploadAsync,
    cancelAsync: mockCancelAsync,
  })),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { createUploadTask } from 'expo-file-system/legacy';
import { putSignedUpload } from '../lib/signedUpload';

const mockCreateUploadTask = createUploadTask as jest.Mock;

describe('putSignedUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelAsync.mockResolvedValue(undefined);
  });

  it('invia il file nativo con PUT binario', async () => {
    mockUploadAsync.mockResolvedValue({ status: 200 });

    await putSignedUpload(
      'https://storage.test/signed',
      'file:///cache/clip.mp4',
      'video/mp4',
    );

    expect(mockCreateUploadTask).toHaveBeenCalledWith(
      'https://storage.test/signed',
      'file:///cache/clip.mp4',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
      }),
    );
  });

  it('fallisce se lo storage rifiuta il PUT', async () => {
    mockUploadAsync.mockResolvedValue({ status: 403 });

    await expect(
      putSignedUpload(
        'https://storage.test/signed',
        'file:///cache/photo.jpg',
        'image/jpeg',
      ),
    ).rejects.toThrow('Upload firmato fallito (403)');
  });

  it('cancella un upload nativo che resta appeso', async () => {
    jest.useFakeTimers();
    mockUploadAsync.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          mockCancelAsync.mockImplementation(async () => {
            reject(new Error('cancelled'));
          });
        }),
    );

    const upload = putSignedUpload(
      'https://storage.test/signed',
      'file:///cache/clip.mp4',
      'video/mp4',
      1_000,
    );
    const rejected = expect(upload).rejects.toThrow('Upload scaduto');
    await jest.advanceTimersByTimeAsync(1_000);

    await rejected;
    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
