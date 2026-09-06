/**
 * Store di sessione per gli outcome dei consigli (mock gate dev).
 * Pattern condiviso con checkin/store: modulo + useSyncExternalStore.
 * "Salva in sessione": niente persistenza su disco finché non esiste la
 * POST outcome del backend V2 (TODO(backend): docs/CURSOR_START_HERE.md).
 */
import { useSyncExternalStore } from 'react';
import type { AdviceOutcome, AdviceOutcomeValue } from './types';

type AdviceOutcomesState = {
  /** eventId → outcome registrato */
  outcomes: Record<string, AdviceOutcome>;
};

let state: AdviceOutcomesState = { outcomes: {} };

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

export function getAdviceOutcome(eventId: string): AdviceOutcome | null {
  return state.outcomes[eventId] ?? null;
}

export function saveAdviceOutcomeLocal(
  eventId: string,
  adviceCode: string,
  outcome: AdviceOutcomeValue,
): AdviceOutcome {
  const saved: AdviceOutcome = {
    eventId,
    adviceCode,
    outcome,
    savedAt: new Date().toISOString(),
  };
  state = { outcomes: { ...state.outcomes, [eventId]: saved } };
  emit();
  return saved;
}

/** Outcome già registrato → la domanda non si ripresenta (una sola volta). */
export function shouldAskAdviceOutcome(eventId: string): boolean {
  return getAdviceOutcome(eventId) === null;
}

/** Hook reattivo: outcome dell'evento o null se non ancora risposto. */
export function useAdviceOutcome(eventId: string): AdviceOutcome | null {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return getAdviceOutcome(eventId);
}

/** Reset per i test. */
export function __resetAdviceOutcomes() {
  state = { outcomes: {} };
}
