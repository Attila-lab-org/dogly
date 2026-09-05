/**
 * Contesto check-in → analisi personalizzata.
 */
import { useSyncExternalStore } from 'react';
import type { CheckInFrequency, CheckInPreferences } from './types';

export type AnalysisCareContext =
  | {
      source: 'checkin';
      concern: 'soft' | 'off';
      note: string;
    }
  | null;

type CheckInState = {
  prefs: CheckInPreferences;
  welcomePending: boolean;
  analysisContext: AnalysisCareContext;
};

let state: CheckInState = {
  prefs: { frequency: 'normal', smartReminders: true },
  welcomePending: true,
  analysisContext: null,
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

export function useCheckIn() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setCheckInFrequency(frequency: CheckInFrequency) {
  state = { ...state, prefs: { ...state.prefs, frequency } };
  emit();
}

export function setSmartReminders(smartReminders: boolean) {
  state = { ...state, prefs: { ...state.prefs, smartReminders } };
  emit();
}

export function dismissWelcomeCheckIn() {
  state = { ...state, welcomePending: false };
  emit();
}

export function markCheckInSoftOk() {
  state = {
    ...state,
    welcomePending: false,
    analysisContext: {
      source: 'checkin',
      concern: 'soft',
      note: 'Oggi sembra in linea con i suoi giorni sereni.',
    },
  };
  emit();
}

/** Tiene il modal aperto (welcomePending) per lo step CTA. */
export function markCheckInNeedsCare(dogName: string) {
  state = {
    ...state,
    analysisContext: {
      source: 'checkin',
      concern: 'off',
      note: `Hai notato che ${dogName} non è come al solito.`,
    },
  };
  emit();
}

export function clearAnalysisContext() {
  state = { ...state, analysisContext: null };
  emit();
}

export function getCheckInSnapshot() {
  return state;
}
