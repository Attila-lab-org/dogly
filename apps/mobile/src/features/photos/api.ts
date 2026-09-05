/**
 * Client gallery / visibility — progressive real wiring (Dogly UX V1).
 * Usa apiClient quando EXPO_PUBLIC_API_URL è configurato; altrimenti null.
 */
import { apiRequest, ApiError, getApiBaseUrl } from '../../lib/apiClient';

export type GalleryAlbumDto = {
  id: string;
  dog_id: string;
  title: string;
  photo_count: number;
  default_visibility: 'PRIVATE' | 'PUBLISHED';
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

export async function fetchAlbums(dogId: string): Promise<GalleryAlbumDto[] | null> {
  if (!apiConfigured()) return null;
  try {
    const body = await apiRequest<{ items: GalleryAlbumDto[] }>(
      `/v1/dogs/${dogId}/albums`,
    );
    return body.items;
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export async function setProfileVisibility(
  dogId: string,
  visibility: 'PRIVATE' | 'PUBLIC',
  consentVersion?: string,
): Promise<ProfileVisibilityDto | null> {
  if (!apiConfigured()) return null;
  try {
    return await apiRequest<ProfileVisibilityDto>(
      `/v1/dogs/${dogId}/visibility`,
      {
        method: 'PUT',
        body: {
          visibility,
          consent_version: consentVersion,
        },
      },
    );
  } catch {
    return null;
  }
}
