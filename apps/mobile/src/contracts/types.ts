/**
 * Tipi contratto consumer — mirror dei valori canonici della Spec V1.
 * Fonte di verità: backend (Pydantic/OpenAPI, sez. 3.1). Questi tipi sono
 * allineati a: sez. 5.3 (client state), 6.1 (result contract), 16.2
 * (tassonomia intent chiusa), 33 (Appendix A — status & policy values).
 */

/** Confidence band (sez. 33.4). MAI percentuali in UI finché non calibrate (O-07). */
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

/** Feedback a tre vie (sez. 33.2 / 6.1). Nessuna penalità UX per UNKNOWN. */
export type FeedbackValue = 'YES' | 'NO' | 'UNKNOWN';

/**
 * Tassonomia intent chiusa V0 (sez. 16.2).
 * primary_intent è uno di questi codici oppure null se INSUFFICIENT.
 */
export const BEHAVIOR_INTENTS = [
  'PLAY_INTERACTION',
  'ATTENTION_REQUEST',
  'OUTSIDE_REQUEST',
  'ALERT_VIGILANCE',
  'DISCOMFORT_AVOIDANCE',
  'FEAR_INSECURITY',
  'HIGH_AROUSAL',
  'FRUSTRATION',
  'RELAX_REST',
  'RESOURCE_TENSION',
  'AMBIGUOUS',
  'INSUFFICIENT',
] as const;

export type BehaviorIntent = (typeof BEHAVIOR_INTENTS)[number];

/** Significato consumer in italiano (sez. 16.2, wording probabilistico). */
export const BEHAVIOR_INTENT_LABELS: Record<BehaviorIntent, string> = {
  PLAY_INTERACTION: 'Sembra voler giocare',
  ATTENTION_REQUEST: 'Sta cercando la tua attenzione',
  OUTSIDE_REQUEST: 'Possibile richiesta di uscire',
  ALERT_VIGILANCE: 'È molto attento a qualcosa',
  DISCOMFORT_AVOIDANCE: 'Sembra a disagio e potrebbe voler più spazio',
  FEAR_INSECURITY: 'Segnali compatibili con paura o forte insicurezza',
  HIGH_AROUSAL: 'È molto attivato o eccitato',
  FRUSTRATION: 'Potrebbe essere frustrato',
  RELAX_REST: 'Sembra rilassato',
  RESOURCE_TENSION: "C'è tensione intorno a questa risorsa",
  AMBIGUOUS: 'Due o più ipotesi vicine',
  INSUFFICIENT: 'Non ci sono abbastanza segnali',
};

/** Stati evento comportamentale (sez. 33.1). */
export const BEHAVIOR_EVENT_STATUSES = [
  'DRAFT',
  'UPLOADING',
  'QUEUED',
  'OBSERVING',
  'INTERPRETING',
  'COMPLETED',
  'REJECTED_QUALITY',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED',
] as const;

export type BehaviorEventStatus = (typeof BEHAVIOR_EVENT_STATUSES)[number];

/**
 * Stati locali di ogni operazione media (sez. 5.3).
 * local_pending → upload_initializing → uploading → uploaded → processing
 *   → completed / recoverable_error / terminal_error
 */
export const MEDIA_UPLOAD_STATES = [
  'local_pending',
  'upload_initializing',
  'uploading',
  'uploaded',
  'processing',
  'completed',
  'recoverable_error',
  'terminal_error',
] as const;

export type MediaUploadState = (typeof MEDIA_UPLOAD_STATES)[number];

/** Domini di analisi (sez. 33.6). */
export const ANALYSIS_DOMAINS = ['BEHAVIOR', 'DIGESTIVE', 'FOOD_LABEL'] as const;
export type AnalysisDomain = (typeof ANALYSIS_DOMAINS)[number];

/** Stati pattern personali (sez. 33.3). */
export const PATTERN_STATES = [
  'CANDIDATE',
  'PRELIMINARY',
  'ESTABLISHED',
  'STRONG',
  'CONTESTED',
  'DORMANT',
  'ARCHIVED',
] as const;
export type PatternState = (typeof PATTERN_STATES)[number];

/** Context bucket V0 (sez. 33.7). */
export const CONTEXT_BUCKETS = [
  'HOME',
  'OUTDOORS',
  'WALK',
  'PLAY',
  'FEEDING',
  'DOOR_EXIT',
  'REST',
  'STRANGER',
  'OTHER_DOG',
  'VEHICLE',
  'HANDLING',
  'UNKNOWN',
] as const;
export type ContextBucket = (typeof CONTEXT_BUCKETS)[number];

/** Fonte tipizzata di un singolo elemento di evidenza (sez. 6.1). */
export type EvidenceSource =
  | 'OBSERVATION'
  | 'CONTEXT'
  | 'PERSONAL_PATTERN'
  | 'SCIENTIFIC_KB'
  | 'LIFE_STAGE'
  | 'LIFESTYLE_BASELINE'
  | 'UNKNOWN';

export interface EvidenceItem {
  source: EvidenceSource;
  /** Testo breve mostrato in UI (es. "Postura di gioco") */
  label: string;
  /** Riferimento opzionale (pattern_id / observation field) */
  ref?: string;
}

/** Ipotesi alternativa (0–2, sez. 6.1 / InterpretationContract). */
export interface AlternativeHypothesis {
  intent: BehaviorIntent;
  rationale: string;
}

/**
 * Contratto risultato comportamentale mostrato al consumer (sez. 6.1).
 * - primary_intent: codice tassonomia chiusa o null se insufficiente
 * - confidence_band: band LOW/MEDIUM/HIGH, MAI percentuale
 * - consumer_summary: breve, prudente ("sembra / probabilmente / possibile")
 * - evidence: 3–5 bullet legati all'evento corrente
 * - alternatives: 0–2 ipotesi plausibili
 * - feedback: feedback owner a tre vie, se già registrato
 */
export interface BehaviorEventResult {
  eventId: string;
  dogId: string;
  status: BehaviorEventStatus;
  primary_intent: BehaviorIntent | null;
  confidence_band: ConfidenceBand;
  consumer_summary: string;
  evidence: EvidenceItem[];
  alternatives: AlternativeHypothesis[];
  feedback: FeedbackValue | null;
  safety_flags?: Array<{ code: string; severity: string }>;
  needs_context?: boolean;
  context_question?: string | null;
  /** Versioni obbligatorie per audit e replay (sez. 16.3) */
  schema_version: string;
  policy_version: string;
  taxonomy_version: string;
  created_at: string;
  completed_at: string | null;
}
