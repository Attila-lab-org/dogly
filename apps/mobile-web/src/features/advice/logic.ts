/**
 * Selezione del consiglio da mostrare (Advice Engine V2, ADR-012).
 * Regole (brief sez. 11/13):
 * - max 1 consiglio per risultato, sempre dal catalogo (mai inventato);
 * - niente card per INSUFFICIENT/AMBIGUOUS o risultati non completati;
 * - intent safety (FEAR_INSECURITY / DISCOMFORT_AVOIDANCE): soppresso, la
 *   nota di sicurezza esistente ha priorità e non convive con la card;
 * - con API attiva il consiglio arriva SOLO dal payload evento: assente →
 *   niente card (mai inventare). Il catalogo mock vale solo nel mock gate.
 */
import type { BehaviorEventResult, BehaviorIntent } from '../../contracts/types';
import { adviceCatalogMock } from '../../mocks/advice';
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
  /**
   * Consiglio dal payload API reale (campo `advice` dell'evento, futuro).
   * undefined/null = assente → niente card quando il mock è disattivo.
   */
  apiAdvice?: AdviceItem | null;
  /** true solo in mock gate dev: usa il catalogo mock per intent. */
  useMockCatalog: boolean;
};

export function selectAdvice(
  result: Pick<BehaviorEventResult, 'status' | 'primary_intent'>,
  options: SelectAdviceOptions,
): AdviceItem | null {
  if (result.status !== 'COMPLETED') return null;
  const intent = result.primary_intent;
  if (!isActionableIntent(intent)) return null;
  if (options.apiAdvice) return options.apiAdvice;
  if (isSafetySuppressedIntent(intent)) return null;
  if (options.useMockCatalog) {
    return adviceCatalogMock[intent as BehaviorIntent] ?? null;
  }
  return null;
}
