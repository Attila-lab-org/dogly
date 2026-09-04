/**
 * Test dei fix review-gate (stati mandatory Spec V1 sez. 6 / 7.1 / 21):
 * - auth gate mock-driven: routing entry per stato sessione (sez. 7.1);
 * - digestive result "insufficient image": mock dedicato, niente fallback
 *   silenzioso su evento sconosciuto;
 * - paywall: prezzi/allowance centralizzati nel mock entitlements (sez. 4.1),
 *   stati grace / unavailable store raggiungibili via flag demo;
 * - Home: ultima analisi instradata via lastInsight.eventId (niente id
 *   hardcoded), flag offline di default spento.
 */
import { resolveEntryRoute, sessionMock } from '../mocks/session';
import { demoFlags } from '../mocks/demo';
import { entitlementMock, paywallOfferingMock } from '../mocks/entitlements';
import { fecalEventsMock } from '../mocks/secondary';
import { diaryEntriesMock, homeDataMock } from '../mocks/core';

describe('auth gate (sez. 7.1)', () => {
  it('instrada ogni stato di sessione sulla route corretta', () => {
    expect(resolveEntryRoute('unauthenticated')).toBe('/(auth)/welcome');
    expect(resolveEntryRoute('authenticated-no-dog')).toBe('/onboarding/dog');
    expect(resolveEntryRoute('authenticated-with-dog')).toBe('/(tabs)/home');
  });

  it('default mock coerente con i mockup (utente con cane)', () => {
    expect(sessionMock).toBe('authenticated-with-dog');
  });
});

describe('digestive result "insufficient image" (sez. 6 / 19.1)', () => {
  it('il mock fecal-insufficient-1 modella image_quality insufficient + warnings', () => {
    const event = fecalEventsMock['fecal-insufficient-1'];
    expect(event).toBeDefined();
    expect(event.status).toBe('INSUFFICIENT_IMAGE');
    expect(event.imageQuality).toBe('insufficient');
    expect(event.qualityWarnings.length).toBeGreaterThan(0);
    // nessuna stima/candidato quando la foto non è leggibile
    expect(event.fecalScoreEstimate).toBeNull();
    expect(event.safetyFlags).toEqual([]);
  });

  it('evento sconosciuto → undefined (niente fallback silenzioso su un altro evento)', () => {
    expect(fecalEventsMock['fecal-non-esiste']).toBeUndefined();
  });
});

describe('paywall entitlements centralizzati (sez. 4.1 / 21)', () => {
  it('prezzi e piani arrivano dal mock, coerenti con il listino di lancio', () => {
    const codes = paywallOfferingMock.plans.map((p) => p.code);
    expect(codes).toEqual(['PREMIUM_MONTHLY', 'PREMIUM_ANNUAL']);
    const monthly = paywallOfferingMock.plans[0];
    const annual = paywallOfferingMock.plans[1];
    expect(monthly.price).toBe('€9,99');
    expect(annual.price).toBe('€89,99');
    expect(annual.badge).toBe('Risparmia 25%');
  });

  it('NO unlimited: allowance dichiarata e piano Free sempre visibile', () => {
    expect(paywallOfferingMock.premiumAllowanceLabel).toContain('30');
    expect(paywallOfferingMock.freeChoiceLabel).toContain('Free');
    expect(paywallOfferingMock.benefits.length).toBeGreaterThan(0);
  });

  it('stati grace / unavailable store hanno mock corrispondenti', () => {
    expect(['active', 'grace_period']).toContain(entitlementMock.status);
    expect(entitlementMock.graceMessage.length).toBeGreaterThan(0);
    expect(typeof paywallOfferingMock.storeAvailable).toBe('boolean');
  });
});

describe('flag demo (sez. 6) e route ultima analisi', () => {
  it('tutti i flag demo sono spenti di default', () => {
    expect(demoFlags.homeOffline).toBe(false);
    expect(demoFlags.signInError).toBeNull();
    expect(demoFlags.paywallStoreUnavailable).toBe(false);
    expect(demoFlags.paywallGracePeriod).toBe(false);
  });

  it('lastInsight.eventId risolve a un episodio reale del Diario', () => {
    const insight = homeDataMock.lastInsight;
    expect(insight).not.toBeNull();
    const entry = diaryEntriesMock.find((e) => e.refId === insight?.eventId);
    expect(entry).toBeDefined();
    expect(entry?.domain).toBe('BEHAVIOR');
  });
});
