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

export async function saveBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
  mockGate = false,
  extras?: { correction_label?: string | null },
): Promise<FeedbackValue> {
  if (mockGate) {
    patchLocalMocks(eventId, value);
    return value;
  }
  // require lazy: l'API client carica moduli nativi (SecureStore) che non
  // devono essere caricati in contesti senza runtime nativo (es. Jest).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { postBehaviorFeedback } = require('../behavior/api') as typeof import('../behavior/api');
  const res = await postBehaviorFeedback(eventId, value, extras);
  return res.value;
}
