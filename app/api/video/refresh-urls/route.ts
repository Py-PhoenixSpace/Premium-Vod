export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { getCloudinaryInstance } from "@/lib/cloudinary-buckets";
import type { UserSubscription } from "@/types";
import { isSubscriptionValid } from "@/lib/subscription-utils";

/**
 * GET /api/video/refresh-urls?id=videoId&quality=low|medium|high
 *
 * Re-signs all segment URLs for a video that the user already has access to.
 * Called by SegmentedVideoPlayer before a URL's 2-hour expiry window closes,
 * ensuring long-session viewers never hit 403 Forbidden on a segment.
 *
 * This is a lightweight endpoint — no watch-history lookup, no metadata reads.
 * It only re-signs what's already in Firestore and validates access.
 */

interface QualityTier { width: number; height: number; bitRate: string; quality: string; }
const QUALITY_TIERS: Record<string, QualityTier> = {
  low:    { width: 854,  height: 480,  bitRate: "1200k", quality: "auto:eco"  },
  medium: { width: 1280, height: 720,  bitRate: "2500k", quality: "auto:good" },
  high:   { width: 1920, height: 1080, bitRate: "5000k", quality: "auto:good" },
};

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const videoId     = searchParams.get("id");
  const qualityHint = searchParams.get("quality") || "medium";

  if (!videoId) return Response.json({ error: "id required" }, { status: 400 });

  const tier = QUALITY_TIERS[qualityHint] ?? QUALITY_TIERS.medium;

  try {
    const [videoDoc, userDoc] = await Promise.all([
      adminDb.collection("videos").doc(videoId).get(),
      adminDb.collection("users").doc(auth.uid).get(),
    ]);

    if (!videoDoc.exists) return Response.json({ error: "Not found" }, { status: 404 });

    const video = videoDoc.data()!;
    const isFree = video.priceINR === 0 && !video.isPremium;

    if (!isFree) {
      if (!userDoc.exists) return Response.json({ error: "Forbidden" }, { status: 403 });
      const user = userDoc.data()!;
      const ok =
        (user.purchasedVideos || []).includes(videoId) ||
        isSubscriptionValid(user.subscription as UserSubscription) ||
        user.role === "admin" || user.role === "super-admin";
      if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!video.isSegmented || !Array.isArray(video.segments)) {
      return Response.json({ error: "Not a segmented video" }, { status: 400 });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 h from now

    const segments = video.segments.map((seg: any) => {
      const cld = getCloudinaryInstance(seg.storageBucket);
      const url = cld.url(seg.publicId, {
        resource_type: "video",
        type: "upload",
        sign_url: true,
        secure: true,
        transformation: [{
          video_codec: "h264", audio_codec: "aac",
          width: tier.width, height: tier.height,
          crop: "limit", quality: tier.quality, bit_rate: tier.bitRate,
        }],
      });
      return { index: seg.index, url, duration: seg.duration };
    });

    return Response.json({ segments, expiresAt });
  } catch (err: any) {
    console.error("refresh-urls failed:", err);
    return Response.json({ error: "Failed to refresh URLs" }, { status: 500 });
  }
}
