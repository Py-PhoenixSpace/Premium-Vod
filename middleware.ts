import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware sets Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
 * headers ONLY on the admin upload page.
 *
 * These headers are required for SharedArrayBuffer which ffmpeg.wasm
 * uses internally. Without them the WASM thread pool silently hangs,
 * making the upload page freeze permanently on all browsers.
 *
 * We scope this to /admin/upload only because COOP breaks:
 *  - OAuth popups (login with Google)
 *  - Stripe checkout windows
 * …on any page where they appear.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  if (pathname.startsWith("/admin/upload")) {
    res.headers.set("Cross-Origin-Opener-Policy",   "same-origin");
    res.headers.set("Cross-Origin-Embedder-Policy",  "require-corp");
    // Allow the ffmpeg.wasm CDN (unpkg) to be loaded as a shared resource
    res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  }

  return res;
}

export const config = {
  // Run on all routes — the check above limits header injection to /admin/upload
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
