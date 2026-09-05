/**
 * Client gallery / visibility — progressive real wiring (Dogly UX V1).
 * Usa apiClient quando EXPO_PUBLIC_API_URL è configurato; altrimenti null.
 */
import { apiRequest, getApiBaseUrl } from '../../lib/apiClient';
import {
  FileSystemUploadType,
  getInfoAsync,
  uploadAsync,
} from 'expo-file-system/legacy';
import { contentTypeFromUri } from '../dogs/photoUri';
import { albumById, albumsMock, photosForAlbum } from '../../mocks/photos';
import type { AlbumPhoto, PhotoAlbum } from './types';

export type GalleryAlbumDto = {
  id: string;
  dog_id: string;
  title: string;
  cover_photo_id: string | null;
  photo_count: number;
  default_visibility: 'PRIVATE' | 'PUBLISHED';
  created_at: string;
};

export type GalleryPhotoDto = {
  id: string;
  album_id: string;
  dog_id: string;
  storage_path: string;
  photo_url: string | null;
  caption: string | null;
  visibility: 'PRIVATE' | 'PUBLISHED';
  taken_at: string | null;
  created_at: string;
};

export type ProfileVisibilityDto = {
  dog_id: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  consent_version: string | null;
};

function apiConfigured(): boolean {
  try {
    getApiBaseUrl();
    return true;
  } catch {
    return false;
  }
}

function mapAlbum(album: GalleryAlbumDto): PhotoAlbum {
  return {
    id: album.id,
    dogId: album.dog_id,
    title: album.title,
    coverPhotoId: album.cover_photo_id,
    photoCount: album.photo_count,
    defaultVisibility:
      album.default_visibility === 'PUBLISHED' ? 'published' : 'private',
    createdAt: album.created_at,
  };
}

function mapPhoto(photo: GalleryPhotoDto, fallbackUri = ''): AlbumPhoto {
  const uri = photo.photo_url ?? fallbackUri;
  return {
    id: photo.id,
    dogId: photo.dog_id,
    albumId: photo.album_id,
    localUri: uri,
    thumbnailUri: uri,
    caption: photo.caption ?? undefined,
    visibility: photo.visibility === 'PUBLISHED' ? 'published' : 'private',
    takenAt: photo.taken_at ?? photo.created_at,
    uploadedAt: photo.created_at,
  };
}

export async function fetchAlbums(dogId: string): Promise<PhotoAlbum[]> {
  // Demo senza backend configurato: dati mock locali (stessa shape).
  if (!apiConfigured()) {
    return albumsMock.filter((album) => album.dogId === dogId);
  }
  const body = await apiRequest<{ items: GalleryAlbumDto[] }>(
    `/v1/dogs/${dogId}/albums`,
  );
  return body.items.map(mapAlbum);
}

export async function createAlbum(dogId: string, title: string): Promise<PhotoAlbum> {
  const album = await apiRequest<GalleryAlbumDto>(`/v1/dogs/${dogId}/albums`, {
    method: 'POST',
    body: { title: title.trim(), default_visibility: 'PRIVATE' },
  });
  return mapAlbum(album);
}

export async function fetchAlbum(albumId: string): Promise<PhotoAlbum> {
  if (!apiConfigured()) {
    const album = albumById(albumId);
    if (!album) throw new Error('Album non trovato');
    return album;
  }
  const album = await apiRequest<GalleryAlbumDto>(`/v1/albums/${albumId}`);
  return mapAlbum(album);
}

export async function fetchAlbumPhotos(albumId: string): Promise<AlbumPhoto[]> {
  if (!apiConfigured()) {
    return photosForAlbum(albumId);
  }
  const body = await apiRequest<{ items: GalleryPhotoDto[] }>(
    `/v1/albums/${albumId}/photos`,
  );
  return body.items.map((photo) => mapPhoto(photo));
}

export async function uploadAlbumPhoto(
  albumId: string,
  localUri: string,
): Promise<AlbumPhoto> {
  const info = await getInfoAsync(localUri);
  const bytes = info.exists && 'size' in info && typeof info.size === 'number'
    ? Math.max(1, info.size)
    : 1;
  const contentType = contentTypeFromUri(localUri);
  const created = await apiRequest<{
    photo: GalleryPhotoDto;
    upload: { url: string };
  }>(`/v1/albums/${albumId}/photos/init`, {
    method: 'POST',
    body: {
      content_type: contentType,
      bytes,
      visibility: 'PRIVATE',
      taken_at: new Date().toISOString(),
    },
  });
  try {
    const uploaded = await uploadAsync(created.upload.url, localUri, {
      httpMethod: 'PUT',
      headers: { 'Content-Type': contentType },
      uploadType: FileSystemUploadType.BINARY_CONTENT,
    });
    if (uploaded.status < 200 || uploaded.status >= 300) {
      throw new Error(`Upload foto fallito (${uploaded.status})`);
    }
  } catch (error) {
    await apiRequest<void>(`/v1/photos/${created.photo.id}`, {
      method: 'DELETE',
    }).catch(() => undefined);
    throw error;
  }
  return mapPhoto(created.photo, localUri);
}

export async function updateAlbumPhotoVisibility(
  photoId: string,
  visibility: 'private' | 'published',
): Promise<AlbumPhoto> {
  const photo = await apiRequest<GalleryPhotoDto>(`/v1/photos/${photoId}`, {
    method: 'PATCH',
    body: {
      visibility: visibility === 'published' ? 'PUBLISHED' : 'PRIVATE',
    },
  });
  return mapPhoto(photo);
}

/**
 * Aggiorna la visibilità del profilo. Ritorna null solo quando il backend non
 * è configurato (demo); gli errori API vengono rilanciati: chi chiama deve
 * mostrare un errore visibile, mai un successo finto.
 */
export async function setProfileVisibility(
  dogId: string,
  visibility: 'PRIVATE' | 'PUBLIC',
  consentVersion?: string,
): Promise<ProfileVisibilityDto | null> {
  if (!apiConfigured()) return null;
  return apiRequest<ProfileVisibilityDto>(
    `/v1/dogs/${dogId}/visibility`,
    {
      method: 'PUT',
      body: {
        visibility,
        consent_version: consentVersion,
      },
    },
  );
}
