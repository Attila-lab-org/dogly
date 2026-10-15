import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Gate every console route behind a real Supabase session + email allowlist.
 * Demo flags are intentionally gone: production and local use the same auth.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|auth/).*)",
  ],
};
