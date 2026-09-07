/**
 * Behavior events / capture / feedback API (sez. 9).
 */
import type {
  BehaviorEventStatus,
  ConfidenceBand,
  ContextBucket,
  FeedbackValue,
} from '../../contracts/types';
import { api, ApiError } from '../../lib/apiClient';
import type { ApiAdviceItem } from '../advice/map';
import type { AdviceOutcomeValue } from '../advice/types';

export { mapApiEventToResult } from './map';

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
  schema_version: string;
  primary_intent: string | null;
  confidence_band: ConfidenceBand | null;
  summary: string | null;
  alternatives: ApiAlternative[];
  evidence: ApiEvidenceItem[];
  safety_flags: Array<{ code: string; severity: string }>;
  needs_context: boolean;
  context_question: string | null;
  policy_version: string | null;
  taxonomy_version: string | null;
  feedback?: FeedbackValue | null;
  advice?: ApiAdviceItem | null;
  advice_outcome?: AdviceOutcomeValue | null;
  consumer_headline?: string | null;
  baseline_comparison?: string | null;
  baseline_note?: string | null;
  recommended_next_step?: string | null;
  what_to_watch?: string | null;
  safety?: {
    code: string;
    severity: string;
    title: string;
    message: string;
    action: string;
  } | null;
  personal_memory_used?: Array<{
    pattern_id: string;
    state: string;
    support_summary: string;
  }>;
  context_bucket?: string | null;
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

export async function postBehaviorContext(
  eventId: string,
  contextBucket: ContextBucket,
): Promise<ApiBehaviorEvent> {
  return api.post<ApiBehaviorEvent>(
    `/v1/behavior/events/${eventId}/context`,
    { context_bucket: contextBucket },
  );
}

export async function postBehaviorFeedback(
  eventId: string,
  value: FeedbackValue,
  extras?: {
    correction_label?: string | null;
    clientRequestId?: string;
  },
): Promise<FeedbackResponse> {
  const key =
    extras?.clientRequestId ?? `fb-${eventId}-${value}-${Date.now()}`;
  const body: Record<string, unknown> = {
    value,
    client_request_id: key,
  };
  if (extras?.correction_label) {
    body.correction_label = extras.correction_label;
  }
  return api.post<FeedbackResponse>(
    `/v1/behavior/events/${eventId}/feedback`,
    body,
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
