export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { getCloudinaryInstance } from "@/lib/cloudinary-buckets";
import type { MediaType, UserSubscription } from "@/types";
import { isSubscriptionValid } from "@/lib/subscription-utils";

/**
 * GET /api/video/stream?id=videoId
 *
 * Validates user access and returns:
 * - Single-file video: one signed Cloudinary URL
 * - Segmented video:   array of signed URLs (one per segment)
 *
 * The response shape differs so the client can branch to the appropriate player.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const videoId = request.nextUrl.searchParams.get("id");
  if (!videoId) {
    return Response.json({ error: "Content ID required" }, { status: 400 });
  }

  try {
    const videoDoc = await adminDb.collection("videos").doc(videoId).get();
    if (!videoDoc.exists) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const video      = videoDoc.data()!;
    const mediaType: MediaType = video.mediaType === "image" ? "image" : "video";
    const isFreePreview        = video.priceINR === 0 && !video.isPremium;

    // ── Access control ───────────────────────────────────────────────────
    if (!isFreePreview) {
      const userDoc = await adminDb.collection("users").doc(auth.uid).get();
      if (!userDoc.exists) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }
      const user               = userDoc.data()!;
      const hasPurchased       = (user.purchasedVideos || []).includes(videoId);
      const hasActiveSubscription = isSubscriptionValid(user.subscription as UserSubscription);
      const isAdmin            = user.role === "admin" || user.role === "super-admin";

      if (!hasPurchased && !hasActiveSubscription && !isAdmin) {
        return Response.json(
          { error: "Access denied", message: "Purchase this item or subscribe to PremiumVOD Premium" },
          { status: 403 }
        );
      }
    }

    // ── Watch-history resume timestamp ───────────────────────────────────
    const historyDoc = mediaType === "video"
      ? await adminDb
          .collection("users").doc(auth.uid)
          .collection("watchHistory").doc(videoId)
          .get()
      : null;
    const lastTimestamp = historyDoc?.exists ? historyDoc.data()?.lastTimestamp || 0 : 0;

    const baseResponse = {
      mediaType,
      lastTimestamp,
      title:           video.title,
      description:     video.description,
      category:        video.category,
      expiresAt:       Math.floor(Date.now() / 1000) + 2 * 60 * 60,
    };

    // ── Mode A: Segmented video ──────────────────────────────────────────
    if (video.isSegmented && Array.isArray(video.segments) && video.segments.length > 0) {
      const segmentUrls = video.segments.map((seg: any) => {
        const cld = getCloudinaryInstance(seg.storageBucket);
        // Force H.264 + AAC transcode for universal browser compatibility.
        // Without this, HEVC/ProRes segments from iPhones play AUDIO-ONLY in
        // Chrome, Firefox, and Android (which don't support HEVC natively).
        // Cloudinary caches the transcoded version — only the very first viewer
        // of a new segment pays the transcode delay; all subsequent plays are instant.
        // sign_url covers the transformation so the signed URL remains tamper-proof.
        const url = cld.url(seg.publicId, {
          resource_type:  "video",
          type:           "upload",
          sign_url:       true,
          secure:         true,
          transformation: [{ video_codec: "h264", audio_codec: "aac" }],
        });
        return { index: seg.index, url, duration: seg.duration };
      });

      return Response.json({
        ...baseResponse,
        isSegmented:   true,
        segments:      segmentUrls,
        totalDuration: video.totalDuration || video.durationInSeconds || 0,
        durationInSeconds: video.totalDuration || video.durationInSeconds || 0,
      });
    }

    // ── Mode B: Single-file video (existing behaviour) ───────────────────
    const cld      = getCloudinaryInstance(video.storageBucket);
    const imageUrl = video.secureUrl || video.thumbnailUrl ||
      cld.url(video.cloudinaryPublicId, { resource_type: "image", type: "upload", secure: true });

    const signedUrl = mediaType === "image"
      ? imageUrl
      : cld.url(video.cloudinaryPublicId, {
          resource_type:    "video",
          format:           "m3u8",
          type:             "authenticated",
          sign_url:         true,
          secure:           true,
          streaming_profile: "auto",
        });

    return Response.json({
      ...baseResponse,
      isSegmented:      false,
      url:              signedUrl,
      durationInSeconds: video.durationInSeconds || 0,
    });
  } catch (error: any) {
    console.error("Stream URL generation failed:", error);
    return Response.json({ error: "Failed to generate stream URL" }, { status: 500 });
  }
}