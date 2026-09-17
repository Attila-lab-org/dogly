import {
  type BehaviorEventResult,
  type BehaviorIntent,
  type EvidenceItem,
  type EvidenceSource,
} from '../../contracts/types';
import type { ApiBehaviorEvent, ApiEvidenceItem } from './api';
import { consumerCopy } from '../core/conversationCopy';

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
    label: consumerCopy(item.label ?? item.description ?? 'Segnale osservato'),
    ref: item.ref ?? undefined,
  }));
}

export function mapApiEventToResult(
  event: ApiBehaviorEvent,
): BehaviorEventResult {
  const intent = (event.primary_intent as BehaviorIntent | null) ?? null;
  // FIX 3.9: do not invent summary, confidence, or policy/taxonomy versions
  // when the API omits them. The UI renders null/empty gracefully; a
  // fabricated value masks a real backend omission.
  return {
    eventId: event.id,
    dogId: event.dog_id,
    status: event.status,
    primary_intent: intent,
    confidence_band: event.confidence_band ?? null,
    consumer_summary: event.summary ? consumerCopy(event.summary) : null,
    evidence: mapEvidence(event.evidence ?? []),
    alternatives: (event.alternatives ?? []).map((alt) => ({
      intent: alt.intent as BehaviorIntent,
      rationale: consumerCopy(alt.rationale),
    })),
    feedback: event.feedback ?? null,
    safety_flags: event.safety_flags ?? [],
    needs_context: event.needs_context,
    context_question: event.context_question
      ? consumerCopy(event.context_question)
      : event.context_question,
    context_options: (event.context_options ?? []).map((option) => ({
      ...option,
      label: consumerCopy(option.label),
    })),
    context_effect: event.context_effect
      ? consumerCopy(event.context_effect)
      : null,
    dog_voice: event.dog_voice ? consumerCopy(event.dog_voice) : null,
    sound_note: event.sound_note ? consumerCopy(event.sound_note) : null,
    schema_version: event.schema_version,
    policy_version: event.policy_version ?? null,
    taxonomy_version: event.taxonomy_version ?? null,
    created_at: event.created_at,
    completed_at: event.completed_at,
    consumer_headline: event.consumer_headline
      ? consumerCopy(event.consumer_headline)
      : null,
    baseline_note: event.baseline_note
      ? consumerCopy(event.baseline_note)
      : null,
    baseline_comparison: event.baseline_comparison ?? null,
    recommended_next_step: event.recommended_next_step
      ? consumerCopy(event.recommended_next_step)
      : null,
    what_to_watch: event.what_to_watch
      ? consumerCopy(event.what_to_watch)
      : null,
    safety: event.safety ?? null,
  };
}
