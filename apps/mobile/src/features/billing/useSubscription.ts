/**
 * Stato abbonamento condiviso (settings + schermata Abbonamento).
 * Fonte unica: GET /v1/subscription/status + GET /v1/usage via react-query.
 * Il mock vale SOLO in mock gate dev: in modalità live un errore resta un
 * errore visibile, mai un fallback silenzioso al piano Free.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import { subscriptionMock } from '../../mocks/secondary';
import { fetchSubscriptionState } from './api';
import type { SubscriptionState } from '../secondary/types';

export const subscriptionQueryKey = ['subscription', 'status'] as const;

export interface SubscriptionStateResult {
  /** true quando il backend è configurato e non siamo in mock gate */
  live: boolean;
  query: UseQueryResult<SubscriptionState>;
  /** null in live finché non ci sono dati (loading/errore gestiti dal chiamante) */
  state: SubscriptionState | null;
}

export function useSubscriptionState(): SubscriptionStateResult {
  const { usingMockGate } = useSession();
  const live = isApiConfigured() && !usingMockGate;
  const query = useQuery<SubscriptionState>({
    queryKey: subscriptionQueryKey,
    queryFn: fetchSubscriptionState,
    enabled: live,
    staleTime: 30_000,
  });
  return {
    live,
    query,
    state: query.data ?? (live ? null : subscriptionMock),
  };
}
