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
 * POST /v1/behavior/events/{id}/feedback; fallback mock se API assente.
 * Nessun riferimento diretto a EXPO_PUBLIC_* (Jest + expo/virtual/env).
 */
export async function saveBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
): Promise<FeedbackValue> {
  try {
    const { postBehaviorFeedback } = await import('../behavior/api');
    const res = await postBehaviorFeedback(eventId, value);
    patchLocalMocks(eventId, res.value);
    return res.value;
  } catch {
    patchLocalMocks(eventId, value);
    return value;
  }
}
