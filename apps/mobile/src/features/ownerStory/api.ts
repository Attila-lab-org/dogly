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
  return api.post<OwnerStoryDraft>(
    `/v1/dogs/${dogId}/owner-stories/prepare-audio`,
    { audio_base64: audioBase64, content_type: contentType },
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
