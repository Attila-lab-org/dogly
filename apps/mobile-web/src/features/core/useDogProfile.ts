/**
 * Profilo cane: react-query su GET /v1/dogs (sostituisce lo store volatile).
 * Fallback mock solo in __DEV__ senza API/auth.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import { api } from '../../lib/apiClient';
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
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
import { ageStageToApi } from '../dogs/map';
import type { DogProfile, KnowledgeScore } from './types';

type DogProfileState = {
  dog: DogProfile;
  knowledgeScore: KnowledgeScore;
};

type ApiKnowledgeScore = {
  dog_id: string;
  score: number | null;
};

const profileSnapshots = new Map<string, DogProfileState>();

export function mapKnowledgeScore(
  value: ApiKnowledgeScore | null | undefined,
): KnowledgeScore {
  const score = Math.round(Math.max(0, Math.min(1, value?.score ?? 0)) * 100);
  return {
    score,
    caption:
      score >= 70
        ? 'Conoscenza personale solida'
        : score >= 30
          ? 'Sto imparando le sue abitudini'
          : 'Sto iniziando a conoscerlo...',
  };
}

function emptyDog(): DogProfile {
  return {
    id: '',
    name: 'Il tuo cane',
    ageLabel: '',
    birthDate: null,
    sizeLabel: 'Taglia media',
    weightKg: null,
    sex: null,
    breedLabel: null,
    isMix: false,
    photoUri: null,
    profileVisibility: 'private',
    publicConsentVersion: null,
  };
}

export function useDogProfile(): DogProfileState {
  const { userId, primaryDogId } = useSession();
  const enabled = Boolean(userId) && isApiConfigured();

  const query = useQuery({
    queryKey: userId ? dogsQueryKey(userId) : ['dogs', 'anon'],
    queryFn: listDogs,
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const dog = useMemo(() => {
    const items = query.data ?? [];
    const preferred =
      (primaryDogId
        ? items.find((d) => d.id === primaryDogId)
        : undefined) ?? items[0];
    if (preferred) return mapApiDogToProfile(preferred);
    return emptyDog();
  }, [query.data, primaryDogId]);

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledgeScore(userId ?? 'anon', dog.id),
    queryFn: () =>
      api.get<ApiKnowledgeScore>(`/v1/dogs/${dog.id}/knowledge-score`),
    enabled: enabled && isPersistedId(dog.id),
  });

  const resolvedKnowledgeScore = mapKnowledgeScore(knowledgeQuery.data);

  if (userId && dog.id) {
    profileSnapshots.set(userId, {
      dog: { ...dog },
      knowledgeScore: { ...resolvedKnowledgeScore },
    });
  }
  return { dog, knowledgeScore: resolvedKnowledgeScore };
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

/** Snapshot sync per settings from the latest real query result. */
export function getDogProfileSnapshot(userId?: string): DogProfileState {
  const snapshot = userId ? profileSnapshots.get(userId) : undefined;
  return snapshot
    ? {
        dog: { ...snapshot.dog },
        knowledgeScore: { ...snapshot.knowledgeScore },
      }
    : { dog: emptyDog(), knowledgeScore: mapKnowledgeScore(null) };
}

export function profileToCreateBody(
  profile: Pick<
    DogProfile,
    'name' | 'birthDate' | 'sizeLabel' | 'weightKg' | 'sex' | 'breedLabel' | 'isMix'
  > & { ageLabel?: string },
  clientRequestId?: string,
): DogCreateBody {
  return {
    name: profile.name,
    birth_date: profile.birthDate,
    age_stage: ageStageToApi(profile.ageLabel),
    size: sizeToApi(profile.sizeLabel),
    weight_kg: profile.weightKg,
    sex: profile.sex,
    breed_label: profile.breedLabel,
    is_mix: profile.isMix,
    client_request_id: clientRequestId ?? null,
  };
}
