import { DOG_ID } from './core';
import type { AlbumPhoto, PhotoAlbum } from '../features/photos/types';

/** Placeholder URI locali (demo): usano un'immagine remota pubblica stabile. */
const DEMO_URI =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&q=80';

export const albumsMock: PhotoAlbum[] = [
  {
    id: 'album-momenti',
    dogId: DOG_ID,
    title: 'Momenti',
    coverPhotoId: 'photo-1',
    photoCount: 4,
    defaultVisibility: 'private',
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'album-passeggiate',
    dogId: DOG_ID,
    title: 'Passeggiate',
    coverPhotoId: 'photo-5',
    photoCount: 2,
    defaultVisibility: 'private',
    createdAt: '2026-08-15T10:00:00Z',
  },
];

export const photosMock: AlbumPhoto[] = [
  {
    id: 'photo-1',
    dogId: DOG_ID,
    albumId: 'album-momenti',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    caption: 'Sorride al sole',
    visibility: 'private',
    takenAt: '2026-09-01T16:00:00Z',
    uploadedAt: '2026-09-01T16:01:00Z',
  },
  {
    id: 'photo-2',
    dogId: DOG_ID,
    albumId: 'album-momenti',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    caption: 'Riposo sul tappeto',
    visibility: 'private',
    takenAt: '2026-09-02T11:00:00Z',
    uploadedAt: '2026-09-02T11:01:00Z',
  },
  {
    id: 'photo-3',
    dogId: DOG_ID,
    albumId: 'album-momenti',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    visibility: 'published',
    takenAt: '2026-09-03T09:00:00Z',
    uploadedAt: '2026-09-03T09:01:00Z',
  },
  {
    id: 'photo-4',
    dogId: DOG_ID,
    albumId: 'album-momenti',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    caption: 'Dopo il gioco',
    visibility: 'private',
    takenAt: '2026-09-04T18:00:00Z',
    uploadedAt: '2026-09-04T18:01:00Z',
  },
  {
    id: 'photo-5',
    dogId: DOG_ID,
    albumId: 'album-passeggiate',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    caption: 'Parco',
    visibility: 'private',
    takenAt: '2026-08-20T08:00:00Z',
    uploadedAt: '2026-08-20T08:01:00Z',
  },
  {
    id: 'photo-6',
    dogId: DOG_ID,
    albumId: 'album-passeggiate',
    localUri: DEMO_URI,
    thumbnailUri: DEMO_URI,
    visibility: 'private',
    takenAt: '2026-08-22T08:30:00Z',
    uploadedAt: '2026-08-22T08:31:00Z',
  },
];

export function photosForAlbum(albumId: string): AlbumPhoto[] {
  return photosMock.filter((p) => p.albumId === albumId);
}

export function photoById(photoId: string): AlbumPhoto | undefined {
  return photosMock.find((p) => p.id === photoId);
}

export function albumById(albumId: string): PhotoAlbum | undefined {
  return albumsMock.find((a) => a.id === albumId);
}
