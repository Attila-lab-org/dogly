import type { ConfidenceBand } from '../../contracts/types';
import {
  SAFETY_FLAG_CODES,
  type CandidateLevel,
  type FecalEventResult,
  type SafetyFlagCode,
} from '../secondary/types';

export type ApiSafetyFlag = { code: string; severity?: string };

export type ApiDigestiveEvent = {
  id: string;
  dog_id: string;
  status: string;
  fecal_score_estimate: number | null;
  consistency: string | null;
  color: string | null;
  image_quality: string;
  quality_warnings: string[];
  mucus_candidate: string;
  fresh_blood_candidate: string;
  melena_candidate: string;
  foreign_material_candidate: string;
  confidence_band: ConfidenceBand | null;
  safety_flags: Array<ApiSafetyFlag | string>;
  summary: string | null;
  active_food_name: string | null;
  baseline_comparison: string | null;
  overall_state?: 'ROUTINE' | 'MONITOR' | 'ATTENTION' | 'VET_CONTACT' | null;
  consumer_headline?: string | null;
  consumer_summary?: string | null;
  relevant_context?: string[];
  possible_associations?: string[];
  recommended_next_step?: string | null;
  followup_key?:
    | 'vomiting_today'
    | 'reduced_activity_today'
    | 'unusual_food_48h'
    | null;
  followup_question?: string | null;
  what_to_watch?: string[];
  observation_reliability?: string | null;
  reasoning_version?: string | null;
  baseline_version?: string | null;
  created_at: string;
};

const CONSISTENCY_VALUES = [
  'dura',
  'formata',
  'morbida',
  'non formata',
  'liquida',
  'sconosciuta',
] as const;

type Consistency = (typeof CONSISTENCY_VALUES)[number];

const CONSISTENCY_FROM_API: Record<string, Consistency> = {
  hard: 'dura',
  formed: 'formata',
  soft: 'morbida',
  unformed: 'non formata',
  watery: 'liquida',
  unknown: 'sconosciuta',
  dura: 'dura',
  formata: 'formata',
  morbida: 'morbida',
  'non formata': 'non formata',
  liquida: 'liquida',
  sconosciuta: 'sconosciuta',
};

function mapConsistency(value: string | null): Consistency {
  return CONSISTENCY_FROM_API[(value ?? '').toLowerCase()] ?? 'sconosciuta';
}

function mapSafetyFlags(
  flags: Array<ApiSafetyFlag | string> | undefined,
): SafetyFlagCode[] {
  return (flags ?? [])
    .map((flag) => (typeof flag === 'string' ? flag : flag.code))
    .filter((code): code is SafetyFlagCode =>
      (SAFETY_FLAG_CODES as readonly string[]).includes(code),
    );
}

const CANDIDATE_LEVELS: CandidateLevel[] = [
  'none_observed',
  'possible',
  'clear_candidate',
  'unknown',
];

function mapCandidate(value: string | null | undefined): CandidateLevel {
  return CANDIDATE_LEVELS.includes(value as CandidateLevel)
    ? (value as CandidateLevel)
    : 'unknown';
}

function mapBaselineComparison(value: string | null | undefined): string {
  switch (value) {
    case 'ABOVE_USUAL':
      return 'Più morbide rispetto alle osservazioni recenti.';
    case 'BELOW_USUAL':
      return 'Più compatte rispetto alle osservazioni recenti.';
    case 'NEAR_USUAL':
      return 'Simili alle osservazioni recenti.';
    default:
      return 'Non conosco ancora abbastanza il suo solito digestivo.';
  }
}

/** Mapping onesto: mostriamo solo ciò che il backend fornisce davvero. */
export function mapApiDigestiveEventToResult(
  event: ApiDigestiveEvent,
): FecalEventResult {
  const insufficient = event.status === 'INSUFFICIENT_IMAGE';
  return {
    eventId: event.id,
    dogId: event.dog_id,
    status: insufficient
      ? 'INSUFFICIENT_IMAGE'
      : event.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'PROCESSING',
    imageQuality:
      insufficient || event.image_quality === 'insufficient'
        ? 'insufficient'
        : 'sufficient',
    qualityWarnings: event.quality_warnings ?? [],
    fecalScoreEstimate: event.fecal_score_estimate,
    consistency: mapConsistency(event.consistency),
    color: event.color ?? 'non determinato',
    mucusCandidate: mapCandidate(event.mucus_candidate),
    bloodCandidate: mapCandidate(event.fresh_blood_candidate),
    melenaCandidate: mapCandidate(event.melena_candidate),
    foreignMaterialCandidate: mapCandidate(event.foreign_material_candidate),
    confidenceBand: event.confidence_band ?? 'LOW',
    safetyFlags: mapSafetyFlags(event.safety_flags),
    activeFoodName: event.active_food_name,
    baselineComparison: mapBaselineComparison(event.baseline_comparison),
    overallState: event.overall_state ?? undefined,
    consumerHeadline: event.consumer_headline,
    consumerSummary: event.consumer_summary,
    relevantContext: event.relevant_context ?? [],
    possibleAssociations: event.possible_associations ?? [],
    recommendedNextStep: event.recommended_next_step,
    followupKey: event.followup_key,
    followupQuestion: event.followup_question,
    whatToWatch: event.what_to_watch ?? [],
    observationReliability: event.observation_reliability,
    reasoningVersion: event.reasoning_version,
    baselineVersion: event.baseline_version,
    createdAt: event.created_at,
  };
}
