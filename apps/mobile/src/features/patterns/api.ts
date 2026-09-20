import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/apiClient';
import { isPersistedId } from '../../lib/persistedId';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import type { PersonalPattern } from '../secondary/types';

type PatternDto = {
  id: string;
  dog_id: string;
  title: string;
  state: PersonalPattern['state'];
  reliability_band?: string | null;
  support_count: number;
  confirm_count?: number;
  contradict_count?: number;
  version: number;
  first_seen?: string | null;
  last_seen?: string | null;
};

function normalizeReliabilityBand(
  value: string | null | undefined,
): PersonalPattern['reliabilityBand'] {
  const normalized = value?.toUpperCase();
  return normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW'
    ? normalized
    : 'LOW';
}

function mapPattern(item: PatternDto): PersonalPattern {
  return {
    id: item.id,
    dogId: item.dog_id,
    title: item.title,
    state: item.state,
    supportCount: item.support_count,
    confirmCount: item.confirm_count ?? 0,
    contradictCount: item.contradict_count ?? 0,
    reliabilityBand: normalizeReliabilityBand(item.reliability_band),
    firstSeen: item.first_seen ?? item.last_seen ?? null,
    lastSeen: item.last_seen ?? null,
    evidenceNotes: [],
  };
}

export function usePersonalPatterns(dogId: string) {
  const { usingMockGate } = useSession();
  const live = isApiConfigured() && !usingMockGate;
  const query = useQuery({
    queryKey: ['patterns', dogId],
    queryFn: async () => {
      const response = await api.get<{ items: PatternDto[] }>(
        `/v1/dogs/${dogId}/patterns`,
      );
      return response.items.map(mapPattern);
    },
    enabled: live && isPersistedId(dogId),
  });

  return {
    ...query,
    live,
    patterns: query.data ?? [],
  };
}

export async function reviewPattern(
  patternId: string,
  action: 'confirm' | 'contest' | 'archive',
): Promise<void> {
  await api.post(`/v1/patterns/${patternId}/review`, { action });
}
