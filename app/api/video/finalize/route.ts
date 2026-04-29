export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";
import { getBucketConfig } from "@/lib/cloudinary-buckets";
import type { MediaType, VideoCategory, VideoSegment } from "@/types";

/**
 * POST /api/video/finalize
 * Admin-only. Two modes:
 *
 * 1. Single-file  — existing behaviour, unchanged.
 * 2. Segmented    — body includes `isSegmented: true` and `segments[]`.
 *    All segments share the same videoId; their ordered metadata is stored
 *    in the Firestore document so the player can stream them sequentially.
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
    // Segmented-upload fields
    isSegmented?: boolean;
    segments?: VideoSegment[];
    totalDuration?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    videoId, publicId, duration, secureUrl,
    title, description, category, mediaType,
    priceINR, priceUSD, isPremium, storageBucket,
    isSegmented, segments, totalDuration,
  } = body;

  if (!videoId) {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const videoRef = adminDb.collection("videos").doc(videoId);
    const resolvedBucket  = storageBucket || "bucket-1";
    const bucket          = getBucketConfig(resolvedBucket);

    const parsedPriceINR  = Math.max(0, Number(priceINR) || 0);
    const parsedPriceUSD  = Math.max(0, Number(priceUSD) || 0);

    const allowedCategories: VideoCategory[] = [
      "featured", "educational", "entertainment", "tutorial", "exclusive",
    ];
    const safeCategory  = allowedCategories.includes(category as VideoCategory)
      ? (category as VideoCategory) : "featured";
    const safeMediaType: MediaType = mediaType === "image" ? "image" : "video";

    // ── Common fields shared by both modes ────────────────────────────────
    const common = {
      videoId,
      title:       (title || "").trim(),
      description: (description || "").trim(),
      category:    safeCategory,
      mediaType:   safeMediaType,
      priceINR:    parsedPriceINR,
      priceUSD:    parsedPriceUSD,
      isPremium:   Boolean(isPremium),
      storageBucket: resolvedBucket,
      status:      "published",
      createdAt:   new Date(),
      updatedAt:   new Date(),
    };

    // ── Mode 1: Segmented upload ──────────────────────────────────────────
    if (isSegmented && Array.isArray(segments) && segments.length > 0) {
      const safeSegments: VideoSegment[] = segments.map((s) => ({
        index:        Number(s.index),
        publicId:     String(s.publicId),
        duration:     Number(s.duration) || 0,
        storageBucket: s.storageBucket || resolvedBucket,
      }));

      const computedTotalDuration = totalDuration ||
        safeSegments.reduce((sum, s) => sum + s.duration, 0);

      // Derive thumbnail from the first segment's public_id
      const firstSegPubId  = safeSegments[0].publicId;
      const encodedPubId   = encodeURIComponent(firstSegPubId).replace(/%2F/g, "/");
      const thumbnailUrl   = `https://res.cloudinary.com/${bucket.cloudName}/video/upload/${encodedPubId}.jpg`;

      await videoRef.set({
        ...common,
        isSegmented:       true,
        segments:          safeSegments,
        totalDuration:     Math.round(computedTotalDuration),
        durationInSeconds: Math.round(computedTotalDuration),
        // Keep first segment's public_id as primary (used for thumbnail)
        cloudinaryPublicId: firstSegPubId,
        secureUrl:         "",     // not meaningful for segmented videos
        thumbnailUrl,
      }, { merge: true });

      return Response.json({ success: true, videoId, segments: safeSegments.length });
    }

    // ── Mode 2: Single-file upload (unchanged behaviour) ──────────────────
    if (!publicId) {
      return Response.json(
        { error: "publicId is required for single-file uploads" }, { status: 400 }
      );
    }

    const encodedPublicId  = encodeURIComponent(publicId).replace(/%2F/g, "/");
    const fallbackImageUrl = `https://res.cloudinary.com/${bucket.cloudName}/image/upload/${encodedPublicId}`;
    const resolvedSecureUrl = secureUrl || (safeMediaType === "image" ? fallbackImageUrl : "");

    const thumbnailUrl = safeMediaType === "image"
      ? resolvedSecureUrl
      : (resolvedSecureUrl ? resolvedSecureUrl.replace(/\.[^.]+$/, ".jpg") : "");

    await videoRef.set({
      ...common,
      isSegmented:        false,
      cloudinaryPublicId: publicId,
      secureUrl:          resolvedSecureUrl,
      thumbnailUrl,
      durationInSeconds:  safeMediaType === "video" ? Math.round(Math.max(0, duration || 0)) : 0,
    }, { merge: true });

    return Response.json({ success: true, videoId });
  } catch (error: any) {
    console.error("Video finalization failed:", error);
    return Response.json({ error: "Failed to finalize video" }, { status: 500 });
  }
}
