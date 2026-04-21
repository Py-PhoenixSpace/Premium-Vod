export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";

/**
 * GET /api/admin/check-title?title=...
 * Returns { exists: boolean } — used by the upload form to warn about duplicate titles.
 * Admin-only.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();

  if (!title || title.length < 3) {
    return Response.json({ exists: false });
  }

  try {
    const snapshot = await adminDb
      .collection("videos")
      .where("title", "==", title)
      .limit(1)
      .get();

    return Response.json({ exists: !snapshot.empty });
  } catch (error) {
    console.error("check-title error:", error);
    // Non-blocking — fail open so upload isn't blocked
    return Response.json({ exists: false });
  }
}
