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

export type DogSex = 'MALE' | 'FEMALE' | 'UNKNOWN';

export const SEX_OPTIONS: Array<{ value: DogSex; label: string }> = [
  { value: 'MALE', label: 'Maschio' },
  { value: 'FEMALE', label: 'Femmina' },
  { value: 'UNKNOWN', label: 'Non so' },
];

export function sexFromApi(sex: string | null | undefined): DogSex | null {
  if (!sex) return null;
  const key = sex.trim().toUpperCase();
  if (key === 'MALE' || key === 'FEMALE' || key === 'UNKNOWN') return key;
  return 'UNKNOWN';
}

export function sexLabel(sex: DogSex | null | undefined): string | null {
  if (sex === 'MALE') return 'Maschio';
  if (sex === 'FEMALE') return 'Femmina';
  return null;
}

const AGE_STAGE_TO_LABEL: Record<string, string> = {
  PUPPY: 'Cucciolo',
  ADOLESCENT: 'Giovane',
  ADULT: 'Adulto',
  SENIOR: 'Anziano',
  UNKNOWN: 'Età da completare',
};

const AGE_LABEL_TO_STAGE: Record<string, string> = {
  cucciolo: 'PUPPY',
  giovane: 'ADOLESCENT',
  adolescente: 'ADOLESCENT',
  adulto: 'ADULT',
  anziano: 'SENIOR',
  'età da completare': 'UNKNOWN',
};

export function ageStageFromApi(stage: string | null | undefined): string {
  if (!stage) return 'Età da completare';
  return AGE_STAGE_TO_LABEL[stage.toUpperCase()] ?? stage;
}

export function ageStageToApi(
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  const canonical = trimmed.toUpperCase();
  if (AGE_STAGE_TO_LABEL[canonical]) return canonical;
  const mapped = AGE_LABEL_TO_STAGE[trimmed.toLocaleLowerCase('it')];
  if (mapped) return mapped;
  return trimmed;
}

export function mapApiDogToProfile(dog: ApiDog): DogProfile {
  const birthDate = dog.birth_date;
  const ageLabel = birthDate
    ? ageLabelFromYears(ageFromBirthDate(birthDate))
    : ageStageFromApi(dog.age_stage);

  return {
    id: dog.id,
    name: dog.name,
    ageLabel,
    birthDate,
    sizeLabel: sizeFromApi(dog.size),
    weightKg: dog.weight_kg,
    sex: sexFromApi(dog.sex),
    breedLabel: dog.breed_label,
    isMix: dog.is_mix,
    photoUri: dog.photo_url ?? null,
    profileVisibility: 'private',
    publicConsentVersion: null,
  };
}
