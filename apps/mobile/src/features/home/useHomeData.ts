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
import { deriveHomeState, fetchDiaryPage, fetchUsageSummary } from './api';

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
  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  const usageQuery = useQuery({
    queryKey: [...queryKeys.user(userId ?? 'anon'), 'usage'],
    queryFn: fetchUsageSummary,
    enabled: realEnabled,
  });

  const diaryQuery = useQuery({
    queryKey: queryKeys.diary(userId ?? 'anon', dogId),
    queryFn: () => fetchDiaryPage({ dogId, limit: 20 }),
    enabled: realEnabled,
  });

  if (!realEnabled) {
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

  const items = diaryQuery.data?.items;
  const derived = items ? deriveHomeState(items) : null;

  return {
    usage: usageQuery.data ?? null,
    lastInsight: derived?.lastInsight ?? null,
    processingEventId: derived?.processingEventId ?? null,
    // new user solo a prima pagina caricata e vuota: mai finto cold-start
    isNewUser: derived?.isNewUser ?? false,
    source: 'api',
    loading: usageQuery.isLoading || diaryQuery.isLoading,
    error: usageQuery.isError || diaryQuery.isError,
    refetch: () => {
      void usageQuery.refetch();
      void diaryQuery.refetch();
    },
  };
}
