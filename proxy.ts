import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Proxy — Route Protection
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users away from protected routes → /login?redirect=<path>
 *  2. Redirect authenticated users away from auth routes → /dashboard
 *
 * Security model:
 *  Cookie *presence* check only — Firebase Admin SDK (full token verification)
 *  cannot run in the Edge Runtime. API routes remain the true security boundary
 *  via requireUser() / requireAdmin() in auth-guards.ts.
 *  This layer provides UX-level protection (no flash of protected content).
 *
 *  For auth routes (/login, /register): a stale/expired cookie would redirect a
 *  genuinely unauthenticated user to /dashboard, where the protected-route guard
 *  would immediately send them back to /login. Net effect: one extra round-trip,
 *  no incorrect access. The client-side useEffect in each auth page also fires as
 *  a secondary check using live Firebase auth state.
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

/** Routes that logged-in users should not be able to visit */
const AUTH_ONLY_PATHS = ["/login", "/register"];

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

    // ── Redirect authenticated users away from auth pages ─────────────────
    const isAuthOnlyPage = AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));

    if (isAuthOnlyPage && isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const res = NextResponse.next();

    // ── COOP/COEP headers for ffmpeg.wasm on the admin upload page ─────────
    // SharedArrayBuffer (required by ffmpeg.wasm) is only available when the
    // page is cross-origin isolated. We set these headers ONLY on /admin/upload
    // because COOP breaks OAuth popups and Stripe checkout on other pages.
    if (pathname === "/admin/upload" || pathname.startsWith("/admin/upload/")) {
      res.headers.set("Cross-Origin-Opener-Policy",   "same-origin");
      res.headers.set("Cross-Origin-Embedder-Policy",  "require-corp");
      res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    }

    return res;
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
