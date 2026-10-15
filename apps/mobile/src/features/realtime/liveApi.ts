import { api } from '../../lib/apiClient';

export type AskVoiceGender = 'FEMALE' | 'MALE';

export type LiveSession = {
  session_id: string;
  dog_id: string;
  dog_name: string;
  owner_display_name: string | null;
  voice: string;
  voice_gender: AskVoiceGender;
  client_secret: string;
  client_secret_expires_at: string | null;
  seconds_remaining: number;
  welcome_text: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
};

export function createLiveSession(dogId: string, idempotencyKey?: string) {
  return api.post<LiveSession>('/v1/realtime/live/sessions', { dog_id: dogId },
    idempotencyKey ? { headers: { 'X-Idempotency-Key': idempotencyKey } } : undefined);
}

export function endLiveSession(sessionId: string) {
  return api.delete(`/v1/realtime/live/sessions/${sessionId}`);
}
