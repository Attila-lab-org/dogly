import type { DogProfile } from '../core/types';
import type { DogUpdateBody } from './api';
import { ageStageToApi, sizeToApi } from './map';

export function profileToUpdateBody(
  profile: Partial<DogProfile>,
): DogUpdateBody {
  return {
    name: profile.name,
    birth_date: profile.birthDate,
    age_stage:
      profile.ageLabel === undefined
        ? undefined
        : ageStageToApi(profile.ageLabel),
    size:
      profile.sizeLabel === undefined
        ? undefined
        : profile.sizeLabel
          ? sizeToApi(profile.sizeLabel)
          : null,
    weight_kg: profile.weightKg,
    sex: profile.sex,
    breed_label: profile.breedLabel,
    is_mix: profile.isMix,
  };
}

export function profileChangesToUpdateBody(
  current: DogProfile,
  next: Partial<DogProfile>,
): DogUpdateBody {
  const currentBody = profileToUpdateBody(current);
  const nextBody = profileToUpdateBody(next);
  return Object.fromEntries(
    Object.entries(nextBody).filter(
      ([key, value]) =>
        value !== undefined &&
        value !== currentBody[key as keyof DogUpdateBody],
    ),
  ) as DogUpdateBody;
}
