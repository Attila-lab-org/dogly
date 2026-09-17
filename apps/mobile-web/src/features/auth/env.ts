/** Env helpers for the real Supabase/API runtime. */

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

/** Mock authentication is disabled in every runtime build. */
export function shouldUseMockAuthGate(): boolean {
  return false;
}
