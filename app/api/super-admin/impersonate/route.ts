export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/auth-guards";
import { cookies } from "next/headers";

/**
 * POST /api/super-admin/impersonate
 * Verifies caller is a Super-Admin.
 * Creates a Custom Token for the target UID.
 * Saves the current Super-Admin's session into a backup cookie.
 * Sets the 'is_impersonating' cookie for UI.
 */
export async function POST(request: NextRequest) {
  const authRes = await requireSuperAdmin();
  if (!authRes.ok) return authRes.response;

  try {
    const { targetUid } = await request.json();
    if (!targetUid) {
      return Response.json({ error: "Target UID required" }, { status: 400 });
    }

    // 1. Generate Custom Token for the target user
    const customToken = await adminAuth.createCustomToken(targetUid);

    // 2. Backup the Super-Admin's current session cookie
    const cookieStore = await cookies();
    const currentSession = cookieStore.get("session")?.value;
    
    if (currentSession) {
      const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days
      cookieStore.set("super_admin_impersonator", currentSession, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: expiresIn / 1000,
        path: "/",
      });
    }

    // 3. Set a UI indication cookie (non-httpOnly so JS can read it)
    cookieStore.set("is_impersonating", "true", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day max for an impersonation session
      path: "/",
    });

    return Response.json({ success: true, customToken });
  } catch (error: any) {
    console.error("Failed to impersonate:", error);
    return Response.json(
      { error: "Impersonation failed: " + error.message },
      { status: 500 }
    );
  }
}
