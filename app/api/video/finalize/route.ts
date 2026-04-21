export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";
import { getBucketConfig } from "@/lib/cloudinary-buckets";
import type { MediaType, VideoCategory } from "@/types";

/**
 * POST /api/video/finalize
 * Admin-only: Updates a processing video with Cloudinary's response data
 * and marks it as published. Called directly after client-side upload completes.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: {
    videoId?: string;
    publicId?: string;
    duration?: number;
    secureUrl?: string;
    title?: string;
    description?: string;
    category?: VideoCategory;
    mediaType?: MediaType;
    priceINR?: number;
    priceUSD?: number;
    isPremium?: boolean;
    storageBucket?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    videoId,
    publicId,
    duration,
    secureUrl,
    title,
    description,
    category,
    mediaType,
    priceINR,
    priceUSD,
    isPremium,
    storageBucket,
  } = body;

  if (!videoId || !publicId) {
    return Response.json(
      { error: "videoId and publicId are required" },
      { status: 400 }
    );
  }

  try {
    const videoRef = adminDb.collection("videos").doc(videoId);
    const resolvedStorageBucket = storageBucket || "bucket-1";
    const bucket = getBucketConfig(resolvedStorageBucket);

    const parsedPriceINR = Math.max(0, Number(priceINR) || 0);
    const parsedPriceUSD = Math.max(0, Number(priceUSD) || 0);
    const allowedCategories: VideoCategory[] = [
      "featured",
      "educational",
      "entertainment",
      "tutorial",
      "exclusive",
    ];
    const safeCategory = allowedCategories.includes(category as VideoCategory)
      ? (category as VideoCategory)
      : "featured";
    const safeMediaType: MediaType = mediaType === "image" ? "image" : "video";
    const encodedPublicId = encodeURIComponent(publicId).replace(/%2F/g, "/");
    const fallbackImageUrl = `https://res.cloudinary.com/${bucket.cloudName}/image/upload/${encodedPublicId}`;
    const resolvedSecureUrl =
      secureUrl || (safeMediaType === "image" ? fallbackImageUrl : "");

    // Images use their own secure URL as thumbnail; videos derive a frame image.
    const thumbnailUrl = safeMediaType === "image"
      ? resolvedSecureUrl
      : (resolvedSecureUrl
        ? resolvedSecureUrl.replace(/\.[^.]+$/, ".jpg")
        : "");

    await videoRef.set({
      videoId,
      title: (title || "").trim(),
      description: (description || "").trim(),
      category: safeCategory,
      mediaType: safeMediaType,
      priceINR: parsedPriceINR,
      priceUSD: parsedPriceUSD,
      isPremium: Boolean(isPremium),
      storageBucket: resolvedStorageBucket,
      cloudinaryPublicId: publicId,
      secureUrl: resolvedSecureUrl,
      thumbnailUrl,
      durationInSeconds:
        safeMediaType === "video" ? Math.round(Math.max(0, duration || 0)) : 0,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    return Response.json({ success: true, videoId });
  } catch (error: any) {
    console.error("Video finalization failed:", error);
    return Response.json(
      { error: "Failed to finalize video" },
      { status: 500 }
    );
  }
}
