/**
 * Env helpers for Supabase / API. Missing env → __DEV__ may use mock gate.
 */

export function getSupabaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_SUPABASE_URL || undefined;
}

export function getSupabasePublishableKey(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function isApiConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_API_URL);
}

/** True when real auth cannot run and __DEV__ mock gate is allowed. */
export function shouldUseMockAuthGate(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && !isSupabaseConfigured();
}
