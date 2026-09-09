/**
 * Tipi Advice Engine V2 (ADR-012, brief sez. 3/8/11).
 * Mirror consumer dei contratti backend futuri: il consiglio arriva SEMPRE
 * dal catalogo versionato (mai inventato dall'LLM né dal client), max 1 per
 * risultato. L'outcome è evidenza personale dell'owner, non verità scientifica.
 */
import type { BehaviorIntent } from '../../contracts/types';

/** Categorie consiglio, priorità decrescente (brief sez. 11). */
export const ADVICE_CATEGORIES = [
  'URGENT_SAFETY',
  'VET_ESCALATION',
  'LOW_RISK_MANAGEMENT',
  'DEVELOPMENT',
  'ROUTINE',
  'ENRICHMENT',
  'TRAINING',
  'MONITOR',
] as const;

export type AdviceCategory = (typeof ADVICE_CATEGORIES)[number];

/** Tono dell'azione: LOW = proponibile subito, CAUTION = tono prudente. */
export const ADVICE_RISKS = ['LOW', 'CAUTION'] as const;
export type AdviceRisk = (typeof ADVICE_RISKS)[number];

/**
 * Singolo consiglio consumer. Struttura allineata al catalogo backend
 * (`advice_catalog`, brief sez. 11): il mobile non compone mai azioni.
 */
export interface AdviceItem {
  /** Codice catalogo stabile (es. "play-5min-ball") — usato per l'outcome. */
  code: string;
  category: AdviceCategory;
  /** UNA sola azione, linguaggio semplice e concreto. */
  actionText: string;
  /** Spiegazione semplice ("Perché questo consiglio"), MAI citazioni grezze. */
  whyText: string;
  /** Cosa osservare dopo aver provato il consiglio. */
  followUp?: string;
  risk: AdviceRisk;
}

/** Outcome owner (brief sez. 3/8): NOT_TRIED resta lato backend, qui le 3 risposte UI. */
export const ADVICE_OUTCOME_VALUES = ['HELPED', 'DID_NOT_HELP', 'UNKNOWN'] as const;
export type AdviceOutcomeValue = (typeof ADVICE_OUTCOME_VALUES)[number];

export const ADVICE_OUTCOME_LABELS: Record<AdviceOutcomeValue, string> = {
  HELPED: 'Sì',
  DID_NOT_HELP: 'No',
  UNKNOWN: 'Non so',
};

/** Stato mostrato quando l'outcome è già registrato (Diario, risposta data). */
export const ADVICE_OUTCOME_STATE_LABELS: Record<AdviceOutcomeValue, string> = {
  HELPED: 'Utile ✓',
  DID_NOT_HELP: 'Non utile',
  UNKNOWN: 'Non lo so',
};

export interface AdviceOutcome {
  eventId: string;
  adviceCode: string;
  outcome: AdviceOutcomeValue;
  savedAt: string;
}

/** Intent per cui il consiglio è soppresso: la nota di sicurezza ha priorità. */
export const SAFETY_SUPPRESSED_INTENTS: readonly BehaviorIntent[] = [
  'FEAR_INSECURITY',
  'DISCOMFORT_AVOIDANCE',
];

/** Intent senza consiglio per definizione (risultato non azionabile). */
export const NON_ACTIONABLE_INTENTS: readonly BehaviorIntent[] = [
  'INSUFFICIENT',
  'AMBIGUOUS',
];
