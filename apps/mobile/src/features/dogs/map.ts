import type { DogProfile } from '../core/types';
import { ageFromBirthDate, ageLabelFromYears } from './profileDates';

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
  photo_url: string | null;
  created_at: string;
};

/** UI size chip → API size string. */
export function sizeToApi(
  size: 'Piccola' | 'Media' | 'Grande' | string,
): string {
  if (size === 'Piccola' || size === 'Taglia piccola') return 'SMALL';
  if (size === 'Grande' || size === 'Taglia grande') return 'LARGE';
  if (size === 'Media' || size === 'Taglia media') return 'MEDIUM';
  return size.toUpperCase();
}

export function sizeFromApi(size: string | null): string {
  switch (size) {
    case 'SMALL':
    case 'small':
    case 'Piccola':
      return 'Taglia piccola';
    case 'LARGE':
    case 'large':
    case 'Grande':
      return 'Taglia grande';
    case 'MEDIUM':
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
    weightKg: dog.weight_kg,
    breedLabel: dog.breed_label,
    isMix: dog.is_mix,
    photoUri: dog.photo_url ?? null,
    profileVisibility: 'private',
    publicConsentVersion: null,
  };
}
