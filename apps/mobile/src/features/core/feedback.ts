import type { FeedbackValue } from '../../contracts/types';

export async function saveBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
  extras?: { correction_label?: string | null },
): Promise<FeedbackValue> {
  // require lazy: l'API client carica moduli nativi (SecureStore) che non
  // devono essere caricati in contesti senza runtime nativo (es. Jest).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { postBehaviorFeedback } = require('../behavior/api') as typeof import('../behavior/api');
  const res = await postBehaviorFeedback(eventId, value, extras);
  return res.value;
}
