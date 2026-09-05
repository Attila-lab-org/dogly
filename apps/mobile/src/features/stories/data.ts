/**
 * Store locale delle storie demo.
 * È separato dagli album: pubblicare una storia non salva automaticamente
 * la foto nell'album personale.
 */
import { useSyncExternalStore } from 'react';
import { dogMock } from '../../mocks/core';
import { photosMock } from '../../mocks/photos';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

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

const seedTime = Date.now();
let stories: DogStory[] = photosMock
  .slice(0, 3)
  .map((photo, index) => ({
      id: `story-${photo.id}`,
      dogId: photo.dogId,
      dogName: dogMock.name,
      photoUri: photo.localUri,
      caption: photo.caption,
      createdAt: new Date(seedTime - index * 30 * 60 * 1000).toISOString(),
      unseen: index < 2,
    }));

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function pruneExpired() {
  const cutoff = Date.now() - STORY_TTL_MS;
  const active = stories.filter((story) => Date.parse(story.createdAt) > cutoff);
  if (active.length !== stories.length) stories = active;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveStories(): DogStory[] {
  pruneExpired();
  return stories;
}

export function useStories(): DogStory[] {
  return useSyncExternalStore(subscribe, getActiveStories, getActiveStories);
}

export function addStory(input: {
  dogId: string;
  dogName: string;
  photoUri: string;
  caption?: string;
}): DogStory {
  const story: DogStory = {
    id: `story-${Date.now()}`,
    ...input,
    createdAt: new Date().toISOString(),
    unseen: false,
  };
  pruneExpired();
  stories = [story, ...stories];
  emit();
  return story;
}

export function markStorySeen(storyId: string) {
  let changed = false;
  stories = stories.map((story) => {
    if (story.id !== storyId || !story.unseen) return story;
    changed = true;
    return { ...story, unseen: false };
  });
  if (changed) emit();
}

export function storyById(storyId: string): DogStory | undefined {
  return getActiveStories().find((story) => story.id === storyId);
}
