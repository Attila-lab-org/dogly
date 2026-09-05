jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  getInfoAsync: jest.fn(),
  uploadAsync: jest.fn(),
}));

jest.mock('../features/dogs/api', () => ({
  initDogAvatar: jest.fn(),
  completeDogAvatar: jest.fn(),
}));

import { getInfoAsync, uploadAsync } from 'expo-file-system/legacy';
import {
  completeDogAvatar,
  initDogAvatar,
} from '../features/dogs/api';
import { persistDogAvatar } from '../features/dogs/avatar';

const mockGetInfoAsync = getInfoAsync as jest.Mock;
const mockUploadAsync = uploadAsync as jest.Mock;
const mockInitDogAvatar = initDogAvatar as jest.Mock;
const mockCompleteDogAvatar = completeDogAvatar as jest.Mock;

describe('upload foto profilo cane', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('esegue init, upload binario e complete in ordine', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1234 });
    mockInitDogAvatar.mockResolvedValue({
      storage_path: 'users/u/dogs/d/avatar/a.jpg',
      upload: { url: 'https://storage.test/signed' },
    });
    mockUploadAsync.mockResolvedValue({ status: 200 });
    mockCompleteDogAvatar.mockResolvedValue({
      photo_url: 'https://storage.test/read',
    });

    await expect(
      persistDogAvatar('dog-1', 'file:///photo.jpg'),
    ).resolves.toBe('https://storage.test/read');

    expect(mockInitDogAvatar).toHaveBeenCalledWith('dog-1', {
      content_type: 'image/jpeg',
      bytes: 1234,
    });
    expect(mockUploadAsync).toHaveBeenCalledWith(
      'https://storage.test/signed',
      'file:///photo.jpg',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );
    expect(mockCompleteDogAvatar).toHaveBeenCalledWith('dog-1', {
      storage_path: 'users/u/dogs/d/avatar/a.jpg',
      bytes: 1234,
    });
    expect(mockInitDogAvatar.mock.invocationCallOrder[0]).toBeLessThan(
      mockUploadAsync.mock.invocationCallOrder[0],
    );
    expect(mockUploadAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompleteDogAvatar.mock.invocationCallOrder[0],
    );
  });
});
