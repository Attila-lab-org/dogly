import type { FeedbackValue } from '../../contracts/types';
import { behaviorResultsMock, diaryEntriesMock } from '../../mocks/core';

const FEEDBACK_LABELS: Record<FeedbackValue, string> = {
  YES: 'sì, è così',
  NO: 'non credo',
  UNKNOWN: 'non lo so',
};

function patchLocalMocks(eventId: string, value: FeedbackValue) {
  const result = behaviorResultsMock[eventId];
  if (result) result.feedback = value;

  const diaryEntry = diaryEntriesMock.find((entry) => entry.refId === eventId);
  if (diaryEntry) {
    const confidence = diaryEntry.subtitle?.split(' · ')[0] ?? null;
    diaryEntry.subtitle = confidence
      ? `${confidence} · Feedback: ${FEEDBACK_LABELS[value]}`
      : `Feedback: ${FEEDBACK_LABELS[value]}`;
  }
}

/**
 * POST /v1/behavior/events/{id}/feedback.
 * Regola "mai finto successo": un errore di rete/API propaga al caller, che
 * mostra "Non salvato — riprova" e NON accende il badge "Salvato".
 * Salvataggio solo-locale ammesso per il mock gate dev: eventi demo (evt-*)
 * oppure API non configurata (getApiBaseUrl solleva prima ancora di fetch).
 * Nessun riferimento diretto a EXPO_PUBLIC_* (Jest + expo/virtual/env).
 */
function isApiNotConfiguredError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.startsWith('EXPO_PUBLIC_API_URL non configurata')
  );
}

export async function saveBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
): Promise<FeedbackValue> {
  if (eventId.startsWith('evt-')) {
    patchLocalMocks(eventId, value);
    return value;
  }
  try {
    // require lazy: l'API client carica moduli nativi (SecureStore) che non
    // devono essere caricati in contesti senza runtime nativo (es. Jest).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { postBehaviorFeedback } = require('../behavior/api') as typeof import('../behavior/api');
    const res = await postBehaviorFeedback(eventId, value);
    patchLocalMocks(eventId, res.value);
    return res.value;
  } catch (err) {
    if (isApiNotConfiguredError(err)) {
      patchLocalMocks(eventId, value);
      return value;
    }
    throw err;
  }
}
