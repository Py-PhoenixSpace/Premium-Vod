export const dynamic = "force-dynamic";

import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/**
 * POST /api/stripe/cancel-subscription
 * Cancels the user's active Stripe subscription at period end —
 * the user keeps access until currentPeriodEnd, then it lapses.
 */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const userDoc = await adminDb.collection("users").doc(auth.uid).get();
    if (!userDoc.exists) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const subscription = userData.subscription;

    if (!subscription || subscription.gateway !== "stripe") {
      return Response.json(
        { error: "No active Stripe subscription found" },
        { status: 400 }
      );
    }

    if (subscription.status !== "active") {
      return Response.json(
        { error: "Subscription is not active" },
        { status: 400 }
      );
    }

    const stripeSubId: string = subscription.stripeSubscriptionId;
    if (!stripeSubId) {
      return Response.json(
        { error: "Stripe subscription ID not found" },
        { status: 400 }
      );
    }

    // Cancel at period end — user retains access until currentPeriodEnd
    await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });

    // Update Firestore — "canceling" means active but will not renew
    await userDoc.ref.update({
      "subscription.status": "canceling",
      "subscription.canceledAt": new Date(),
    });

    const periodEnd = subscription.currentPeriodEnd?.toDate?.() ?? null;

    return Response.json({
      success: true,
      message: "Subscription cancelled. Access continues until end of billing period.",
      periodEnd: periodEnd?.toISOString() ?? null,
    });
  } catch (error: unknown) {
    console.error("Stripe subscription cancellation failed:", error);
    return Response.json({ error: "Cancellation failed" }, { status: 500 });
  }
}
