import { api } from '../../lib/apiClient';

// Provider chat timeout is 45s (low/medium Astra). Keep the client slightly
// above so a late valid answer still lands before we show retry.
export const REALTIME_TURN_TIMEOUT_MS = 48_000;

export type RealtimeSession = {
  id: string;
  dog_id: string;
  dog_name: string;
  owner_display_name: string | null;
  previous_topic: string | null;
  welcome_text: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
  modality: 'TEXT';
  model: string;
  started_at: string;
  expires_at: string;
};

export type MemoryProposal = {
  id: string;
  category: 'ROUTINE' | 'PREFERENCE' | 'DIET' | 'HEALTH' | 'GENERAL';
  statement: string;
};

export type RealtimeTurn = {
  id: string;
  session_id: string;
  assistant_text: string;
  question: string | null;
  question_options: string[];
  terminal_state:
    | 'ANSWERED'
    | 'ABSTAINED'
    | 'SAFETY_INTERRUPT'
    | 'BEHAVIOR_VIDEO_HANDOFF'
    | 'MEMORY_CONFIRMATION_REQUIRED';
  domains: string[];
  safety_flags: string[];
  memory_proposal: MemoryProposal | null;
  behavior_handoff_href: string | null;
  food_review_href: string | null;
  save_to_moments_suggested: boolean;
  media_invite: 'PHOTO' | 'VIDEO' | null;
  media_prompt: string | null;
  attachment: { kind: 'PHOTO'; photo_id: string; purpose: string } | null;
  created_at: string;
};

export function createRealtimeSession(dogId: string, idempotencyKey?: string) {
  return api.post<RealtimeSession>('/v1/realtime/sessions', {
    dog_id: dogId,
    modality: 'TEXT',
  }, idempotencyKey ? { headers: { 'X-Idempotency-Key': idempotencyKey } } : undefined);
}

export function createRealtimeTurn(
  sessionId: string,
  text: string,
  assistantText?: string,
  options?: {
    eventId?: string;
    source?: 'behavior' | 'digestive';
    photoId?: string;
    photoContext?: string;
    latitude?: number;
    longitude?: number;
    idempotencyKey?: string;
  },
) {
  return api.post<RealtimeTurn>(`/v1/realtime/sessions/${sessionId}/turns`, {
    text,
    ...(assistantText ? { assistant_text: assistantText } : {}),
    ...(options?.eventId ? { event_id: options.eventId } : {}),
    ...(options?.source ? { context_source: options.source } : {}),
    ...(options?.photoId ? { photo_id: options.photoId } : {}),
    ...(options?.photoContext ? { photo_context: options.photoContext } : {}),
    ...(options?.latitude != null ? { latitude: options.latitude } : {}),
    ...(options?.longitude != null ? { longitude: options.longitude } : {}),
  }, { timeoutMs: REALTIME_TURN_TIMEOUT_MS,
    headers: options?.idempotencyKey ? {'X-Idempotency-Key': options.idempotencyKey} : undefined,
  });
}

export function decideRealtimeMemory(
  proposalId: string,
  action: 'CONFIRM' | 'REJECT',
) {
  return api.post<{ proposal_id: string; status: 'CONFIRMED' | 'REJECTED' }>(
    `/v1/realtime/memory-proposals/${proposalId}/decision`,
    { action },
  );
}

export function endRealtimeSession(sessionId: string) {
  return api.delete(`/v1/realtime/sessions/${sessionId}`);
}
