import { api } from '../../lib/apiClient';

export type AskVoiceGender = 'FEMALE' | 'MALE';

export type LiveSession = {
  session_id: string;
  dog_id: string;
  dog_name: string;
  owner_display_name: string | null;
  voice: string;
  voice_gender: AskVoiceGender;
  /** GPT-Live WebRTC SDP answer — apply as remote description. */
  sdp: string;
  openai_session_id: string | null;
  /** Soft metering hint; 0 = no hard client cut-off. */
  seconds_remaining: number;
  welcome_text: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
};

export function createLiveSession(
  dogId: string,
  sdpOffer: string,
  idempotencyKey?: string,
) {
  return api.post<LiveSession>(
    '/v1/realtime/live/sessions',
    { dog_id: dogId, sdp: sdpOffer },
    {
      timeoutMs: 45_000,
      ...(idempotencyKey
        ? { headers: { 'X-Idempotency-Key': idempotencyKey } }
        : undefined),
    },
  );
}

export function endLiveSession(sessionId: string) {
  return api.delete(`/v1/realtime/live/sessions/${sessionId}`);
}
