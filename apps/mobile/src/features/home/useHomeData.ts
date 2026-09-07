/**
 * Hook Home: quota + ultima analisi + processing + isNewUser da API reali
 * (TanStack Query, sez. 5.3). Fallback mock SOLO in mock gate dev
 * (shouldUseMockAuthGate, vedi features/auth/env) o API non configurata.
 * Con API attiva e richiesta fallita: nessun dato finto — usage null,
 * insight assenti, isNewUser false finché la prima pagina non arriva.
 */
import { useQuery } from '@tanstack/react-query';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import { queryKeys } from '../../lib/queryClient';
import { homeDataMock } from '../../mocks/core';
import type { LastInsight, UsageSummary } from '../core/types';
import {
  deriveHomeState,
  fetchDiaryPage,
  fetchHomeBehaviorPage,
  fetchUsageSummary,
} from './api';

export interface HomeDataState {
  usage: UsageSummary | null;
  lastInsight: LastInsight | null;
  processingEventId: string | null;
  isNewUser: boolean;
  /** 'api' = dati reali dal backend; 'mock' = mock gate dev */
  source: 'api' | 'mock';
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

export function useHomeData(dogId: string): HomeDataState {
  const { userId, usingMockGate } = useSession();
  const apiConfigured = isApiConfigured() && !usingMockGate;
  const realEnabled = Boolean(userId) && Boolean(dogId) && apiConfigured;

  const usageQuery = useQuery({
    queryKey: [...queryKeys.user(userId ?? 'anon'), 'usage'],
    queryFn: fetchUsageSummary,
    enabled: realEnabled,
  });

  const behaviorQuery = useQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dogId), 'home-behavior'],
    queryFn: () => fetchHomeBehaviorPage(dogId),
    enabled: realEnabled,
  });

  const activityQuery = useQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dogId), 'home-activity'],
    queryFn: () => fetchDiaryPage({ dogId, limit: 1 }),
    enabled: realEnabled,
  });

  if (!apiConfigured) {
    return {
      usage: homeDataMock.usage,
      lastInsight: homeDataMock.lastInsight,
      processingEventId: homeDataMock.processingEventId,
      isNewUser: homeDataMock.isNewUser,
      source: 'mock',
      loading: false,
      error: false,
      refetch: () => {},
    };
  }

  const behaviorItems = behaviorQuery.data?.items;
  const derived = behaviorItems ? deriveHomeState(behaviorItems) : null;
  const isNewUser =
    activityQuery.data !== undefined && activityQuery.data.items.length === 0;

  return {
    usage: usageQuery.data ?? null,
    lastInsight: derived?.lastInsight ?? null,
    processingEventId: derived?.processingEventId ?? null,
    // Cold-start solo dopo una query account+dog esplicitamente scoped.
    isNewUser,
    source: 'api',
    loading:
      !realEnabled ||
      usageQuery.isLoading ||
      behaviorQuery.isLoading ||
      activityQuery.isLoading,
    error:
      usageQuery.isError || behaviorQuery.isError || activityQuery.isError,
    refetch: () => {
      void usageQuery.refetch();
      void behaviorQuery.refetch();
      void activityQuery.refetch();
    },
  };
}
