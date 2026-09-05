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

export interface PhotoAlbum {
  id: string;
  dogId: string;
  title: string;
  coverPhotoId: string | null;
  photoCount: number;
  defaultVisibility: PhotoVisibility;
  createdAt: string;
}

export interface SharePhotoPayload {
  title: string;
  message: string;
  url?: string;
}
