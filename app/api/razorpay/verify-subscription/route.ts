export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { createHmac } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getPlanMonths, parseSubscriptionPlan } from "@/lib/subscription-pricing";

/**
 * POST /api/razorpay/verify-subscription
 * Verifies Razorpay payment signature for premium subscription purchases.
 * Activates the user's subscription for the purchased plan duration.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Cryptographic signature verification
  const sigBody = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(sigBody)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return Response.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  try {
    // Verify this order belongs to this user
    const txSnapshot = await adminDb
      .collection("transactions")
      .where("razorpayOrderId", "==", razorpay_order_id)
      .where("userId", "==", auth.uid)
      .limit(1)
      .get();

    if (txSnapshot.empty) {
      return Response.json(
        { error: "Order not found or does not belong to this user" },
        { status: 403 }
      );
    }

    const txDoc = txSnapshot.docs[0];
    const txData = txDoc.data();

    // Read actual amount paid from the transaction record (not hardcoded)
    const amountPaid: number = txData.amount ?? 0;

    const plan = parseSubscriptionPlan(txData.plan, "monthly");
    const durationMonths = Number(txData.durationMonths || getPlanMonths(plan));

    // Activate subscription for selected plan duration.
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + durationMonths);

    const userRef = adminDb.collection("users").doc(auth.uid);
    await userRef.set(
      {
        subscription: {
          status: "active",
          currentPeriodEnd: periodEnd,
          gateway: "razorpay",
          razorpayPaymentId: razorpay_payment_id,
          plan,
          durationMonths,
        },
      },
      { merge: true }
    );

    // Update transaction status
    await txDoc.ref.update({
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      plan,
      durationMonths,
      completedAt: new Date(),
    });

    // Increment platform stats using actual amount paid (not hardcoded)
    const statsRef = adminDb.collection("platformStats").doc("totals");
    await statsRef.set(
      {
        totalRevenueINR: FieldValue.increment(amountPaid),
        activePremiumSubscribers: FieldValue.increment(1),
      },
      { merge: true }
    );

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Razorpay subscription verification failed:", error);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
