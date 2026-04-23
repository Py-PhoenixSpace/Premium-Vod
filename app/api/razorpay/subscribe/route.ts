export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import Razorpay from "razorpay";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  getPlanMonths,
  getPlanPrice,
  normalizeSubscriptionPricing,
  parseSubscriptionPlan,
  PRICING_SETTINGS_COLLECTION,
  PRICING_SETTINGS_DOC_ID,
} from "@/lib/subscription-pricing";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { UserSubscription } from "@/types";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/razorpay/subscribe
 * Creates a Razorpay order for a premium subscription purchase.
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
  const selectedPlanMonths = getPlanMonths(selectedPlan);

  try {
    const userDoc = await adminDb.collection("users").doc(auth.uid).get();
    const userData = userDoc.data();

    if (isSubscriptionValid(userData?.subscription as UserSubscription)) {
      return Response.json({ error: "Already subscribed" }, { status: 400 });
    }

    // Read current monthly subscription price from platform settings.
    const pricingDoc = await adminDb
      .collection(PRICING_SETTINGS_COLLECTION)
      .doc(PRICING_SETTINGS_DOC_ID)
      .get();
    const pricing = normalizeSubscriptionPricing(pricingDoc.data() || {});
    const subscriptionPriceINR =
      getPlanPrice(pricing, selectedPlan) ||
      getPlanPrice(DEFAULT_SUBSCRIPTION_PRICING, selectedPlan);

    if (subscriptionPriceINR < 1) {
      return Response.json({ error: "Invalid subscription price (minimum ₹1)" }, { status: 400 });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(subscriptionPriceINR * 100),
      currency: "INR",
      receipt: `s_${auth.uid.slice(0, 20)}_${Date.now().toString(36)}`,
      notes: {
        userId: auth.uid,
        type: "premium_subscription",
        plan: selectedPlan,
        durationMonths: String(selectedPlanMonths),
      },
    });

    await adminDb.collection("transactions").add({
      userId: auth.uid,
      amount: subscriptionPriceINR,
      currency: "INR",
      gateway: "razorpay",
      type: "subscription_cycle",
      status: "pending",
      razorpayOrderId: order.id,
      plan: selectedPlan,
      durationMonths: selectedPlanMonths,
      createdAt: new Date(),
    });

    return Response.json({
      orderId: order.id,
      amount: subscriptionPriceINR * 100,
      currency: "INR",
      plan: selectedPlan,
      durationMonths: selectedPlanMonths,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.error("Razorpay subscription order failed:", error);
    return Response.json(
      { error: "Failed to create subscription order" },
      { status: 500 }
    );
  }
}
