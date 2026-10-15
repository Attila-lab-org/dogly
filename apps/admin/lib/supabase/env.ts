/**
 * Public Supabase settings for the Control Center.
 * Never put the service-role key here — only the publishable/anon key.
 */

export function getSupabasePublicConfig(): {
  url: string;
  publishableKey: string;
} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}

/** Comma/space-separated emails allowed into the console. Fail-closed if empty. */
export function getAllowedAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = getAllowedAdminEmails();
  if (allowed.size === 0) return false;
  return allowed.has(email.trim().toLowerCase());
}
