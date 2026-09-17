/**
 * Selezione del consiglio da mostrare (Advice Engine V2, ADR-012).
 * Regole:
 * - max 1 consiglio per risultato, sempre dal payload API (mai inventato);
 * - niente card per INSUFFICIENT/AMBIGUOUS o risultati non completati;
 * - intent safety: se il backend non manda un consiglio, la nota di
 *   sicurezza ha priorità e la card resta spenta.
 */
import type { BehaviorEventResult, BehaviorIntent } from '../../contracts/types';
import {
  NON_ACTIONABLE_INTENTS,
  SAFETY_SUPPRESSED_INTENTS,
  type AdviceItem,
} from './types';

export function isSafetySuppressedIntent(intent: BehaviorIntent | null): boolean {
  return intent !== null && SAFETY_SUPPRESSED_INTENTS.includes(intent);
}

export function isActionableIntent(intent: BehaviorIntent | null): boolean {
  return intent !== null && !NON_ACTIONABLE_INTENTS.includes(intent);
}

export type SelectAdviceOptions = {
  apiAdvice?: AdviceItem | null;
};

export function selectAdvice(
  result: Pick<BehaviorEventResult, 'status' | 'primary_intent' | 'safety'>,
  options: SelectAdviceOptions = {},
): AdviceItem | null {
  if (result.status !== 'COMPLETED') return null;
  if (result.safety) return null;
  const intent = result.primary_intent;
  if (!isActionableIntent(intent)) return null;
  return options.apiAdvice ?? null;
}
