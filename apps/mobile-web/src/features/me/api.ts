import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import { api } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryClient';

export type ApiProfile = {
  user_id: string;
  display_name: string | null;
  locale: string | null;
  timezone: string | null;
  created_at: string;
};

export type MeResponse = {
  profile: ApiProfile;
};

export function meQueryKey(userId: string) {
  return [...queryKeys.user(userId), 'me'] as const;
}

export async function fetchMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/v1/me');
}

export async function patchMe(body: {
  display_name: string | null;
}): Promise<MeResponse> {
  return api.patch<MeResponse>('/v1/me', body);
}

export function useMeProfile() {
  const { userId, usingMockGate } = useSession();
  const live = Boolean(userId) && isApiConfigured() && !usingMockGate;
  return useQuery({
    queryKey: userId ? meQueryKey(userId) : ['me', 'anon'],
    queryFn: fetchMe,
    enabled: live,
    staleTime: 30_000,
    select: (data) => data.profile,
  });
}

export function useUpdateMeProfile() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchMe,
    onSuccess: async () => {
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: meQueryKey(userId) });
      }
    },
  });
}
