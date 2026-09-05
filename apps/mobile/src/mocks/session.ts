/**
 * Auth gate helpers (Spec V1 sez. 7.1).
 * Produzione: SessionProvider (Supabase + GET /v1/dogs).
 * `sessionMock` resta solo per __DEV__ quando mancano le env Supabase.
 */

export type SessionState =
  | 'unauthenticated'
  | 'authenticated-no-dog'
  | 'authenticated-with-dog';

/** Fallback __DEV__ senza EXPO_PUBLIC_SUPABASE_* — non usato in produzione. */
export const sessionMock: SessionState = 'unauthenticated';

export type EntryRoute = '/(auth)/welcome' | '/onboarding/dog' | '/(tabs)/home';

/** Auth gate (sez. 7.1): instradamento dell'entry point per stato sessione. */
export function resolveEntryRoute(state: SessionState): EntryRoute {
  switch (state) {
    case 'unauthenticated':
      return '/(auth)/welcome';
    case 'authenticated-no-dog':
      return '/onboarding/dog';
    case 'authenticated-with-dog':
      return '/(tabs)/home';
  }
}
