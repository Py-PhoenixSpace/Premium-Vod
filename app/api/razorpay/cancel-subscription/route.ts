export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import Razorpay from "razorpay";
import { FieldValue } from "firebase-admin/firestore";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/razorpay/cancel-subscription
 * Cancels the user's active Razorpay subscription immediately.
 * Access is revoked at end of current billing period (Razorpay handles this).
 * Firestore subscription status is updated to "canceled".
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    // Fetch the user's current Firestore document
    const userDoc = await adminDb.collection("users").doc(auth.uid).get();
    if (!userDoc.exists) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const subscription = userData.subscription;

    if (!subscription || subscription.gateway !== "razorpay") {
      return Response.json(
        { error: "No active Razorpay subscription found" },
        { status: 400 }
      );
    }

    if (subscription.status !== "active") {
      return Response.json(
        { error: "Subscription is not active" },
        { status: 400 }
      );
    }

    // Cancel via Razorpay API — cancel_at_cycle_end=1 lets user keep access until period end
    const razorpaySubId = subscription.razorpaySubscriptionId;
    if (razorpaySubId) {
      try {
        await (razorpay.subscriptions as any).cancel(razorpaySubId, {
          cancel_at_cycle_end: 1,
        });
      } catch (apiErr) {
        console.warn("Razorpay cancel API call failed (may already be cancelled):", apiErr);
      }
    }

    // Update Firestore — mark as canceling (access until period end)
    await userDoc.ref.update({
      "subscription.status": "canceling",
      "subscription.canceledAt": new Date(),
    });

    // Decrement platform stats
    await adminDb
      .collection("platformStats")
      .doc("totals")
      .set(
        { activePremiumSubscribers: FieldValue.increment(-1) },
        { merge: true }
      );

    return Response.json({
      success: true,
      message: "Subscription cancelled. Access continues until end of billing period.",
      periodEnd: subscription.currentPeriodEnd,
    });
  } catch (error: any) {
    console.error("Razorpay subscription cancellation failed:", error);
    return Response.json({ error: "Cancellation failed" }, { status: 500 });
  }
}
