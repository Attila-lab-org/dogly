/**
 * Dogs API + mappers (GET/POST/PATCH /v1/dogs).
 */
import { api } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryClient';
import type { DogProfile } from '../core/types';
import { ageLabelFromYears, ageFromBirthDate } from './profileDates';

export type ApiDog = {
  id: string;
  name: string;
  birth_date: string | null;
  age_stage: string | null;
  size: string | null;
  breed_label: string | null;
  is_mix: boolean;
  sex: string | null;
  weight_kg: number | null;
  photo_path: string | null;
  created_at: string;
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

/** UI size chip → API size string. */
export function sizeToApi(
  size: 'Piccola' | 'Media' | 'Grande' | string,
): string {
  if (size === 'Piccola' || size === 'Taglia piccola') return 'small';
  if (size === 'Grande' || size === 'Taglia grande') return 'large';
  if (size === 'Media' || size === 'Taglia media') return 'medium';
  return size;
}

export function sizeFromApi(size: string | null): string {
  switch (size) {
    case 'small':
    case 'Piccola':
      return 'Taglia piccola';
    case 'large':
    case 'Grande':
      return 'Taglia grande';
    case 'medium':
    case 'Media':
      return 'Taglia media';
    default:
      return size ?? 'Taglia media';
  }
}

export function mapApiDogToProfile(dog: ApiDog): DogProfile {
  const birthDate = dog.birth_date;
  const ageLabel = birthDate
    ? ageLabelFromYears(ageFromBirthDate(birthDate))
    : dog.age_stage ?? 'Età da completare';

  return {
    id: dog.id,
    name: dog.name,
    ageLabel,
    birthDate,
    sizeLabel: sizeFromApi(dog.size),
    breedLabel: dog.breed_label,
    isMix: dog.is_mix,
    photoUri: dog.photo_path,
    profileVisibility: 'private',
    publicConsentVersion: null,
  };
}

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

export function dogsQueryKey(userId: string) {
  return queryKeys.dogs(userId);
}
