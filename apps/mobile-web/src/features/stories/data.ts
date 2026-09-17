/**
 * Storie reali: foto persistite nell'album dedicato "Storie", pubblicate per
 * 24 ore nella rail.
 */
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';
import { isPersistedId } from '../../lib/persistedId';
import { isApiConfigured } from '../auth/env';
import {
  createAlbum,
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  fetchAlbums,
  uploadAlbumPhoto,
} from '../photos/api';
import type { AlbumPhoto, PhotoAlbum } from '../photos/types';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORIES_ALBUM_TITLE = 'Storie';

export interface DogStory {
  id: string;
  dogId: string;
  dogName: string;
  photoUri: string;
  caption?: string;
  createdAt: string;
  /** Se true, anello “non vista”. */
  unseen: boolean;
}

const seenStoryIds = new Set<string>();

function storyFromPhoto(photo: AlbumPhoto, dogName: string): DogStory {
  return {
    id: photo.id,
    dogId: photo.dogId,
    dogName,
    photoUri: photo.localUri,
    caption: photo.caption,
    createdAt: photo.uploadedAt ?? photo.takenAt,
    unseen: !seenStoryIds.has(photo.id),
  };
}

async function storyAlbum(dogId: string): Promise<PhotoAlbum> {
  const albums = await fetchAlbums(dogId, { includeStories: true });
  const existing = albums.find(
    (album) => album.title.trim().toLocaleLowerCase() ===
      STORIES_ALBUM_TITLE.toLocaleLowerCase(),
  );
  if (existing) return existing;
  try {
    return await createAlbum(dogId, STORIES_ALBUM_TITLE);
  } catch (error) {
    const refreshed = await fetchAlbums(dogId, { includeStories: true });
    const raced = refreshed.find(
      (album) =>
        album.title.trim().toLocaleLowerCase() ===
        STORIES_ALBUM_TITLE.toLocaleLowerCase(),
    );
    if (raced) return raced;
    throw error;
  }
}

async function fetchRealStories(
  dogId: string,
  dogName: string,
): Promise<DogStory[]> {
  const albums = await fetchAlbums(dogId, { includeStories: true });
  const album = albums.find(
    (item) => item.title.trim().toLocaleLowerCase() ===
      STORIES_ALBUM_TITLE.toLocaleLowerCase(),
  );
  if (!album) return [];

  const cutoff = Date.now() - STORY_TTL_MS;
  const photos = await fetchAlbumPhotos(album.id);
  return photos
    .filter((photo) => Date.parse(photo.uploadedAt ?? photo.takenAt) > cutoff)
    .map((photo) => storyFromPhoto(photo, dogName));
}

export function useStories(dogId: string, dogName: string): DogStory[] {
  const live = isApiConfigured();
  const query = useQuery({
    queryKey: ['stories', dogId],
    queryFn: () => fetchRealStories(dogId, dogName),
    enabled: live && isPersistedId(dogId),
    staleTime: 5 * 60_000,
    refetchInterval: live ? 45 * 60_000 : false,
    refetchOnMount: true,
  });
  return query.data ?? [];
}

export async function publishStory(input: {
  dogId: string;
  dogName: string;
  photoUri: string;
  caption?: string;
}): Promise<DogStory> {
  if (!isApiConfigured() || !isPersistedId(input.dogId)) {
    throw new Error('Servizio storie non disponibile');
  }
  const album = await storyAlbum(input.dogId);
  const photo = await uploadAlbumPhoto(album.id, input.photoUri, {
    caption: input.caption,
    visibility: 'PUBLISHED',
  });
  const story = storyFromPhoto(photo, input.dogName);
  await queryClient.invalidateQueries({ queryKey: ['stories', input.dogId] });
  await queryClient.invalidateQueries({
    queryKey: ['gallery-albums', input.dogId],
  });
  return story;
}

export function markStorySeen(storyId: string) {
  seenStoryIds.add(storyId);
}

export async function deleteStory(storyId: string, dogId: string): Promise<void> {
  await deleteAlbumPhoto(storyId);
  seenStoryIds.delete(storyId);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['stories', dogId] }),
    queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
    queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', dogId] }),
  ]);
}
