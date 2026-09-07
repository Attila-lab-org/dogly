/**
 * Tipi dei domini secondari (pattern, digestione, nutrizione, abbonamento,
 * privacy). Mirror dei campi canonici della Spec V1 (sez. 10.2–10.4, 17.2,
 * 19–21, 23). Le tipizzazioni comportamentali condivise restano in
 * src/contracts/types.ts (ownership F1) — qui solo i domini F2.
 */
import type { ConfidenceBand, PatternState } from '../../contracts/types';

/** Pattern personale visibile all'owner (sez. 17.2 / public.personal_patterns). */
export interface PersonalPattern {
  id: string;
  dogId: string;
  title: string;
  state: PatternState;
  /** Eventi indipendenti che supportano il pattern */
  supportCount: number;
  /** Feedback owner "Sì, è così" collegati */
  confirmCount: number;
  /** Evidenze in contraddizione */
  contradictCount: number;
  reliabilityBand: ConfidenceBand;
  firstSeen: string;
  lastSeen: string;
  /** Spiegazione trasparente delle evidenze (sez. 6.1 / 17.3) */
  evidenceNotes: string[];
}

/** Baseline digestiva longitudinale (sez. 19.2 / public.digestive_baselines). */
export interface DigestiveBaseline {
  dogId: string;
  /** Score fecale medio mobile (scala 1–7), null se dati insufficienti */
  rollingScore: number | null;
  observedEvents: number;
  variability: 'bassa' | 'media' | 'alta' | 'sconosciuta';
  dataSufficiency: 'insufficiente' | 'sufficiente';
  trendSummary: string;
}

/** Candidati osservabili: mai "assenza provata" (sez. 19.1). */
export type CandidateLevel = 'none_observed' | 'possible' | 'clear_candidate' | 'unknown';

/** Flag di sicurezza deterministici (sez. 19.3) — coprono il routing a copy fisso. */
export const SAFETY_FLAG_CODES = [
  'BLOOD_CANDIDATE',
  'MELENA_CANDIDATE',
  'FOREIGN_MATERIAL_CANDIDATE',
  'REPEATED_WATERY',
  'DIGESTIVE_SYMPTOMS',
  'RAPID_WORSENING',
] as const;
export type SafetyFlagCode = (typeof SAFETY_FLAG_CODES)[number];

/** Osservazione fecale strutturata mostrata al consumer (sez. 19.1). */
export interface FecalEventResult {
  eventId: string;
  dogId: string;
  status: 'COMPLETED' | 'INSUFFICIENT_IMAGE' | 'PROCESSING';
  /** Qualità immagine (mirror StoolObservationContract.image_quality, sez. 19.1) */
  imageQuality: 'sufficient' | 'insufficient';
  /** Warning di qualità dal vision layer (mirror warnings, sez. 15/19.1) */
  qualityWarnings: string[];
  /** Stima 1–7: mostrata SEMPRE come stima, mai misura di laboratorio */
  fecalScoreEstimate: number | null;
  consistency: 'dura' | 'formata' | 'morbida' | 'non formata' | 'liquida' | 'sconosciuta';
  color: string;
  mucusCandidate: CandidateLevel;
  bloodCandidate: CandidateLevel;
  melenaCandidate: CandidateLevel;
  foreignMaterialCandidate: CandidateLevel;
  confidenceBand: ConfidenceBand;
  safetyFlags: SafetyFlagCode[];
  /** Cibo attivo al momento dell'evento (link FeedingPeriod, sez. 19.2) */
  activeFoodName: string | null;
  /** Confronto Rocky-vs-Rocky con la baseline */
  baselineComparison: string;
  /** Digestive Intelligence V2; opzionali per eventi storici pre-v2. */
  overallState?: 'ROUTINE' | 'MONITOR' | 'ATTENTION' | 'VET_CONTACT';
  consumerHeadline?: string | null;
  consumerSummary?: string | null;
  relevantContext?: string[];
  possibleAssociations?: string[];
  recommendedNextStep?: string | null;
  followupKey?: 'vomiting_today' | 'reduced_activity_today' | 'unusual_food_48h' | null;
  followupQuestion?: string | null;
  whatToWatch?: string[];
  observationReliability?: string | null;
  reasoningVersion?: string | null;
  baselineVersion?: string | null;
  createdAt: string;
}

/** Prodotto alimentare (sez. 20 / public.food_products). */
export interface FoodProduct {
  id: string;
  brand: string;
  name: string;
  ingredientsRaw: string | null;
  guaranteedAnalysis: {
    crudeProteinMin: number | null;
    crudeFatMin: number | null;
    crudeFiberMax: number | null;
    moistureMax: number | null;
  };
  calories: string | null;
  /** Confidence OCR per campo: i campi LOW richiedono verifica (sez. 20.2) */
  fieldConfidence: Record<string, ConfidenceBand>;
  verifiedAt: string | null;
}

/** Periodo di alimentazione attivo (sez. 20.1 / public.feeding_periods). */
export interface FeedingPeriod {
  id: string;
  dogId: string;
  foodProductId: string;
  startedAt: string;
  endedAt: string | null;
  quantityPerDay: string | null;
}

/** Piano e quote (sez. 21 — mai unlimited, quote server-side). */
export type PlanCode = 'FREE' | 'PREMIUM_MONTHLY' | 'PREMIUM_ANNUAL';

export interface UsageLedger {
  behaviorLimit: number;
  behaviorUsed: number;
  digestiveLimit: number;
  digestiveUsed: number;
  resetsAt: string;
}

export interface SubscriptionState {
  plan: PlanCode;
  renewsAt: string | null;
  usage: UsageLedger;
}

/** Consensi separati (sez. 23.1): ricerca/training OFF di default. */
export interface ConsentState {
  service: boolean;
  researchTraining: boolean;
  notifications: boolean;
  keepClip: boolean;
}
