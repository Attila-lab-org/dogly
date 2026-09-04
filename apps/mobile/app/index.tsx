import React from 'react';
import { Redirect } from 'expo-router';
import { resolveEntryRoute, sessionMock } from '@/mocks/session';

/**
 * Entry point con auth gate (Spec V1 sez. 7.1):
 * - non autenticato → /(auth)/welcome (welcome/privacy summary → sign-in);
 * - autenticato senza cane → /onboarding/dog (profilo in ≤60 s);
 * - autenticato con cane → /(tabs)/home.
 * Mock-driven: lo stato arriva da src/mocks/session.ts (toggle documentato)
 * finché Supabase Auth + GET /v1/dogs non sono collegati (sez. 5.3 / 9).
 */
export default function Index() {
  return <Redirect href={resolveEntryRoute(sessionMock)} />;
}
