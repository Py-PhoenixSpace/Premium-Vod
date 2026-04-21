export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";

/**
 * POST /api/auth/register
 * Creates Firestore user document AND session cookie in a single call.
 * This eliminates the extra round-trip that was slowing down registration.
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken, displayName } = await request.json();

    if (!idToken) {
      return Response.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Verify the token to get the UID
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    // Check if user doc already exists
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists) {
      // User already exists, just set the session
      return await setSessionCookie(idToken);
    }

    // Create the Firestore user document
    await adminDb.collection("users").doc(uid).set({
      uid,
      email: email || "",
      displayName: displayName || "",
      role: "user",
      purchasedVideos: [],
      subscription: {
        status: "none",
        currentPeriodEnd: null,
        stripeCustomerId: "",
        stripeSubscriptionId: "",
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // Increment total registered users (fire and forget)
    const statsRef = adminDb.collection("platformStats").doc("totals");
    statsRef.set(
      { totalRegisteredUsers: FieldValue.increment(1) },
      { merge: true }
    ).catch((err) => console.error("Stats update failed:", err));

    // Set session cookie immediately
    return await setSessionCookie(idToken);
  } catch (error: any) {
    console.error("User registration failed:", error);
    return Response.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}

/**
 * Helper: Sets the session cookie
 */
async function setSessionCookie(idToken: string) {
  try {
    // Create a session cookie (expires in 14 days)
    const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    // Set the httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set("session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Session cookie creation failed:", error);
    return Response.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
