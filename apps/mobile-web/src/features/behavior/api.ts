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

export type ApiContextOption = {
  id: string;
  label: string;
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
  context_options?: ApiContextOption[];
  context_effect?: string | null;
  dog_voice?: string | null;
  sound_note?: string | null;
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

export type ProcessingContextQuestion = {
  id: string;
  text: string;
  options: Array<{ id: string; label: string }>;
};

export type ProcessingContextOut = {
  event_id: string;
  analysis_status: string;
  question: ProcessingContextQuestion | null;
  answered_count: number;
  max_questions: number;
  planner_version: string;
  applied_to_interpretation?: boolean | null;
};

export async function getProcessingContext(
  eventId: string,
): Promise<ProcessingContextOut> {
  return api.get<ProcessingContextOut>(
    `/v1/behavior/events/${eventId}/processing-context`,
  );
}

export async function postProcessingContext(
  eventId: string,
  body: { question_id: string; answer_id?: string; skipped?: boolean },
): Promise<ProcessingContextOut> {
  return api.post<ProcessingContextOut>(
    `/v1/behavior/events/${eventId}/processing-context`,
    body,
  );
}

export async function postBehaviorContext(
  eventId: string,
  answerId: string,
): Promise<ApiBehaviorEvent> {
  return api.post<ApiBehaviorEvent>(
    `/v1/behavior/events/${eventId}/context`,
    { answer_id: answerId },
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
  // FIX 3.4: deterministic key per (event, value) so a duplicate tap is a
  // server-side no-op; a changed feedback (different value) is a new key.
  const key = extras?.clientRequestId ?? `fb-${eventId}-${value}`;
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
