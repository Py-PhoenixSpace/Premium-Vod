import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Proxy — Route Protection
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users away from protected routes → /login?redirect=<path>
 *  2. Redirect already-authenticated users away from /login and /register → /dashboard
 *
 * Security model:
 *  Cookie *presence* check only — Firebase Admin SDK (full token verification)
 *  cannot run in the Edge Runtime. API routes remain the true security boundary
 *  via requireUser() / requireAdmin() in auth-guards.ts.
 *  This layer provides UX-level protection (no flash of protected content,
 *  no double-login for already-authed users).
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

const AUTH_ROUTES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const sessionCookie = request.cookies.get("session")?.value;
    const isAuthenticated = Boolean(sessionCookie);

    // ── 1. Protect private routes ─────────────────────────────────────────
    const isProtected = PROTECTED_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix)
    );

    if (isProtected && !isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ── 2. Prevent already-authed users from seeing login/register ─────────
    const isAuthRoute = AUTH_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );

    if (isAuthRoute && isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
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
    "/login",
    "/register",
  ],
};
