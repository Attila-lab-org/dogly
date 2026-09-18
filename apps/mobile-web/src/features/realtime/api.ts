import { api } from '../../lib/apiClient';

export type RealtimeSession = {
  id: string;
  dog_id: string;
  dog_name: string;
  owner_display_name: string | null;
  welcome_text: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
  modality: 'VOICE' | 'TEXT';
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
  created_at: string;
};

export type RealtimeClientSecret = {
  value: string;
  expires_at: number;
  model: string;
  session_config: { voice: string; turn_detection: string };
};

export function createRealtimeSession(dogId: string, modality: 'VOICE' | 'TEXT') {
  return api.post<RealtimeSession>('/v1/realtime/sessions', {
    dog_id: dogId,
    modality,
  });
}

export function createRealtimeTurn(sessionId: string, text: string) {
  return api.post<RealtimeTurn>(`/v1/realtime/sessions/${sessionId}/turns`, {
    text,
  });
}

export function getRealtimeClientSecret(sessionId: string) {
  return api.post<RealtimeClientSecret>(
    `/v1/realtime/sessions/${sessionId}/client-secret`,
    {},
  );
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
