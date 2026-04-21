export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

/**
 * POST /api/auth/session
 * Receives Firebase ID token, verifies it, and sets an httpOnly session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return Response.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Run verification and cookie creation in parallel for faster execution
    const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
    const [decodedToken, sessionCookie, cookieStore] = await Promise.all([
      adminAuth.verifyIdToken(idToken),
      adminAuth.createSessionCookie(idToken, { expiresIn }),
      cookies(),
    ]);

    // Set the httpOnly cookie
    cookieStore.set("session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });

    return Response.json({
      success: true,
      uid: decodedToken.uid,
    });
  } catch (error: any) {
    console.error("Session creation failed:", error);
    return Response.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie (logout).
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("session");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Session deletion failed:", error);
    return Response.json(
      { error: "Failed to clear session" },
      { status: 500 }
    );
  }
}
