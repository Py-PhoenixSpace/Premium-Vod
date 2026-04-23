export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/razorpay/order
 * Creates a Razorpay order for a single video purchase (INR).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { videoId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { videoId } = body;
  if (!videoId || typeof videoId !== "string") {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    // Check if already purchased
    const userDoc = await adminDb.collection("users").doc(auth.uid).get();
    const userData = userDoc.data();
    if (userData?.purchasedVideos?.includes(videoId)) {
      return Response.json({ error: "Already purchased" }, { status: 400 });
    }

    // Fetch video price
    const videoDoc = await adminDb.collection("videos").doc(videoId).get();
    if (!videoDoc.exists) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const video = videoDoc.data()!;
    if (video.priceINR === 0) {
      return Response.json({ error: "This is a free video" }, { status: 400 });
    }

    if (typeof video.priceINR !== "number" || video.priceINR < 1) {
      return Response.json({ error: "Invalid video price (minimum ₹1)" }, { status: 400 });
    }

    // Receipt must be ≤ 40 chars (Razorpay limit)
    const ts = Date.now().toString(36);
    const shortUid = auth.uid.slice(0, 10);
    const shortVid = videoId.slice(0, 10);
    const receipt = `${shortUid}_${shortVid}_${ts}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount: Math.round(video.priceINR * 100),
      currency: "INR",
      receipt,
      notes: { userId: auth.uid, videoId },
    });

    // Create pending transaction
    await adminDb.collection("transactions").add({
      userId: auth.uid,
      amount: video.priceINR,
      currency: "INR",
      gateway: "razorpay",
      type: "single_purchase",
      status: "pending",
      razorpayOrderId: order.id,
      videoId,
      createdAt: new Date(),
    });

    return Response.json({
      orderId: order.id,
      amount: video.priceINR * 100,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      videoTitle: video.title,
    });
  } catch (error: any) {
    console.error("Razorpay order creation failed:", error);
    return Response.json(
      { error: error?.error?.description || error?.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
