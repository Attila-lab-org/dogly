/**
 * Decisione di progressione per gli eventi mock della processing screen.
 * Gli stati terminali mock (qualità rifiutata, errore terminale, retry
 * automatico) restano visibili: mai redirect forzato a un risultato finto.
 */
import type { BehaviorEventStatus } from '../../contracts/types';

export type MockProcessingAction =
  | { type: 'redirect-result'; eventId: string }
  | { type: 'simulate-progress' }
  | { type: 'stay' };

export function mockProcessingAction(input: {
  eventId: string;
  status: BehaviorEventStatus;
}): MockProcessingAction {
  if (input.status === 'COMPLETED') {
    return { type: 'redirect-result', eventId: input.eventId };
  }
  if (
    input.status === 'REJECTED_QUALITY' ||
    input.status === 'FAILED_TERMINAL' ||
    input.status === 'FAILED_RETRYABLE' ||
    input.status === 'CANCELLED'
  ) {
    return { type: 'stay' };
  }
  // QUEUED / OBSERVING / INTERPRETING: la demo simula una pipeline che
  // termina; il redirect va al risultato demo (evt-play) solo in quel caso.
  return { type: 'simulate-progress' };
}
