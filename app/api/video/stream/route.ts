export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { getCloudinaryInstance } from "@/lib/cloudinary-buckets";
import type { MediaType, UserSubscription } from "@/types";

import { isSubscriptionValid } from "@/lib/subscription-utils";

/**
 * GET /api/video/stream?id=videoId
 * Validates user access and returns a time-limited signed Cloudinary HLS URL.
 * Automatically uses the correct Cloudinary bucket based on the video's storageBucket field.
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

    const video = videoDoc.data()!;
    const mediaType: MediaType = video.mediaType === "image" ? "image" : "video";

    // Free = priceINR is 0 AND not a premium subscription video
    const isFreePreview = video.priceINR === 0 && !video.isPremium;

    if (!isFreePreview) {
      const userDoc = await adminDb.collection("users").doc(auth.uid).get();
      if (!userDoc.exists) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      const user = userDoc.data()!;
      const hasPurchased = (user.purchasedVideos || []).includes(videoId);
      const hasActiveSubscription = isSubscriptionValid(user.subscription as UserSubscription);
      const isAdmin =
        user.role === "admin" || user.role === "super-admin";

      if (!hasPurchased && !hasActiveSubscription && !isAdmin) {
        return Response.json(
          {
            error: "Access denied",
            message: "Purchase this item or subscribe to PremiumVOD Premium",
          },
          { status: 403 }
        );
      }
    }

    // Use the correct Cloudinary instance based on media's storage bucket
    const cld = getCloudinaryInstance(video.storageBucket);

    const imageUrl =
      video.secureUrl ||
      video.thumbnailUrl ||
      cld.url(video.cloudinaryPublicId, {
        resource_type: "image",
        type: "upload",
        secure: true,
      });

    const signedUrl =
      mediaType === "image"
        ? imageUrl
        : cld.url(video.cloudinaryPublicId, {
            resource_type: "video",
            format: "m3u8",
            type: "authenticated",
            sign_url: true,
            secure: true,
            streaming_profile: "auto",
          });

    const historyDoc =
      mediaType === "video"
        ? await adminDb
            .collection("users")
            .doc(auth.uid)
            .collection("watchHistory")
            .doc(videoId)
            .get()
        : null;

    const lastTimestamp = historyDoc?.exists
      ? historyDoc.data()?.lastTimestamp || 0
      : 0;

    return Response.json({
      url: signedUrl,
      mediaType,
      expiresAt: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
      lastTimestamp,
      title: video.title,
      description: video.description,
      durationInSeconds:
        mediaType === "video" ? video.durationInSeconds || 0 : 0,
      category: video.category,
    });
  } catch (error: any) {
    console.error("Stream URL generation failed:", error);
    return Response.json(
      { error: "Failed to generate stream URL" },
      { status: 500 }
    );
  }
}