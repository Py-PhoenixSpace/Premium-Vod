export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/auth-guards";
import { FieldValue } from "firebase-admin/firestore";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { UserSubscription } from "@/types";

/**
 * POST /api/super-admin/users
 * Super-admin only: promote/demote/ban users including admins.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
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

  // Block self-demotion
  const selfDemotionActions = ["make_admin", "make_user"];
  if (selfDemotionActions.includes(action) && userId === auth.uid) {
    return Response.json(
      { error: "You cannot demote yourself from super-admin." },
      { status: 403 }
    );
  }

  const targetDoc = await adminDb.collection("users").doc(userId).get();
  if (!targetDoc.exists) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const targetData = targetDoc.data()!;

  try {
    const userRef = adminDb.collection("users").doc(userId);

    switch (action) {
      case "make_admin":
        await userRef.update({ role: "admin" });
        break;

      case "make_user":
        await userRef.update({ role: "user" });
        break;

      case "make_super_admin":
        await userRef.update({ role: "super-admin" });
        break;

      case "grant_premium": {
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);

        await userRef.set(
          {
            subscription: {
              status: "active",
              currentPeriodEnd: periodEnd,
              gateway: "manual",
              grantedBySuperAdmin: true,
            },
          },
          { merge: true }
        );

        // Only increment stats if user wasn't already active
        if (!isSubscriptionValid(targetData.subscription as UserSubscription)) {
          await adminDb
            .collection("platformStats")
            .doc("totals")
            .set(
              { activePremiumSubscribers: FieldValue.increment(1) },
              { merge: true }
            );
        }
        break;
      }

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

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Super-admin action failed:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
}
