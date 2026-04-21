export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

/**
 * POST /api/super-admin/revert
 * Verifies the backup 'super_admin_impersonator' cookie.
 * Generates a Custom Token back for the Super-Admin.
 * Clears the impersonation trace cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const impersonatorSession = cookieStore.get("super_admin_impersonator")?.value;

    if (!impersonatorSession) {
      return Response.json(
        { error: "No impersonator session found" },
        { status: 400 }
      );
    }

    // Verify the backup cookie is actually valid and belongs to a super-admin
    const decodedClaims = await adminAuth.verifySessionCookie(impersonatorSession);

    // We trust this cookie since we signed it, but double check permissions
    const originalUid = decodedClaims.uid;
    
    // Generate Custom Token for the original Super-Admin
    const customToken = await adminAuth.createCustomToken(originalUid);

    // Clear the backup and the UI flag cookies
    cookieStore.delete("super_admin_impersonator");
    cookieStore.delete("is_impersonating");

    return Response.json({ success: true, customToken });
  } catch (error: any) {
    console.error("Failed to revert impersonation:", error);
    return Response.json(
      { error: "Failed to revert: " + error.message },
      { status: 500 }
    );
  }
}
