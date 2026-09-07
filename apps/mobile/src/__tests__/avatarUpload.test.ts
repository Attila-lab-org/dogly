const mockUploadAsync = jest.fn();
const mockCancelAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(() => ({
    uploadAsync: mockUploadAsync,
    cancelAsync: mockCancelAsync,
  })),
}));

jest.mock('../features/dogs/api', () => ({
  initDogAvatar: jest.fn(),
  completeDogAvatar: jest.fn(),
}));

import { createUploadTask } from 'expo-file-system/legacy';
import {
  completeDogAvatar,
  initDogAvatar,
} from '../features/dogs/api';
import { persistDogAvatar } from '../features/dogs/avatar';

const mockCreateUploadTask = createUploadTask as jest.Mock;
const mockInitDogAvatar = initDogAvatar as jest.Mock;
const mockCompleteDogAvatar = completeDogAvatar as jest.Mock;

describe('upload foto profilo cane', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('esegue init, upload binario e complete in ordine', async () => {
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
    });
    expect(mockCreateUploadTask).toHaveBeenCalledWith(
      'https://storage.test/signed',
      'file:///photo.jpg',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );
    expect(mockCompleteDogAvatar).toHaveBeenCalledWith('dog-1', {
      storage_path: 'users/u/dogs/d/avatar/a.jpg',
    });
    expect(mockInitDogAvatar.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateUploadTask.mock.invocationCallOrder[0],
    );
    expect(mockCreateUploadTask.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompleteDogAvatar.mock.invocationCallOrder[0],
    );
  });
});
