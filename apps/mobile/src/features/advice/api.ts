/**
 * Advice Engine V2 — API client (ADR-012, brief sez. 13).
 *
 * L'endpoint outcome è owner-scoped e append-only. Nel mock gate il dato
 * resta nello store di sessione; con API attiva ogni errore arriva al caller
 * che mostra "Non salvato — riprova" (mai finto successo).
 *
 * Il consiglio arriva dal campo `advice` di GET behavior event; assente →
 * niente card.
 */
import { isApiConfigured, shouldUseMockAuthGate } from '../auth/env';
import { saveAdviceOutcomeLocal } from './store';
import type {
  AdviceOutcome,
  AdviceOutcomeValue,
} from './types';
export { mapApiAdviceItem } from './map';
export type { ApiAdviceItem } from './map';

type AdviceOutcomeResponse = {
  id: string;
  event_id: string;
  dog_id: string;
  advice_code: string;
  outcome: AdviceOutcomeValue;
  created_at: string;
};

/** Mock gate: stessa regola di feedback.ts (id demo o API non configurata). */
function useMockGate(eventId: string): boolean {
  return (
    eventId.startsWith('evt-') || shouldUseMockAuthGate() || !isApiConfigured()
  );
}

/**
 * POST /v1/behavior/events/{eventId}/advice-outcome (owner-scoped).
 * Ritorna l'outcome salvato; solleva onestamente in caso di errore.
 */
export async function saveAdviceOutcome(
  eventId: string,
  adviceCode: string,
  outcome: AdviceOutcomeValue,
): Promise<AdviceOutcome> {
  if (useMockGate(eventId)) {
    return saveAdviceOutcomeLocal(eventId, adviceCode, outcome);
  }
  // require lazy: l'API client carica moduli nativi (SecureStore) che non
  // devono essere caricati in contesti senza runtime nativo (es. Jest).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { api } = require('../../lib/apiClient') as typeof import('../../lib/apiClient');
  const key = `advice-outcome-${eventId}-${adviceCode}-${Date.now()}`;
  const res = await api.post<AdviceOutcomeResponse>(
    `/v1/behavior/events/${eventId}/advice-outcome`,
    { advice_code: adviceCode, outcome },
    { headers: { 'X-Idempotency-Key': key } },
  );
  // Cache di sessione solo dopo successo reale: il Diario mostra lo stato.
  return saveAdviceOutcomeLocal(res.event_id, res.advice_code, res.outcome);
}
