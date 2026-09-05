/**
 * Single source of truth per il profilo cane in V1 mock-driven.
 * Home, tab Profilo, edit e messaggio quotidiano leggono da qui.
 */
import { useSyncExternalStore } from 'react';
import type { DogProfile, KnowledgeScore } from './types';
import { dogMock, homeKnowledgeScoreMock } from '../../mocks/core';

type DogProfileState = {
  dog: DogProfile;
  knowledgeScore: KnowledgeScore;
};

let state: DogProfileState = {
  dog: { ...dogMock },
  knowledgeScore: { ...homeKnowledgeScoreMock },
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useDogProfile() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function updateDogProfile(patch: Partial<DogProfile>) {
  state = {
    ...state,
    dog: { ...state.dog, ...patch },
  };
  emit();
}

export function setKnowledgeScore(score: KnowledgeScore) {
  state = {
    ...state,
    knowledgeScore: score,
  };
  emit();
}

export function getDogProfileSnapshot() {
  return state;
}
