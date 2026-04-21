import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Proxy — Route Protection
 *
 * Protects /dashboard, /watch/*, /videos/*, /admin/*, and /super-admin/*.
 * Unauthenticated users (no session cookie) are redirected to /login with
 * a `redirect` param so they land back on the right page after signing in.
 *
 * NOTE: Full token/role verification cannot run here — Firebase Admin SDK
 * requires Node.js crypto which is unavailable in the Edge Runtime.
 * Role checks are enforced at layout and API route level via auth-guards.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
