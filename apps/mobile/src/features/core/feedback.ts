import type { FeedbackValue } from '../../contracts/types';
import { behaviorResultsMock, diaryEntriesMock } from '../../mocks/core';

const FEEDBACK_LABELS: Record<FeedbackValue, string> = {
  YES: 'sì, è così',
  NO: 'non credo',
  UNKNOWN: 'non lo so',
};

/**
 * Persistenza demo immediata. Quando la sessione reale sarà collegata,
 * questa funzione diventerà l'adapter della POST /v1/.../feedback.
 */
export function saveBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
): FeedbackValue {
  const result = behaviorResultsMock[eventId];
  if (result) result.feedback = value;

  const diaryEntry = diaryEntriesMock.find((entry) => entry.refId === eventId);
  if (diaryEntry) {
    const confidence = diaryEntry.subtitle?.split(' · ')[0] ?? null;
    diaryEntry.subtitle = confidence
      ? `${confidence} · Feedback: ${FEEDBACK_LABELS[value]}`
      : `Feedback: ${FEEDBACK_LABELS[value]}`;
  }

  return value;
}
