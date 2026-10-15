import { dedupeAlbumPhotos } from '../features/photos/types';

const photo = (id: string) => ({
  id,
  dogId: 'dog-1',
  albumId: 'album-1',
  localUri: `https://cdn/${id}`,
  thumbnailUri: `https://cdn/${id}`,
  visibility: 'private' as const,
  takenAt: '2026-01-01T00:00:00Z',
  uploadedAt: '2026-01-01T00:00:00Z',
});

it('deduplicates repeated photo ids from pagination or retries', () => {
  expect(dedupeAlbumPhotos([photo('a'), photo('a'), photo('b')]).map((item) => item.id)).toEqual(['a', 'b']);
});
