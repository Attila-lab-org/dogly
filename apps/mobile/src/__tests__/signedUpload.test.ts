jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  uploadAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { uploadAsync } from 'expo-file-system/legacy';
import { putSignedUpload } from '../lib/signedUpload';

const mockUploadAsync = uploadAsync as jest.Mock;

describe('putSignedUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invia il file nativo con PUT binario', async () => {
    mockUploadAsync.mockResolvedValue({ status: 200 });

    await putSignedUpload(
      'https://storage.test/signed',
      'file:///cache/clip.mp4',
      'video/mp4',
    );

    expect(mockUploadAsync).toHaveBeenCalledWith(
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
});
