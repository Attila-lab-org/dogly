/**
 * Behavior events / capture / feedback API (sez. 9).
 */
import type {
  BehaviorEventResult,
  BehaviorEventStatus,
  BehaviorIntent,
  ConfidenceBand,
  EvidenceItem,
  EvidenceSource,
  FeedbackValue,
} from '../../contracts/types';
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
import { api, ApiError } from '../../lib/apiClient';
import type { ApiAdviceItem } from '../advice/map';
import type { AdviceOutcomeValue } from '../advice/types';

/**
 * Quota esaurita lato server (ErrorCode.QUOTA_EXHAUSTED, HTTP 402 — vedi
 * backend/app/contracts/errors.py): il caller instrada al paywall invece di
 * mostrare un generico errore di upload.
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'QUOTA_EXHAUSTED' || err.status === 402)
  );
}

export type ApiEvidenceItem = {
  source: string;
  description?: string;
  label?: string;
  ref?: string | null;
};

export type ApiAlternative = {
  intent: string;
  rationale: string;
};

export type ApiBehaviorEvent = {
  id: string;
  dog_id: string;
  status: BehaviorEventStatus;
  primary_intent: string | null;
  confidence_band: ConfidenceBand | null;
  summary: string | null;
  alternatives: ApiAlternative[];
  evidence: ApiEvidenceItem[];
  safety_flags: string[];
  needs_context: boolean;
  context_question: string | null;
  policy_version: string | null;
  taxonomy_version: string | null;
  feedback?: FeedbackValue | null;
  advice?: ApiAdviceItem | null;
  advice_outcome?: AdviceOutcomeValue | null;
  created_at: string;
  completed_at: string | null;
};

export type CaptureInitResponse = {
  capture_id: string;
  event_id: string;
  status: BehaviorEventStatus;
  upload: {
    url: string;
    storage_path: string;
    expires_at: string;
  };
  quota_reserved: boolean;
};

export type CaptureCompleteResponse = {
  capture_id: string;
  event_id: string;
  status: BehaviorEventStatus;
};

export type FeedbackResponse = {
  event_id: string;
  value: FeedbackValue;
  recorded: boolean;
};

const SOURCE_MAP: Record<string, EvidenceSource> = {
  observation: 'OBSERVATION',
  OBSERVATION: 'OBSERVATION',
  context: 'CONTEXT',
  CONTEXT: 'CONTEXT',
  personal_pattern: 'PERSONAL_PATTERN',
  PERSONAL_PATTERN: 'PERSONAL_PATTERN',
};

function mapEvidence(items: ApiEvidenceItem[]): EvidenceItem[] {
  return items.map((item) => ({
    source: SOURCE_MAP[item.source] ?? 'OBSERVATION',
    label: item.label ?? item.description ?? 'Segnale osservato',
    ref: item.ref ?? undefined,
  }));
}

function fallbackSummary(
  intent: BehaviorIntent | null,
  summary: string | null,
): string {
  if (summary) return summary;
  if (!intent) return 'Non ci sono abbastanza segnali per una lettura affidabile.';
  return BEHAVIOR_INTENT_LABELS[intent];
}

export function mapApiEventToResult(event: ApiBehaviorEvent): BehaviorEventResult {
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
    schema_version: 'behavior-result/1.0',
    policy_version: event.policy_version ?? 'canine-interpretation/v0',
    taxonomy_version: event.taxonomy_version ?? 'intent-taxonomy/v0',
    created_at: event.created_at,
    completed_at: event.completed_at,
  };
}

export async function initBehaviorCapture(body: {
  dog_id: string;
  client_request_id: string;
  duration_ms: number;
  has_audio: boolean;
  bytes: number;
  content_type?: string;
  context_bucket?: string;
}): Promise<CaptureInitResponse> {
  return api.post<CaptureInitResponse>('/v1/behavior/captures/init', body, {
    headers: { 'X-Idempotency-Key': body.client_request_id },
  });
}

export async function completeBehaviorCapture(
  captureId: string,
  idempotencyKey: string,
): Promise<CaptureCompleteResponse> {
  return api.post<CaptureCompleteResponse>(
    `/v1/behavior/captures/${captureId}/complete`,
    {},
    { headers: { 'X-Idempotency-Key': idempotencyKey } },
  );
}

export async function getBehaviorEvent(eventId: string): Promise<ApiBehaviorEvent> {
  return api.get<ApiBehaviorEvent>(`/v1/behavior/events/${eventId}`);
}

export async function postBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
  clientRequestId?: string,
): Promise<FeedbackResponse> {
  const key = clientRequestId ?? `fb-${eventId}-${value}-${Date.now()}`;
  return api.post<FeedbackResponse>(
    `/v1/behavior/events/${eventId}/feedback`,
    { value, client_request_id: key },
    { headers: { 'X-Idempotency-Key': key } },
  );
}

export const IN_PROGRESS_STATUSES: BehaviorEventStatus[] = [
  'DRAFT',
  'UPLOADING',
  'QUEUED',
  'OBSERVING',
  'INTERPRETING',
  'FAILED_RETRYABLE',
];

export function isTerminalBehaviorStatus(status: BehaviorEventStatus): boolean {
  return (
    status === 'COMPLETED' ||
    status === 'REJECTED_QUALITY' ||
    status === 'FAILED_TERMINAL' ||
    status === 'CANCELLED'
  );
}
