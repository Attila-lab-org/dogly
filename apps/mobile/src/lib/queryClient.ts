import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query possiede la cache server/API (Spec V1 sez. 5.3).
 * Le query key sono SEMPRE scoped per user e dog; al logout la cache
 * protetta viene svuotata con clearProtectedCache().
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Costruttori di query key scoped user+dog. */
export const queryKeys = {
  /** Radice protetta: tutto ciò che appartiene a un utente */
  user: (userId: string) => ['user', userId] as const,
  dogs: (userId: string) => [...queryKeys.user(userId), 'dogs'] as const,
  dog: (userId: string, dogId: string) =>
    [...queryKeys.user(userId), 'dog', dogId] as const,
  behaviorEvents: (userId: string, dogId: string) =>
    [...queryKeys.dog(userId, dogId), 'behavior-events'] as const,
  behaviorEvent: (userId: string, dogId: string, eventId: string) =>
    [...queryKeys.behaviorEvents(userId, dogId), eventId] as const,
  diary: (userId: string, dogId: string) =>
    [...queryKeys.dog(userId, dogId), 'diary'] as const,
  patterns: (userId: string, dogId: string) =>
    [...queryKeys.dog(userId, dogId), 'patterns'] as const,
  foods: (userId: string, dogId: string) =>
    [...queryKeys.dog(userId, dogId), 'foods'] as const,
  knowledgeScore: (userId: string, dogId: string) =>
    [...queryKeys.dog(userId, dogId), 'knowledge-score'] as const,
  subscription: (userId: string) =>
    [...queryKeys.user(userId), 'subscription'] as const,
};

/**
 * Al logout: svuota completamente la cache protetta (query + mutation),
 * così nessun dato di un utente resta visibile al successivo.
 */
export function clearProtectedCache(client: QueryClient = queryClient): void {
  client.clear();
}
