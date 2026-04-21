export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, requireUser } from "@/lib/auth-guards";
import { FieldValue } from "firebase-admin/firestore";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { UserSubscription } from "@/types";

/**
 * GET /api/admin/users?page=1&search=&cursor=
 * Admin/Super-admin: paginated list of all platform users.
 * Uses cursor-based pagination to avoid fetching all documents into memory.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const search = request.nextUrl.searchParams.get("search") || "";
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
  const pageSize = 20;

  try {
    const usersRef = adminDb.collection("users");

    // For search we still need in-memory filtering (Firestore has no full-text search).
    // We fetch all only when searching — acceptable for an admin tool.
    // For browse (no search), we use cursor-based pagination.
    if (search) {
      const snapshot = await usersRef.orderBy("createdAt", "desc").get();
      const q = search.toLowerCase();

      const filtered = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            displayName: data.displayName || "",
            email: data.email || "",
            role: data.role || "user",
            subscriptionStatus: isSubscriptionValid(data.subscription as UserSubscription) ? "active" : data.subscription?.status || "none",
            purchasedVideosCount: (data.purchasedVideos || []).length,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          };
        })
        .filter(
          (u) =>
            (u.displayName.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q)) &&
            (auth.role === "super-admin" || u.role !== "super-admin")
        );

      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
      return Response.json({ users: paginated, total, page, pageSize });
    }

    // No search — cursor-based pagination
    let query = usersRef
      .orderBy("createdAt", "desc")
      .limit(pageSize + 1); // fetch one extra to detect hasNextPage

    if (page > 1) {
      // Use offset-based approach for simplicity (admin tool, not public-facing)
      const offsetSnapshot = await usersRef
        .orderBy("createdAt", "desc")
        .limit((page - 1) * pageSize)
        .get();

      const lastVisible = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
      if (lastVisible) {
        query = usersRef
          .orderBy("createdAt", "desc")
          .startAfter(lastVisible)
          .limit(pageSize + 1);
      }
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    // Get total count (cached via platformStats for performance)
    const statsDoc = await adminDb
      .collection("platformStats")
      .doc("totals")
      .get();
    const total = statsDoc.data()?.totalRegisteredUsers ?? docs.length;

    const users = docs
      .map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: data.displayName || "",
          email: data.email || "",
          role: data.role || "user",
          subscriptionStatus: isSubscriptionValid(data.subscription as UserSubscription) ? "active" : data.subscription?.status || "none",
          purchasedVideosCount: (data.purchasedVideos || []).length,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      })
      .filter((u) => auth.role === "super-admin" || u.role !== "super-admin");

    return Response.json({ users, total, page, pageSize, hasMore });
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return Response.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Admin/Super-admin: perform an action on a user.
 * Actions: "promote_admin" | "demote_admin" | "revoke_premium"
 * Note: only super-admin can promote/demote admins.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { userId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, action } = body;
  if (!userId || !action) {
    return Response.json(
      { error: "userId and action required" },
      { status: 400 }
    );
  }

  const targetDoc = await adminDb.collection("users").doc(userId).get();
  const targetData = targetDoc.data();
  if (!targetData)
    return Response.json({ error: "User not found" }, { status: 404 });

  const targetRole = targetData.role;

  if (targetRole === "super-admin" && auth.role !== "super-admin") {
    return Response.json(
      { error: "Permission denied: Cannot modify a super-admin" },
      { status: 403 }
    );
  }

  if (
    (action === "promote_admin" || action === "demote_admin") &&
    auth.role !== "super-admin"
  ) {
    return Response.json(
      { error: "Only super-admin can change admin roles" },
      { status: 403 }
    );
  }

  try {
    const userRef = adminDb.collection("users").doc(userId);

    switch (action) {
      case "promote_admin":
        await userRef.update({ role: "admin" });
        break;

      case "demote_admin":
        if (targetRole === "super-admin") {
          return Response.json(
            { error: "Cannot demote a super-admin" },
            { status: 403 }
          );
        }
        await userRef.update({ role: "user" });
        break;

      case "revoke_premium": {
        const wasActive = isSubscriptionValid(targetData.subscription as UserSubscription);
        await userRef.set(
          { subscription: { status: "canceled" } },
          { merge: true }
        );
        if (wasActive) {
          await adminDb
            .collection("platformStats")
            .doc("totals")
            .set(
              { activePremiumSubscribers: FieldValue.increment(-1) },
              { merge: true }
            );
        }
        break;
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    return Response.json({ success: true, userId, action });
  } catch (error: any) {
    console.error("User action failed:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
}
