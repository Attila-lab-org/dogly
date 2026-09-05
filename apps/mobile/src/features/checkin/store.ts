/**
 * Contesto check-in → analisi personalizzata.
 * Preferenze e ultima risposta sono persistite (AsyncStorage, vedi
 * ./persistence): il modal rispetta davvero la frequenza scelta e non
 * riappare a ogni avvio a freddo se si è già risposto.
 */
import { useSyncExternalStore } from 'react';
import type { CheckInFrequency, CheckInPreferences } from './types';
import {
  loadCheckInPrefs,
  loadLastCheckInAnswer,
  localDayKey,
  saveCheckInPrefs,
  saveLastCheckInAnswer,
} from './persistence';

export type AnalysisCareContext =
  | {
      source: 'checkin';
      concern: 'soft' | 'off';
      note: string;
    }
  | null;

type CheckInState = {
  prefs: CheckInPreferences;
  /** false finché hydrateCheckIn() non ha letto AsyncStorage */
  hydrated: boolean;
  welcomePending: boolean;
  analysisContext: AnalysisCareContext;
};

let state: CheckInState = {
  prefs: { frequency: 'normal', smartReminders: true },
  hydrated: false,
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

/**
 * Frequenza → ogni quanto mostrare il saluto (giorni interi dall'ultima
 * risposta): monitoring = a ogni avvio, normal = 1 volta al giorno
 * (default), light = 1 volta ogni 3 giorni. Puro per i test.
 */
export function shouldShowWelcomeCheckIn(
  lastAnswerDayKey: string | null,
  frequency: CheckInFrequency,
  todayDayKey: string = localDayKey(),
): boolean {
  if (!lastAnswerDayKey) return true;
  if (frequency === 'monitoring') return true;
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (Date.parse(todayDayKey) - Date.parse(lastAnswerDayKey)) / dayMs,
  );
  if (diffDays < 0) return false; // orologio spostato indietro: non forzare
  return diffDays >= (frequency === 'light' ? 3 : 1);
}

/** Idempotente: legge prefs + ultima risposta e decide welcomePending. */
export async function hydrateCheckIn(): Promise<void> {
  const [prefs, lastAnswer] = await Promise.all([
    loadCheckInPrefs(),
    loadLastCheckInAnswer(),
  ]);
  const mergedPrefs = prefs ?? state.prefs;
  state = {
    ...state,
    prefs: mergedPrefs,
    hydrated: true,
    welcomePending: shouldShowWelcomeCheckIn(
      lastAnswer?.dayKey ?? null,
      mergedPrefs.frequency,
    ),
  };
  emit();
}

export function setCheckInFrequency(frequency: CheckInFrequency) {
  state = { ...state, prefs: { ...state.prefs, frequency } };
  emit();
  void saveCheckInPrefs(state.prefs);
}

export function setSmartReminders(smartReminders: boolean) {
  state = { ...state, prefs: { ...state.prefs, smartReminders } };
  emit();
  void saveCheckInPrefs(state.prefs);
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
      note: 'Buon segno: confermiamolo con un breve video quando vuoi.',
    },
  };
  emit();
  void saveLastCheckInAnswer({ dayKey: localDayKey(), concern: 'soft' });
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
  void saveLastCheckInAnswer({ dayKey: localDayKey(), concern: 'off' });
}

export function clearAnalysisContext() {
  state = { ...state, analysisContext: null };
  emit();
}

export function getCheckInSnapshot() {
  return state;
}
