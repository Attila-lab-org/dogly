import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./env";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase non configurato per l’admin.");
  }
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware refreshes the session.
        }
      },
    },
  });
}

/** Server-only client for cross-user admin reads. */
export function createAdminDataClient() {
  const config = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !serviceRoleKey) return null;
  return createSupabaseClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
