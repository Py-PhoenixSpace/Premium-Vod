export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAllBuckets, verifyCloudinaryWebhookSignature } from "@/lib/cloudinary-buckets";

/**
 * POST /api/video/webhook
 * Cloudinary notification callback — called when HLS transcoding completes.
 *
 * Security: validates the X-Cld-Signature HMAC before processing any payload.
 * Without this, anyone could POST arbitrary data to corrupt video documents.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // ── Signature verification ────────────────────────────────────────────────
    const signature = request.headers.get("x-cld-signature");
    const timestamp = request.headers.get("x-cld-timestamp");

    if (!signature || !timestamp) {
      console.warn("Cloudinary webhook: missing signature headers");
      return Response.json({ error: "Missing signature" }, { status: 401 });
    }

    // Try verifying against all configured buckets — the webhook may originate
    // from any of them, and we don't know which one upfront. A valid HMAC from
    // any of our own bucket secrets is legitimate. A forged request fails all.
    const allBuckets = getAllBuckets();
    const isValid = allBuckets.some((b) =>
      verifyCloudinaryWebhookSignature(body, signature, timestamp, b.id)
    );

    if (!isValid) {
      console.warn("Cloudinary webhook: invalid signature — request rejected");
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    // ──────────────────────────────────────────────────────────────────────────

    const payload = JSON.parse(body);

    const publicId = payload.public_id as string;
    const duration = payload.duration as number;
    const secureUrl = payload.secure_url as string;

    if (!publicId) {
      return Response.json({ error: "Missing public_id" }, { status: 400 });
    }

    // Generate thumbnail URL from the uploaded video
    const thumbnailUrl = secureUrl
      ? secureUrl.replace(/\.[^.]+$/, ".jpg")
      : "";

    const videosRef = adminDb.collection("videos");

    // First try: find by cloudinaryPublicId (for re-notifications)
    let snapshot = await videosRef
      .where("cloudinaryPublicId", "==", publicId)
      .limit(1)
      .get();

    // If not found, this is the initial upload notification — find the most
    // recent processing video (safe because uploads are admin-sequential)
    if (snapshot.empty) {
      snapshot = await videosRef
        .where("status", "==", "processing")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    }

    if (!snapshot.empty) {
      const videoDoc = snapshot.docs[0];
      await videoDoc.ref.update({
        mediaType: "video",
        cloudinaryPublicId: publicId,
        thumbnailUrl,
        secureUrl: secureUrl || "",
        durationInSeconds: Math.round(duration || 0),
        status: "published",
      });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Cloudinary webhook processing failed:", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
