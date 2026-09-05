/**
 * Gating Sign in with Apple (ADR-001, LOCKED — bloccante App Store):
 * il bottone "Continua con Apple" è visibile SOLO su iOS e solo se
 * l'autenticazione Apple è disponibile sul dispositivo.
 * Modulo puro (nessun import nativo) per essere testabile in node.
 */
export function shouldOfferAppleSignIn(
  platformOS: string,
  appleAvailable: boolean,
): boolean {
  return platformOS === 'ios' && appleAvailable;
}
