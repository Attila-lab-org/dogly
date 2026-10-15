/**
 * Dominio foto album (V1): privati di default, separati dai raw AI.
 */
export type PhotoVisibility = 'private' | 'published';

export interface AlbumPhoto {
  id: string;
  dogId: string;
  albumId: string;
  localUri: string;
  thumbnailUri: string;
  caption?: string;
  visibility: PhotoVisibility;
  takenAt: string;
  uploadedAt: string | null;
}

/** Keeps pagination and optimistic inserts idempotent when a page is retried. */
export function dedupeAlbumPhotos(photos: AlbumPhoto[]): AlbumPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    if (seen.has(photo.id)) return false;
    seen.add(photo.id);
    return true;
  });
}

export interface PhotoAlbum {
  id: string;
  dogId: string;
  title: string;
  coverPhotoId: string | null;
  coverUri?: string | null;
  photoCount: number;
  defaultVisibility: PhotoVisibility;
  createdAt: string;
}

export interface SharePhotoPayload {
  title: string;
  message: string;
  url?: string;
}
