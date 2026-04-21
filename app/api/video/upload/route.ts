export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { getBucketConfig, signUploadRequest } from "@/lib/cloudinary-buckets";
import type { MediaType } from "@/types";

/**
 * POST /api/video/upload
 * Admin-only: generates a Cloudinary signed upload signature for direct
 * client→Cloudinary upload. Uses signUploadRequest() which is concurrency-safe
 * and never mutates the global Cloudinary SDK config.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { storageBucket, mediaType } = body;

  try {
    const safeMediaType: MediaType = mediaType === "image" ? "image" : "video";
    const bucket = getBucketConfig(storageBucket);
    const folder = safeMediaType === "image" ? "premiumvod/images" : "premiumvod/videos";
    const videoId = crypto.randomUUID();

    const paramsToSign: Record<string, string | number> = {
      folder,
      public_id: videoId,
      overwrite: "false",
      invalidate: "false",
    };

    const enableEager =
      safeMediaType === "video" &&
      process.env.CLOUDINARY_ENABLE_EAGER_UPLOAD === "true";
    if (enableEager) {
      paramsToSign.eager = "sp_auto/m3u8";
      paramsToSign.eager_async = "true";

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        paramsToSign.eager_notification_url = `${appUrl}/api/video/webhook`;
      }
    }

    // signUploadRequest is fully concurrency-safe — no global config mutation
    const { signature, apiKey, cloudName, timestamp } = signUploadRequest(
      paramsToSign,
      bucket.id
    );

    return Response.json({
      signature,
      timestamp,
      folder,
      publicId: videoId,
      mediaType: safeMediaType,
      cloudName,
      apiKey,
      videoId,
      storageBucket: bucket.id,
      eager: paramsToSign.eager,
      eagerAsync: paramsToSign.eager_async,
      notificationUrl: paramsToSign.eager_notification_url,
    });
  } catch (error: any) {
    console.error("Upload signature generation failed:", error);
    return Response.json(
      { error: "Failed to generate upload signature" },
      { status: 500 }
    );
  }
}
