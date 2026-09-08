/**
 * Storie reali: foto persistite nell'album dedicato "Storie", pubblicate per
 * 24 ore nella rail. Il seed locale esiste esclusivamente nel mock gate.
 */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';
import { isPersistedId } from '../../lib/persistedId';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import {
  createAlbum,
  fetchAlbumPhotos,
  fetchAlbums,
  uploadAlbumPhoto,
} from '../photos/api';
import type { AlbumPhoto, PhotoAlbum } from '../photos/types';
import {
  addStory as addMockStory,
  getActiveStories as getActiveMockStories,
  markMockStorySeen,
  subscribeMockStories,
} from './mockStore';

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
  const albums = await fetchAlbums(dogId);
  const existing = albums.find(
    (album) => album.title.trim().toLocaleLowerCase() ===
      STORIES_ALBUM_TITLE.toLocaleLowerCase(),
  );
  return existing ?? createAlbum(dogId, STORIES_ALBUM_TITLE);
}

async function fetchRealStories(
  dogId: string,
  dogName: string,
): Promise<DogStory[]> {
  const albums = await fetchAlbums(dogId);
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
  const { usingMockGate } = useSession();
  const mock = useSyncExternalStore(
    subscribeMockStories,
    getActiveMockStories,
    getActiveMockStories,
  );
  const live = isApiConfigured() && !usingMockGate;
  const query = useQuery({
    queryKey: ['stories', dogId],
    queryFn: () => fetchRealStories(dogId, dogName),
    enabled: live && isPersistedId(dogId),
    staleTime: 30_000,
  });
  return live ? query.data ?? [] : mock;
}

export async function publishStory(input: {
  dogId: string;
  dogName: string;
  photoUri: string;
  caption?: string;
  mockGate: boolean;
}): Promise<DogStory> {
  if (!input.mockGate && isApiConfigured()) {
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

  const { mockGate: _mockGate, ...storyInput } = input;
  return addMockStory(storyInput);
}

export function markStorySeen(storyId: string) {
  seenStoryIds.add(storyId);
  markMockStorySeen(storyId);
}
