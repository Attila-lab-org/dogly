import { api } from '../../lib/apiClient';

// The realtime backend may spend up to one minute reasoning. Keep the
// conversation request alive slightly longer than the provider timeout so a
// slow but valid answer is not shown as a network failure in the client.
export const REALTIME_TURN_TIMEOUT_MS = 65_000;

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
  media_invite: 'PHOTO' | 'VIDEO' | null;
  media_prompt: string | null;
  attachment: { kind: 'PHOTO'; photo_id: string; purpose: string } | null;
  created_at: string;
};

export function createRealtimeSession(dogId: string) {
  return api.post<RealtimeSession>('/v1/realtime/sessions', {
    dog_id: dogId,
    modality: 'TEXT',
  });
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
  },
) {
  return api.post<RealtimeTurn>(`/v1/realtime/sessions/${sessionId}/turns`, {
    text,
    ...(assistantText ? { assistant_text: assistantText } : {}),
    ...(options?.eventId ? { event_id: options.eventId } : {}),
    ...(options?.source ? { context_source: options.source } : {}),
    ...(options?.photoId ? { photo_id: options.photoId } : {}),
    ...(options?.photoContext ? { photo_context: options.photoContext } : {}),
  }, { timeoutMs: REALTIME_TURN_TIMEOUT_MS });
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
