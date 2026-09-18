import type { ConfidenceBand } from '../../contracts/types';
import {
  SAFETY_FLAG_CODES,
  type CandidateLevel,
  type DigestiveUsefulAction,
  type DigestiveUsefulActionKey,
  type FecalEventResult,
  type SafetyFlagCode,
} from '../secondary/types';
import {
  consumerCopy,
  mediaQualityCopy,
} from '../core/conversationCopy';

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
  undigested_food_candidate?: string;
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
  useful_action?: {
    key?: DigestiveUsefulActionKey | null;
    label?: string | null;
    href?: string | null;
    title?: string | null;
    body?: string | null;
  } | null;
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

const COLOR_FAMILY_IT: Record<string, string> = {
  BROWN: 'marrone',
  DARK_BROWN: 'marrone scuro',
  LIGHT_BROWN: 'marrone chiaro',
  GREEN_BROWN: 'marrone con una tonalità verdastra',
  GREEN: 'verde',
  YELLOW: 'giallo',
  ORANGE: 'arancione',
  RED_APPEARANCE: 'con una tonalità rossastra',
  BLACK_TARRY_APPEARANCE: 'molto scuro, quasi nero',
  PALE_GRAY: 'chiaro, tendente al grigio',
};

function canonicalizeColorFamily(value: string | null): string {
  const upper = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (upper in COLOR_FAMILY_IT) {
    return upper;
  }
  if ((value ?? '').toLowerCase().includes('olive')) {
    return 'GREEN_BROWN';
  }
  const tokens = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token !== 'unknown')
    .map((token) => {
      if (token === 'grey' || token === 'greyish' || token === 'grayish') return 'gray';
      if (token === 'olive' || token === 'olivegreen' || token === 'greenish') return 'green';
      if (token === 'brownish') return 'brown';
      return token;
    });
  const has = new Set(tokens);
  if (tokens.length === 0) return 'UNKNOWN';
  if (has.has('black') || has.has('tarry')) return 'BLACK_TARRY_APPEARANCE';
  if (has.has('red') || has.has('blood')) return 'RED_APPEARANCE';
  if ((has.has('pale') || has.has('gray')) && !has.has('brown')) return 'PALE_GRAY';
  if (has.has('yellow') && !has.has('brown') && !has.has('green')) return 'YELLOW';
  if (has.has('orange') && !has.has('brown')) return 'ORANGE';
  if (has.has('green') && has.has('brown')) return 'GREEN_BROWN';
  if (has.has('green')) return 'GREEN';
  if (has.has('brown') && (has.has('dark') || has.has('deep'))) return 'DARK_BROWN';
  if (has.has('brown') && (has.has('light') || has.has('pale'))) return 'LIGHT_BROWN';
  if (has.has('brown')) return 'BROWN';
  return 'OTHER';
}

function mapColor(value: string | null): string {
  const family = canonicalizeColorFamily(value);
  if (family === 'UNKNOWN') return 'non determinato';
  return COLOR_FAMILY_IT[family] ?? 'un colore non usuale';
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

const USEFUL_ACTION_KEYS: DigestiveUsefulActionKey[] = [
  'contact_vet',
  'add_nutrition',
  'complete_nutrition',
  'ask_followup',
  'contextual',
  'none',
];

function mapUsefulAction(
  action: ApiDigestiveEvent['useful_action'],
): DigestiveUsefulAction | null {
  if (!action?.key || !USEFUL_ACTION_KEYS.includes(action.key)) {
    return null;
  }
  return {
    key: action.key,
    label: action.label ?? null,
    href: action.href ?? null,
    title: action.title ? consumerCopy(action.title) : action.title,
    body: action.body ? consumerCopy(action.body) : action.body,
  };
}

function mapCandidate(value: string | null | undefined): CandidateLevel {
  return CANDIDATE_LEVELS.includes(value as CandidateLevel)
    ? (value as CandidateLevel)
    : 'unknown';
}

function mapBaselineComparison(value: string | null | undefined): string {
  switch (value) {
    case 'ABOVE_USUAL':
      return 'Oggi è un po’ più morbida rispetto alle ultime osservazioni.';
    case 'BELOW_USUAL':
      return 'Oggi è un po’ più compatta rispetto alle ultime osservazioni.';
    case 'NEAR_USUAL':
      return 'È in linea con le ultime osservazioni.';
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
    qualityWarnings: (event.quality_warnings ?? []).map(mediaQualityCopy),
    fecalScoreEstimate: event.fecal_score_estimate,
    consistency: mapConsistency(event.consistency),
    color: mapColor(event.color),
    mucusCandidate: mapCandidate(event.mucus_candidate),
    bloodCandidate: mapCandidate(event.fresh_blood_candidate),
    melenaCandidate: mapCandidate(event.melena_candidate),
    foreignMaterialCandidate: mapCandidate(event.foreign_material_candidate),
    undigestedFoodCandidate: mapCandidate(event.undigested_food_candidate),
    confidenceBand: event.confidence_band ?? null,
    safetyFlags: mapSafetyFlags(event.safety_flags),
    activeFoodName: event.active_food_name,
    baselineComparison: mapBaselineComparison(event.baseline_comparison),
    overallState: event.overall_state ?? undefined,
    consumerHeadline: event.consumer_headline
      ? consumerCopy(event.consumer_headline)
      : event.consumer_headline,
    consumerSummary: event.consumer_summary
      ? consumerCopy(event.consumer_summary)
      : event.consumer_summary,
    relevantContext: (event.relevant_context ?? []).map(consumerCopy),
    possibleAssociations: (event.possible_associations ?? []).map(consumerCopy),
    recommendedNextStep: event.recommended_next_step
      ? consumerCopy(event.recommended_next_step)
      : event.recommended_next_step,
    followupKey: event.followup_key,
    followupQuestion: event.followup_question
      ? consumerCopy(event.followup_question)
      : event.followup_question,
    usefulAction: mapUsefulAction(event.useful_action),
    whatToWatch: event.what_to_watch ?? [],
    observationReliability: event.observation_reliability
      ? consumerCopy(event.observation_reliability)
      : event.observation_reliability,
    reasoningVersion: event.reasoning_version,
    baselineVersion: event.baseline_version,
    createdAt: event.created_at,
  };
}
