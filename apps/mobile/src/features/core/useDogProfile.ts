/**
 * Profilo cane: react-query su GET /v1/dogs (sostituisce lo store volatile).
 * Fallback mock solo in __DEV__ senza API/auth.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import {
  createDog,
  dogsQueryKey,
  listDogs,
  mapApiDogToProfile,
  sizeToApi,
  updateDog,
  type DogCreateBody,
  type DogUpdateBody,
} from '../dogs/api';
import type { DogProfile, KnowledgeScore } from './types';
import { dogMock, homeKnowledgeScoreMock } from '../../mocks/core';

type DogProfileState = {
  dog: DogProfile;
  knowledgeScore: KnowledgeScore;
};

/** Knowledge score resta mock finché non c’è endpoint dedicato. */
let knowledgeScore: KnowledgeScore = { ...homeKnowledgeScoreMock };
let lastDog: DogProfile = { ...dogMock };

function emptyDog(): DogProfile {
  return {
    id: '',
    name: 'Il tuo cane',
    ageLabel: '',
    birthDate: null,
    sizeLabel: 'Taglia media',
    weightKg: null,
    breedLabel: null,
    isMix: false,
    photoUri: null,
    profileVisibility: 'private',
    publicConsentVersion: null,
  };
}

export function setKnowledgeScore(score: KnowledgeScore) {
  knowledgeScore = score;
}

export function useDogProfile(): DogProfileState {
  const { userId, primaryDogId, usingMockGate } = useSession();
  const enabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  const query = useQuery({
    queryKey: userId ? dogsQueryKey(userId) : ['dogs', 'anon'],
    queryFn: listDogs,
    enabled,
    staleTime: 30_000,
  });

  const dog = useMemo(() => {
    if (usingMockGate || !isApiConfigured()) {
      return { ...dogMock };
    }
    const items = query.data ?? [];
    const preferred =
      (primaryDogId
        ? items.find((d) => d.id === primaryDogId)
        : undefined) ?? items[0];
    return preferred ? mapApiDogToProfile(preferred) : emptyDog();
  }, [usingMockGate, query.data, primaryDogId]);

  lastDog = dog;
  return { dog, knowledgeScore };
}

export function useCreateDogMutation() {
  const { userId, markDogCreated } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DogCreateBody) => createDog(body),
    onSuccess: async (dog) => {
      markDogCreated(dog.id);
      if (userId) {
        await qc.invalidateQueries({ queryKey: dogsQueryKey(userId) });
      }
    },
  });
}

export function useUpdateDogMutation(dogId: string) {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DogUpdateBody) => updateDog(dogId, body),
    onSuccess: async () => {
      if (userId) {
        await qc.invalidateQueries({ queryKey: dogsQueryKey(userId) });
      }
    },
  });
}

/**
 * Patch locale/dev — preferire useUpdateDogMutation in produzione.
 * Mantenuto per schermate legacy; no-op se non in mock gate.
 */
export function updateDogProfile(patch: Partial<DogProfile>) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    Object.assign(dogMock, { ...dogMock, ...patch });
  }
}

/** Snapshot sync per settings (ultimo dog visto dall’hook o mock). */
export function getDogProfileSnapshot(): DogProfileState {
  return {
    dog: { ...lastDog },
    knowledgeScore: { ...knowledgeScore },
  };
}

export function profileToCreateBody(
  profile: Pick<
    DogProfile,
    'name' | 'birthDate' | 'sizeLabel' | 'weightKg' | 'breedLabel' | 'isMix'
  > & { ageLabel?: string },
  clientRequestId?: string,
): DogCreateBody {
  return {
    name: profile.name,
    birth_date: profile.birthDate,
    age_stage: profile.ageLabel ?? null,
    size: sizeToApi(profile.sizeLabel),
    weight_kg: profile.weightKg,
    breed_label: profile.breedLabel,
    is_mix: profile.isMix,
    client_request_id: clientRequestId ?? null,
  };
}

export function profileToUpdateBody(
  profile: Partial<DogProfile>,
): DogUpdateBody {
  return {
    name: profile.name,
    birth_date: profile.birthDate,
    age_stage: profile.ageLabel,
    size: profile.sizeLabel ? sizeToApi(profile.sizeLabel) : undefined,
    weight_kg: profile.weightKg,
    breed_label: profile.breedLabel,
    is_mix: profile.isMix,
  };
}
