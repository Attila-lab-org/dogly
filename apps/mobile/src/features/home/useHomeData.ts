/**
 * Hook Home: quota + ultima analisi + processing + isNewUser da API reali
 * (TanStack Query, sez. 5.3). Se API/sessione non sono disponibili, nessun
 * dato viene inventato. Con una richiesta fallita: usage null,
 * insight assenti, isNewUser false finché la prima pagina non arriva.
 */
import { useQuery } from '@tanstack/react-query';
import { isApiConfigured } from '../auth/env';
import { useSession } from '../auth/SessionProvider';
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
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
  recentInsights: LastInsight[];
  processingEventId: string | null;
  isNewUser: boolean;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

export function useHomeData(dogId: string): HomeDataState {
  const { userId } = useSession();
  const apiConfigured = isApiConfigured();
  const realEnabled = Boolean(userId) && isPersistedId(dogId) && apiConfigured;

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

  const behaviorItems = behaviorQuery.data?.items;
  const derived = behaviorItems ? deriveHomeState(behaviorItems) : null;
  const isNewUser =
    activityQuery.data !== undefined && activityQuery.data.items.length === 0;

  return {
    usage: usageQuery.data ?? null,
    lastInsight: derived?.lastInsight ?? null,
    recentInsights: derived?.recentInsights ?? [],
    processingEventId: derived?.processingEventId ?? null,
    // Cold-start solo dopo una query account+dog esplicitamente scoped.
    isNewUser,
    loading:
      realEnabled &&
      (usageQuery.isLoading ||
        behaviorQuery.isLoading ||
        activityQuery.isLoading),
    // In preview/mock mode the API is intentionally disabled: non è un
    // errore da mostrare al proprietario. Mostriamo il banner solo quando
    // una sessione reale ha davvero fallito il caricamento.
    error:
      realEnabled &&
      (usageQuery.isError || behaviorQuery.isError || activityQuery.isError),
    refetch: () => {
      void usageQuery.refetch();
      void behaviorQuery.refetch();
      void activityQuery.refetch();
    },
  };
}
