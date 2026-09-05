/**
 * Digestive events API (backend app/api/routes/digestive.py):
 * POST /v1/digestive/fecal/init → PUT firmato → POST .../complete →
 * polling GET /v1/digestive/events/{id}.
 * Flusso reale parallelo a behavior; il mock fecale resta solo per il
 * mock gate dev.
 */
import type { ConfidenceBand } from '../../contracts/types';
import {
  SAFETY_FLAG_CODES,
  type FecalEventResult,
  type SafetyFlagCode,
} from '../secondary/types';
import { api } from '../../lib/apiClient';

export type ApiSafetyFlag = { code: string; severity?: string };

export type ApiDigestiveEvent = {
  id: string;
  dog_id: string;
  status: string;
  fecal_score_estimate: number | null;
  consistency: string | null;
  color: string | null;
  confidence_band: ConfidenceBand | null;
  safety_flags: Array<ApiSafetyFlag | string>;
  summary: string | null;
  created_at: string;
};

export type FecalInitResponse = {
  event_id: string;
  status: string;
  upload: {
    url: string;
    storage_path: string;
    expires_at: string;
  };
  quota_reserved: boolean;
};

export type FecalCompleteResponse = {
  event_id: string;
  status: string;
};

export async function initFecalCapture(body: {
  dog_id: string;
  client_request_id: string;
  bytes: number;
  content_type?: string;
}): Promise<FecalInitResponse> {
  return api.post<FecalInitResponse>('/v1/digestive/fecal/init', body, {
    headers: { 'X-Idempotency-Key': body.client_request_id },
  });
}

export async function completeFecalCapture(
  eventId: string,
  idempotencyKey: string,
): Promise<FecalCompleteResponse> {
  return api.post<FecalCompleteResponse>(
    `/v1/digestive/fecal/${eventId}/complete`,
    {},
    { headers: { 'X-Idempotency-Key': idempotencyKey } },
  );
}

export async function getDigestiveEvent(
  eventId: string,
): Promise<ApiDigestiveEvent> {
  return api.get<ApiDigestiveEvent>(`/v1/digestive/events/${eventId}`);
}

export const DIGESTIVE_IN_PROGRESS_STATUSES = [
  'DRAFT',
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
];

export function isTerminalDigestiveStatus(status: string): boolean {
  return !DIGESTIVE_IN_PROGRESS_STATUSES.includes(status);
}

export function isFailedDigestiveStatus(status: string): boolean {
  return (
    status === 'FAILED' || status === 'FAILED_TERMINAL' || status === 'CANCELLED'
  );
}

const CONSISTENCY_VALUES = [
  'dura',
  'formata',
  'morbida',
  'non formata',
  'liquida',
  'sconosciuta',
] as const;

type Consistency = (typeof CONSISTENCY_VALUES)[number];

function mapConsistency(value: string | null): Consistency {
  const normalized = (value ?? '').toLowerCase() as Consistency;
  return CONSISTENCY_VALUES.includes(normalized) ? normalized : 'sconosciuta';
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

/**
 * Mapping onesto: mostriamo solo ciò che il backend fornisce davvero.
 * I candidati (muco/sangue/melena/materiale estraneo) non sono esposti
 * dall'endpoint evento → restano 'unknown' e NON compaiono in UI.
 */
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
    imageQuality: insufficient ? 'insufficient' : 'sufficient',
    qualityWarnings: [],
    fecalScoreEstimate: event.fecal_score_estimate,
    consistency: mapConsistency(event.consistency),
    color: event.color ?? 'non determinato',
    mucusCandidate: 'unknown',
    bloodCandidate: 'unknown',
    melenaCandidate: 'unknown',
    foreignMaterialCandidate: 'unknown',
    confidenceBand: event.confidence_band ?? 'LOW',
    safetyFlags: mapSafetyFlags(event.safety_flags),
    activeFoodName: null,
    baselineComparison:
      event.summary ??
      'Osservazione registrata: non ho ancora abbastanza dati per confrontarla con il solito.',
    createdAt: event.created_at,
  };
}
