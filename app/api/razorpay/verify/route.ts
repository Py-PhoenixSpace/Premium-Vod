export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { createHmac } from "crypto";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/razorpay/verify
 * Cryptographically verifies Razorpay payment signature, unlocks video, records transaction.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    videoId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, videoId } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !videoId) {
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
    // Verify the order actually belongs to this user via transaction record
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

    // Atomically add videoId to user's purchasedVideos
    const userRef = adminDb.collection("users").doc(auth.uid);
    await userRef.update({
      purchasedVideos: FieldValue.arrayUnion(videoId),
    });

    // Update transaction status
    await txSnapshot.docs[0].ref.update({
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      completedAt: new Date(),
    });

    // Fetch actual video price for accurate revenue tracking
    const videoDoc = await adminDb.collection("videos").doc(videoId).get();
    const videoData = videoDoc.data();
    if (videoData && typeof videoData.priceINR === "number") {
      const statsRef = adminDb.collection("platformStats").doc("totals");
      await statsRef.set(
        { totalRevenueINR: FieldValue.increment(videoData.priceINR) },
        { merge: true }
      );
    }

    return Response.json({ success: true, videoId });
  } catch (error: any) {
    console.error("Razorpay verification failed:", error);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}