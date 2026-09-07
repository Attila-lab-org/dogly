import { api } from '../../lib/apiClient';

export type OwnerFact = {
  id: string;
  category: 'ROUTINE' | 'PREFERENCE' | 'DIET' | 'HEALTH' | 'GENERAL';
  statement: string;
  provenance: 'OWNER_REPORTED';
};

export type OwnerStoryDraft = {
  draft_id: string;
  dog_id: string;
  transcript: string;
  facts: OwnerFact[];
};

export type OwnerStoryObservation = {
  id: string;
  dog_id: string;
  facts: OwnerFact[];
  confirmed_at: string;
};

export async function fetchOwnerStories(
  dogId: string,
): Promise<OwnerStoryObservation[]> {
  const response = await api.get<{ items: OwnerStoryObservation[] }>(
    `/v1/dogs/${dogId}/owner-stories`,
  );
  return response.items;
}

export async function updateOwnerStory(
  dogId: string,
  observationId: string,
  facts: OwnerFact[],
): Promise<OwnerStoryObservation> {
  return api.patch<OwnerStoryObservation>(
    `/v1/dogs/${dogId}/owner-stories/${observationId}`,
    { facts },
  );
}

export async function deleteOwnerStory(
  dogId: string,
  observationId: string,
): Promise<void> {
  return api.delete(`/v1/dogs/${dogId}/owner-stories/${observationId}`);
}

export function prepareOwnerStory(
  dogId: string,
  text: string,
): Promise<OwnerStoryDraft> {
  return api.post<OwnerStoryDraft>(`/v1/dogs/${dogId}/owner-stories/prepare`, {
    text,
  });
}

export function prepareOwnerStoryAudio(
  dogId: string,
  audioBase64: string,
  contentType: 'audio/m4a' | 'audio/mp4' | 'audio/webm',
): Promise<OwnerStoryDraft> {
  let hash = 2166136261;
  for (let index = 0; index < audioBase64.length; index += 1) {
    hash ^= audioBase64.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const idempotencyKey = `owner-audio-${audioBase64.length}-${(hash >>> 0).toString(16)}`;
  return api.post<OwnerStoryDraft>(
    `/v1/dogs/${dogId}/owner-stories/prepare-audio`,
    { audio_base64: audioBase64, content_type: contentType },
    {
      headers: { 'X-Idempotency-Key': idempotencyKey },
      timeoutMs: 100_000,
    },
  );
}

export function confirmOwnerStory(
  dogId: string,
  draftId: string,
  facts: OwnerFact[],
): Promise<{ observation_id: string; status: 'CONFIRMED' }> {
  return api.post(
    `/v1/dogs/${dogId}/owner-stories/${draftId}/confirm`,
    { facts },
  );
}
