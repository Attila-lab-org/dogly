import { NextResponse, type NextRequest } from "next/server";

/**
 * The current admin UI has no server-side identity/RBAC provider yet.
 * Keep the mock console unreachable unless it is explicitly enabled for local
 * demos; this prevents direct URL access from looking like an admin session.
 */
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ADMIN_DEMO === "true") {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
