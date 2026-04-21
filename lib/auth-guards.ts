import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export type AuthResult =
  | { ok: true; uid: string; role: string }
  | { ok: false; response: Response };

/**
 * Verifies the session cookie and returns the authenticated user's uid + role.
 * Returns a 401/403 Response on failure — caller should return it immediately.
 */
async function verifySession(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
    const userDoc = await adminDb
      .collection("users")
      .doc(decodedClaims.uid)
      .get();
    const userData = userDoc.data();

    if (!userData) {
      return {
        ok: false,
        response: Response.json({ error: "User not found" }, { status: 401 }),
      };
    }

    return { ok: true, uid: decodedClaims.uid, role: userData.role || "user" };
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      ),
    };
  }
}

/**
 * Requires any authenticated user.
 * Use in routes that are user-specific (stream, progress, purchase).
 */
export async function requireUser(): Promise<AuthResult> {
  const result = await verifySession();
  if (!result.ok) return result;
  return result;
}

/**
 * Requires an admin or super-admin session.
 * Use in admin-only routes (upload, delete, finalize, storage).
 */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await verifySession();
  if (!result.ok) return result;

  if (result.role !== "admin" && result.role !== "super-admin") {
    return {
      ok: false,
      response: Response.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    };
  }

  return result;
}

/**
 * Requires a super-admin session.
 * Use in super-admin-only routes (promote to super-admin, full user control).
 */
export async function requireSuperAdmin(): Promise<AuthResult> {
  const result = await verifySession();
  if (!result.ok) return result;

  if (result.role !== "super-admin") {
    return {
      ok: false,
      response: Response.json(
        { error: "Super-admin access required" },
        { status: 403 }
      ),
    };
  }

  return result;
}
