/**
 * Digestive events API (backend app/api/routes/digestive.py):
 * POST /v1/digestive/fecal/init → PUT firmato → POST .../complete →
 * polling GET /v1/digestive/events/{id}.
 * Flusso reale parallelo a behavior; il mock fecale resta solo per il
 * mock gate dev.
 */
import { api } from '../../lib/apiClient';
import type { ApiDigestiveEvent } from './map';

export type { ApiDigestiveEvent, ApiSafetyFlag } from './map';
export { mapApiDigestiveEventToResult } from './map';

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

export async function updateDigestiveContext(
  eventId: string,
  body: Partial<
    Record<
      'vomiting_today' | 'reduced_activity_today' | 'unusual_food_48h',
      boolean
    >
  >,
): Promise<ApiDigestiveEvent> {
  return api.patch<ApiDigestiveEvent>(
    `/v1/digestive/events/${eventId}/context`,
    body,
  );
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
