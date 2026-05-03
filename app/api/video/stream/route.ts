export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { getCloudinaryInstance } from "@/lib/cloudinary-buckets";
import type { MediaType, UserSubscription } from "@/types";
import { isSubscriptionValid } from "@/lib/subscription-utils";

// ── Quality tier definitions ────────────────────────────────────────────────
// Each tier is a Cloudinary transformation that caps resolution + bitrate
// and uses perceptual quality optimisation (q_auto:good).
// "limit" crop: never upscales — only downscales if source is larger.
// Cloudinary caches each (publicId + transformation) combination, so the
// first viewer of a new tier pays a ~2-5s transcode delay; every subsequent
// play is served from the CDN cache instantly.
interface QualityTier {
  label:         string;
  width:         number;
  height:        number;
  videoBitRate:  string; // video-only bitrate cap (audio is budgeted separately)
  audioBitRate:  string; // audio bitrate — always preserved; never squeezed by video cap
  quality:       string;
}

const QUALITY_TIERS: Record<string, QualityTier> = {
  low: {
    // 480p — very old Android phones, 2G/3G networks
    label: "480p",
    width: 854, height: 480,
    // BUG 4 FIX: Previously a single `bit_rate: "1200k"` was used as a combined
    // video+audio budget. At 480p the video alone can consume the full budget,
    // causing Cloudinary to silently drop the audio stream. Splitting into
    // separate videoBitRate + audioBitRate guarantees audio is always included.
    videoBitRate: "900k",
    audioBitRate: "96k",
    quality: "auto:eco",
  },
  medium: {
    // 720p — default for most mobile + average networks
    label: "720p",
    width: 1280, height: 720,
    videoBitRate: "2000k",
    audioBitRate: "128k",
    quality: "auto:good",
  },
  high: {
    // 1080p — desktop, large screens, fast connections
    label: "1080p",
    width: 1920, height: 1080,
    videoBitRate: "4000k",
    audioBitRate: "192k",
    quality: "auto:good",
  },
};

/**
 * Determine quality tier from User-Agent + explicit `quality` query param.
 * Priority: explicit param > UA heuristics.
 */
function resolveQualityTier(ua: string, qualityHint?: string | null): QualityTier {
  if (qualityHint && QUALITY_TIERS[qualityHint]) return QUALITY_TIERS[qualityHint];

  // UA-based heuristics as fallback
  const isMobile     = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isOldAndroid = /Android [2-7]\./i.test(ua);

  if (isOldAndroid) return QUALITY_TIERS.low;
  if (isMobile)     return QUALITY_TIERS.medium;
  return                   QUALITY_TIERS.high;
}

/**
 * GET /api/video/stream?id=videoId&quality=low|medium|high
 *
 * Validates user access and returns:
 * - Single-file video: one signed Cloudinary HLS URL
 * - Segmented video:   array of signed, quality-optimised URLs (one per segment)
 *
 * The `quality` param is optional. If omitted, quality is inferred from the
 * User-Agent header. The client (SegmentedVideoPlayer) should detect the
 * device's network/screen and pass the appropriate hint.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const videoId     = searchParams.get("id");
  const qualityHint = searchParams.get("quality"); // low | medium | high | null

  if (!videoId) {
    return Response.json({ error: "Content ID required" }, { status: 400 });
  }

  const ua   = request.headers.get("user-agent") || "";
  const tier = resolveQualityTier(ua, qualityHint);

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
      qualityLabel:    tier.label,           // e.g. "720p" — for UI display
      expiresAt:       Math.floor(Date.now() / 1000) + 2 * 60 * 60,
    };

    // ── Mode A: Segmented video ──────────────────────────────────────────
    if (video.isSegmented && Array.isArray(video.segments) && video.segments.length > 0) {
      const segmentUrls = video.segments.map((seg: any) => {
        const cld = getCloudinaryInstance(seg.storageBucket);

        // Transformation chain:
        // Layer 1: transcode video+audio to universal codecs, cap resolution + quality
        //          video_bit_rate caps video-only — audio budget is separate (Bug 4 fix)
        // Layer 2: explicit audio codec + frequency to prevent Cloudinary dropping
        //          the audio stream when the video bitrate cap is very tight.
        //
        // BUG 4 FIX: The old single `bit_rate` param was a combined video+audio
        // budget. For low quality (480p / 900k total) Cloudinary silently dropped
        // the entire audio stream to fit within the cap. Splitting into per-stream
        // bitrates with `video_bit_rate` guarantees audio is always preserved.
        //
        // Cloudinary caches each (publicId × transformation) pair on first access.
        const url = cld.url(seg.publicId, {
          resource_type:  "video",
          type:           "upload",
          sign_url:       true,
          secure:         true,
          transformation: [
            {
              // Layer 1 — video transcode
              video_codec:     "h264",
              audio_codec:     "aac",
              width:            tier.width,
              height:           tier.height,
              crop:             "limit",            // never upscale
              quality:          tier.quality,        // perceptual optimisation
              video_bit_rate:   tier.videoBitRate,   // video-only cap (audio NOT included)
            },
            {
              // Layer 2 — lock audio so it is never squeezed out by the video cap
              audio_codec:      "aac",
              audio_frequency:  44100,
            },
          ],
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

    // ── Mode B: Single-file video ────────────────────────────────────────
    const cld      = getCloudinaryInstance(video.storageBucket);
    const imageUrl = video.secureUrl || video.thumbnailUrl ||
      cld.url(video.cloudinaryPublicId, { resource_type: "image", type: "upload", secure: true });

    // HLS with explicit streaming profile.
    // "full_hd" generates: 240p, 360p, 480p, 720p, 1080p variants.
    // The browser's ABR algorithm (via hls.js in CldVideoPlayer) auto-selects
    // the appropriate variant based on available bandwidth.
    // "auto" was unpredictable — "full_hd" gives a controlled, complete ladder.
    const signedUrl = mediaType === "image"
      ? imageUrl
      : cld.url(video.cloudinaryPublicId, {
          resource_type:     "video",
          format:            "m3u8",
          type:              "authenticated",
          sign_url:          true,
          secure:            true,
          streaming_profile: "full_hd",    // was: "auto"
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

