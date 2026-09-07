import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/apiClient';
import { patternsMock } from '../../mocks/secondary';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import type { PersonalPattern } from '../secondary/types';

type PatternDto = {
  id: string;
  dog_id: string;
  title: string;
  state: PersonalPattern['state'];
  reliability_band: PersonalPattern['reliabilityBand'];
  support_count: number;
  version: number;
  last_seen: string;
};

function mapPattern(item: PatternDto): PersonalPattern {
  return {
    id: item.id,
    dogId: item.dog_id,
    title: item.title,
    state: item.state,
    supportCount: item.support_count,
    confirmCount: 0,
    contradictCount: 0,
    reliabilityBand: item.reliability_band,
    firstSeen: item.last_seen,
    lastSeen: item.last_seen,
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
    enabled: live && Boolean(dogId),
  });

  return {
    ...query,
    live,
    patterns: live ? query.data ?? [] : patternsMock,
  };
}

export async function reviewPattern(
  patternId: string,
  action: 'confirm' | 'contest' | 'archive',
): Promise<void> {
  await api.post(`/v1/patterns/${patternId}/review`, { action });
}
