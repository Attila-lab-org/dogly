import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./env";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase non configurato per l’admin.");
  }
  return createBrowserClient(config.url, config.publishableKey);
}
