/**
 * Entitlements e offering del paywall (Spec V1 sez. 21 / 21.1 / 21.2).
 * Mock centralizzato: la schermata /paywall legge SOLO da qui, nessun prezzo
 * o allowance hard-coded nella UI (sez. 4.1).
 * In produzione questi dati arrivano da RevenueCat offerings + backend
 * entitlements (Spec 4.1/21): GET /v1/subscription/status (sez. 9).
 */
import type { PlanCode } from '../features/secondary/types';

/** Piano acquistabile mostrato nel paywall (mai unlimited, sez. 21). */
export interface PaywallPlan {
  /** PlanCode canonico (sez. 21): FREE non è acquistabile, resta scelta visibile */
  code: Exclude<PlanCode, 'FREE'>;
  title: string;
  /** Prezzo formattato dallo store (mock: listino lancio sez. 21) */
  price: string;
  per: string;
  badge?: string;
}

/** Offering completo del paywall: piani, benefit, allowance dichiarate. */
export interface PaywallOffering {
  /** false → stato mandatory "unavailable store" (sez. 6 Paywall) */
  storeAvailable: boolean;
  benefits: string[];
  /** Allowance premium dichiarata apertamente (NO unlimited, sez. 21) */
  premiumAllowanceLabel: string;
  /** Il piano FREE resta sempre visibile come scelta (sez. 21.2) */
  freeChoiceLabel: string;
  plans: PaywallPlan[];
}

export const paywallOfferingMock: PaywallOffering = {
  storeAvailable: true,
  benefits: [
    '30 analisi comportamentali + 30 digestive al mese',
    'Diario completo senza limiti di cronologia',
    'Pattern e trend personali di Rocky',
    'Insights su alimentazione e digestione',
  ],
  premiumAllowanceLabel: '30 + 30 analisi al mese',
  freeChoiceLabel:
    'Continua con il piano Free (3 + 3 analisi al mese, gratis per sempre)',
  plans: [
    { code: 'PREMIUM_MONTHLY', title: 'Mensile', price: '€9,99', per: 'al mese' },
    {
      code: 'PREMIUM_ANNUAL',
      title: 'Annuale',
      price: '€89,99',
      per: "all'anno",
      badge: 'Risparmia 25%',
    },
  ],
};

/**
 * Stato entitlement lato server mirror (sez. 21.1: grace period, refund,
 * cancellation aggiornano l'entitlement senza cancellare i dati del cane).
 * 'grace_period' → banner gentile nel paywall (stato mandatory "grace", sez. 6).
 */
export interface EntitlementStatus {
  status: 'active' | 'grace_period';
  /** Messaggio gentile per il grace period (no dark pattern, sez. 21.2) */
  graceMessage: string;
}

export const entitlementMock: EntitlementStatus = {
  status: 'active',
  graceMessage:
    'Il rinnovo non è andato a buon fine, ma niente panico: Premium resta attivo ancora per qualche giorno mentre lo store riprova. Puoi aggiornare il metodo di pagamento quando vuoi.',
};
