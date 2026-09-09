/**
 * Store di sessione per "Routine e abitudini" (mock gate dev).
 * Pattern condiviso con checkin/store: modulo + useSyncExternalStore.
 * La modalità reale usa GET/PATCH server; questo store resta il fallback demo.
 */
import { useSyncExternalStore } from 'react';
import { lifestyleProfileMock } from '../../mocks/advice';
import type { LifestyleProfile } from './types';

type LifestyleState = {
  /** dogId → profilo (seed mock solo per il cane demo del mock gate) */
  profiles: Record<string, LifestyleProfile>;
  /** dogId → micro-card Home "Aiutami a conoscerlo meglio" dismessa */
  homeCardDismissed: Record<string, boolean>;
};

let state: LifestyleState = {
  profiles: { [lifestyleProfileMock.dogId]: { ...lifestyleProfileMock } },
  homeCardDismissed: {},
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getLifestyleProfileLocal(dogId: string): LifestyleProfile | null {
  return state.profiles[dogId] ?? null;
}

export function saveLifestyleProfileLocal(
  dogId: string,
  patch: Partial<Omit<LifestyleProfile, 'dogId'>>,
): LifestyleProfile {
  const current = state.profiles[dogId] ?? {
    dogId,
    activity: null,
    sleep: null,
    timeAlone: null,
    feedingLabel: null,
    social: null,
    enrichment: null,
    updatedAt: null,
  };
  const next: LifestyleProfile = {
    ...current,
    ...patch,
    dogId,
    updatedAt: new Date().toISOString(),
  };
  state = { ...state, profiles: { ...state.profiles, [dogId]: next } };
  emit();
  return next;
}

export function isLifestyleHomeCardDismissed(dogId: string): boolean {
  return state.homeCardDismissed[dogId] ?? false;
}

export function dismissLifestyleHomeCard(dogId: string) {
  state = {
    ...state,
    homeCardDismissed: { ...state.homeCardDismissed, [dogId]: true },
  };
  emit();
}

export function useLifestyleLocal() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Reset per i test. */
export function __resetLifestyleState() {
  state = {
    profiles: { [lifestyleProfileMock.dogId]: { ...lifestyleProfileMock } },
    homeCardDismissed: {},
  };
}
