import {
  BEHAVIOR_INTENT_LABELS,
  type BehaviorEventResult,
  type BehaviorIntent,
  type EvidenceItem,
  type EvidenceSource,
} from '../../contracts/types';
import type { ApiBehaviorEvent, ApiEvidenceItem } from './api';

const SOURCE_MAP: Record<string, EvidenceSource> = {
  observation: 'OBSERVATION',
  OBSERVATION: 'OBSERVATION',
  context: 'CONTEXT',
  CONTEXT: 'CONTEXT',
  personal_pattern: 'PERSONAL_PATTERN',
  PERSONAL_PATTERN: 'PERSONAL_PATTERN',
  scientific_kb: 'SCIENTIFIC_KB',
  SCIENTIFIC_KB: 'SCIENTIFIC_KB',
  life_stage: 'LIFE_STAGE',
  LIFE_STAGE: 'LIFE_STAGE',
  lifestyle_baseline: 'LIFESTYLE_BASELINE',
  LIFESTYLE_BASELINE: 'LIFESTYLE_BASELINE',
};

function mapEvidence(items: ApiEvidenceItem[]): EvidenceItem[] {
  return items.map((item) => ({
    source: SOURCE_MAP[item.source] ?? 'UNKNOWN',
    label: item.label ?? item.description ?? 'Segnale osservato',
    ref: item.ref ?? undefined,
  }));
}

function fallbackSummary(
  intent: BehaviorIntent | null,
  summary: string | null,
): string {
  if (summary) return summary;
  if (!intent) {
    return 'Non ci sono abbastanza segnali per una lettura affidabile.';
  }
  return BEHAVIOR_INTENT_LABELS[intent];
}

export function mapApiEventToResult(
  event: ApiBehaviorEvent,
): BehaviorEventResult {
  const intent = (event.primary_intent as BehaviorIntent | null) ?? null;
  return {
    eventId: event.id,
    dogId: event.dog_id,
    status: event.status,
    primary_intent: intent,
    confidence_band: event.confidence_band ?? 'LOW',
    consumer_summary: fallbackSummary(intent, event.summary),
    evidence: mapEvidence(event.evidence ?? []),
    alternatives: (event.alternatives ?? []).map((alt) => ({
      intent: alt.intent as BehaviorIntent,
      rationale: alt.rationale,
    })),
    feedback: event.feedback ?? null,
    safety_flags: event.safety_flags ?? [],
    needs_context: event.needs_context,
    context_question: event.context_question,
    schema_version: event.schema_version,
    policy_version: event.policy_version ?? 'canine-interpretation/v0',
    taxonomy_version: event.taxonomy_version ?? 'intent-taxonomy/v0',
    created_at: event.created_at,
    completed_at: event.completed_at,
  };
}
