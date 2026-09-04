/**
 * Sessione/auth gate mock (Spec V1 sez. 7.1 / 5.3).
 * Finché Supabase Auth non è collegato, la sessione è un mock tipizzato che
 * pilota il routing dell'entry point (app/index.tsx).
 *
 * TOGGLE DI SVILUPPO: cambia `sessionMock` per simulare i tre stati del
 * journey first-time (sez. 7.1):
 * - 'unauthenticated'      → /(auth)/welcome (welcome/privacy → sign-in)
 * - 'authenticated-no-dog' → /onboarding/dog (crea il profilo del cane)
 * - 'authenticated-with-dog' → /(tabs)/home
 * In produzione lo stato arriverà dalla sessione Supabase in SecureStore
 * (sez. 5.3) + esistenza del profilo cane (GET /v1/dogs, sez. 9).
 */

export type SessionState =
  | 'unauthenticated'
  | 'authenticated-no-dog'
  | 'authenticated-with-dog';

/** Stato di sessione simulato (default: utente con cane, come i mockup). */
export const sessionMock: SessionState = 'authenticated-with-dog';

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
