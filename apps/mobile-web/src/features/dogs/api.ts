/**
 * Dogs API + mappers (GET/POST/PATCH /v1/dogs).
 */
import { api } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryClient';
import type { ApiDog } from './map';

export type {
  ApiDog,
} from './map';
export {
  mapApiDogToProfile,
  sizeFromApi,
  sizeToApi,
  ageStageFromApi,
  ageStageToApi,
} from './map';

export type DogAvatarInitResponse = {
  storage_path: string;
  upload: {
    url: string;
    storage_path: string;
    expires_at: string;
  };
};

export type DogListResponse = { items: ApiDog[] };

export type DogCreateBody = {
  name: string;
  birth_date?: string | null;
  age_stage?: string | null;
  size?: string | null;
  breed_label?: string | null;
  is_mix?: boolean;
  sex?: string | null;
  weight_kg?: number | null;
  client_request_id?: string | null;
};

export type DogUpdateBody = {
  name?: string;
  birth_date?: string | null;
  age_stage?: string | null;
  size?: string | null;
  breed_label?: string | null;
  is_mix?: boolean;
  sex?: string | null;
  weight_kg?: number | null;
};

export async function listDogs(): Promise<ApiDog[]> {
  const res = await api.get<DogListResponse>('/v1/dogs');
  return res.items;
}

export async function createDog(body: DogCreateBody): Promise<ApiDog> {
  return api.post<ApiDog>('/v1/dogs', body, {
    headers: body.client_request_id
      ? { 'X-Idempotency-Key': body.client_request_id }
      : undefined,
  });
}

export async function updateDog(
  dogId: string,
  body: DogUpdateBody,
): Promise<ApiDog> {
  return api.patch<ApiDog>(`/v1/dogs/${dogId}`, body);
}

export async function initDogAvatar(
  dogId: string,
  body: {
    content_type: 'image/jpeg' | 'image/png' | 'image/webp';
    bytes?: number;
  },
): Promise<DogAvatarInitResponse> {
  return api.post<DogAvatarInitResponse>(`/v1/dogs/${dogId}/avatar/init`, body);
}

export async function completeDogAvatar(
  dogId: string,
  body: { storage_path: string; bytes?: number },
): Promise<ApiDog> {
  return api.post<ApiDog>(`/v1/dogs/${dogId}/avatar/complete`, body);
}

export type WeightEvent = {
  id: string;
  dog_id: string;
  weight_kg: number;
  body_condition_score?: number | null;
  source: string;
  recorded_at: string;
  created_at: string;
};

export async function listWeightEvents(dogId: string): Promise<WeightEvent[]> {
  return api.get<WeightEvent[]>(`/v1/dogs/${dogId}/weight-events`);
}

export async function createWeightEvent(
  dogId: string,
  body: { weight_kg: number; body_condition_score?: number | null },
): Promise<WeightEvent> {
  return api.post<WeightEvent>(`/v1/dogs/${dogId}/weight-events`, body);
}

export function dogsQueryKey(userId: string) {
  return queryKeys.dogs(userId);
}
