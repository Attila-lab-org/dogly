/**
 * "Routine e abitudini" — API client (brief V2 sez. 13: lifestyle GET/PATCH).
 *
 * Gli endpoint GET/PATCH sono owner-scoped su `dog_lifestyle_profiles`.
 * Nel mock gate usiamo lo store di sessione; con API attiva ogni errore
 * resta visibile (mai finto successo, mai dati inventati).
 */
import { useQuery } from '@tanstack/react-query';
import { isApiConfigured, shouldUseMockAuthGate } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import {
  getLifestyleProfileLocal,
  saveLifestyleProfileLocal,
  useLifestyleLocal,
} from './store';
import type {
  LifestyleEnrichment,
  LifestyleProfile,
  LifestyleSleep,
  LifestyleSocial,
  LifestyleActivity,
  LifestyleTimeAlone,
} from './types';

export type LifestylePatch = Partial<
  Pick<
    LifestyleProfile,
    'activity' | 'sleep' | 'timeAlone' | 'social' | 'enrichment'
  >
>;

type ApiLifestyleProfile = {
  dog_id: string;
  routine?: {
    activity?: LifestyleActivity | null;
    sleep?: LifestyleSleep | null;
    time_alone?: LifestyleTimeAlone | null;
    social?: LifestyleSocial | null;
    enrichment?: LifestyleEnrichment | null;
  };
  feeding_label?: string | null;
  updated_at?: string | null;
};

export function useLifestyleMockGate(): boolean {
  const { usingMockGate } = useSession();
  return usingMockGate || shouldUseMockAuthGate() || !isApiConfigured();
}

function mapApiToProfile(raw: ApiLifestyleProfile): LifestyleProfile {
  return {
    dogId: raw.dog_id,
    activity: raw.routine?.activity ?? null,
    sleep: raw.routine?.sleep ?? null,
    timeAlone: raw.routine?.time_alone ?? null,
    feedingLabel: raw.feeding_label ?? null,
    social: raw.routine?.social ?? null,
    enrichment: raw.routine?.enrichment ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

function profileToApiBody(patch: LifestylePatch) {
  return {
    routine: {
      activity: patch.activity,
      sleep: patch.sleep,
      time_alone: patch.timeAlone,
      social: patch.social,
      enrichment: patch.enrichment,
    },
    confirm: true,
  };
}

export async function getLifestyleProfile(
  dogId: string,
  mockGate: boolean,
): Promise<LifestyleProfile | null> {
  if (mockGate) return getLifestyleProfileLocal(dogId);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { api } = require('../../lib/apiClient') as typeof import('../../lib/apiClient');
  const raw = await api.get<ApiLifestyleProfile>(`/v1/dogs/${dogId}/lifestyle`);
  return mapApiToProfile(raw);
}

export async function saveLifestyleProfile(
  dogId: string,
  patch: LifestylePatch,
  mockGate: boolean,
): Promise<LifestyleProfile> {
  if (mockGate) return saveLifestyleProfileLocal(dogId, patch);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { api } = require('../../lib/apiClient') as typeof import('../../lib/apiClient');
  const raw = await api.patch<ApiLifestyleProfile>(
    `/v1/dogs/${dogId}/lifestyle`,
    profileToApiBody(patch),
  );
  return mapApiToProfile(raw);
}

export type LifestyleState = {
  /** null quando non disponibile (endpoint assente/errore): mai inventare. */
  profile: LifestyleProfile | null;
  mockGate: boolean;
  loading: boolean;
  error: boolean;
  refetch: () => void;
};

/**
 * Profilo lifestyle reattivo: mock gate → store di sessione; API →
 * react-query sulla GET futura (errore onesto, profile null).
 */
export function useLifestyle(dogId: string): LifestyleState {
  const { userId } = useSession();
  const mockGate = useLifestyleMockGate();
  useLifestyleLocal(); // reattività sullo store di sessione

  const query = useQuery({
    queryKey: ['lifestyle', userId ?? 'anon', dogId],
    queryFn: () => getLifestyleProfile(dogId, false),
    enabled: !mockGate && Boolean(dogId),
    retry: false,
  });

  if (mockGate) {
    return {
      profile: getLifestyleProfileLocal(dogId),
      mockGate,
      loading: false,
      error: false,
      refetch: () => {},
    };
  }
  return {
    profile: query.data ?? null,
    mockGate,
    loading: query.isLoading,
    error: query.isError,
    refetch: () => void query.refetch(),
  };
}
