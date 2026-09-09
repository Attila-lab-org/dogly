/**
 * Flag demo per sviluppo (Spec V1 sez. 6): rendono raggiungibili gli stati
 * mandatory che dipendono da integrazioni non ancora collegate (connettività,
 * store billing, errori Supabase Auth).
 *
 * TOGGLE DI SVILUPPO: imposta i flag a true per simulare lo stato; in
 * produzione saranno sostituiti da stato reale (network monitor, RevenueCat
 * offerings, errori Supabase Auth). Nessun flag è attivo di default.
 */

/** Errori di sign-in simulabili (sez. 6 Welcome/Sign-in). */
export type DemoSignInError = 'auth_error' | 'account_exists' | 'offline';

export const demoFlags = {
  /** Home "offline" (sez. 6): banner con retry, i dati mostrati restano gli ultimi disponibili. */
  homeOffline: false,
  /** Sign-in: se impostato, il tap su un provider mostra questo errore invece di accedere. */
  signInError: null as DemoSignInError | null,
  /** Paywall "unavailable store" (sez. 6): offerings non caricabili → stato con retry. */
  paywallStoreUnavailable: false,
  /** Paywall "grace" (sez. 6 / 21.1): rinnovo in grace period → banner gentile. */
  paywallGracePeriod: false,
};
