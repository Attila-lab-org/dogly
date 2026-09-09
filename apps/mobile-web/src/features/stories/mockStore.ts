import { dogMock } from '../../mocks/core';
import { photosMock } from '../../mocks/photos';
import type { DogStory } from './data';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const seedTime = Date.now();
let stories: DogStory[] = photosMock.slice(0, 3).map((photo, index) => ({
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
  const activeStories = stories.filter(
    (story) => Date.parse(story.createdAt) > cutoff,
  );
  if (activeStories.length !== stories.length) {
    stories = activeStories;
  }
}

export function subscribeMockStories(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveStories(): DogStory[] {
  pruneExpired();
  return stories;
}

export function addStory(
  input: Omit<DogStory, 'id' | 'createdAt' | 'unseen'>,
): DogStory {
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

export function markMockStorySeen(storyId: string) {
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
