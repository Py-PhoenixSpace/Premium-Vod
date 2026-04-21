export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import Stripe from "stripe";
import { parseSubscriptionPlan } from "@/lib/subscription-pricing";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { UserSubscription } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for PremiumVOD Premium subscription.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { plan?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Optional body; defaults to monthly when absent.
  }
  const selectedPlan = parseSubscriptionPlan(body.plan, "monthly");

  const stripePriceIdByPlan: Record<string, string | undefined> = {
    monthly: process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID,
    quarterly: process.env.STRIPE_PRICE_ID_QUARTERLY,
    halfYearly: process.env.STRIPE_PRICE_ID_HALFYEARLY,
  };
  const selectedPriceId = stripePriceIdByPlan[selectedPlan];

  if (!selectedPriceId) {
    return Response.json(
      {
        error:
          selectedPlan === "quarterly"
            ? "Quarterly Stripe plan is not configured. Set STRIPE_PRICE_ID_QUARTERLY."
            : "6-month Stripe plan is not configured. Set STRIPE_PRICE_ID_HALFYEARLY.",
      },
      { status: 400 }
    );
  }

  try {
    const userDoc = await adminDb.collection("users").doc(auth.uid).get();
    const userData = userDoc.data();

    if (isSubscriptionValid(userData?.subscription as UserSubscription)) {
      return Response.json(
        { error: "Already subscribed to PremiumVOD Premium" },
        { status: 400 }
      );
    }

    let customerId = userData?.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email || "",
        metadata: { firebaseUid: auth.uid },
      });
      customerId = customer.id;

      // Persist the customer ID immediately so we don't create duplicates
      await adminDb
        .collection("users")
        .doc(auth.uid)
        .set({ subscription: { stripeCustomerId: customerId } }, { merge: true });
    }

    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const origin = configuredAppUrl || request.nextUrl.origin || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: selectedPriceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/dashboard?subscription=success`,
      cancel_url: `${origin}/dashboard?subscription=canceled`,
      metadata: { firebaseUid: auth.uid, plan: selectedPlan },
      subscription_data: {
        metadata: { firebaseUid: auth.uid, plan: selectedPlan },
      },
    });

    return Response.json({ sessionUrl: checkoutSession.url });
  } catch (error: unknown) {
    console.error("Stripe checkout creation failed:", error);
    return Response.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
