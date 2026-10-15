import { NextResponse, type NextRequest } from "next/server";

/**
 * The current admin UI has no server-side identity/RBAC provider yet.
 * Keep the mock console unreachable unless it is explicitly enabled for local
 * demos; this prevents direct URL access from looking like an admin session.
 */
export function middleware(request: NextRequest) {
  // The demo flag is for a local prototype only. Never let a copied public
  // environment variable expose the mock console in a production deployment.
  const demoEnabled =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ADMIN_DEMO === "true";
  if (demoEnabled) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
