import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Proxy — Route Protection
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users away from protected routes → /login?redirect=<path>
 *
 * Security model:
 *  Cookie *presence* check only — Firebase Admin SDK (full token verification)
 *  cannot run in the Edge Runtime. API routes remain the true security boundary
 *  via requireUser() / requireAdmin() in auth-guards.ts.
 *  This layer provides UX-level protection (no flash of protected content).
 *
 *  NOTE: We intentionally do NOT redirect authenticated users away from /login
 *  or /register here. The proxy can only check cookie *presence*, not validity.
 *  A stale or expired session cookie would cause false redirects to /dashboard
 *  for genuinely unauthenticated users. The client-side useEffect in each auth
 *  page handles that redirect accurately using the live Firebase auth state.
 *
 *  Fail-safe: any unexpected error allows the request through.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/watch",
  "/videos",
  "/admin",
  "/super-admin",
];

export function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const sessionCookie = request.cookies.get("session")?.value;
    const isAuthenticated = Boolean(sessionCookie);

    // ── Protect private routes ─────────────────────────────────────────────
    const isProtected = PROTECTED_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix)
    );

    if (isProtected && !isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch {
    // Fail-open — never block a request due to proxy error
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/watch/:path*",
    "/videos/:path*",
    "/admin/:path*",
    "/super-admin/:path*",
  ],
};
