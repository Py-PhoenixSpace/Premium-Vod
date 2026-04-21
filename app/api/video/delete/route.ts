export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";
import { getCloudinaryInstance } from "@/lib/cloudinary-buckets";

/**
 * POST /api/video/delete
 * Admin-only: Deletes a video from both Cloudinary and Firestore.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { videoId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { videoId } = body;
  if (!videoId) {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const videoRef = adminDb.collection("videos").doc(videoId);
    const videoDoc = await videoRef.get();

    if (!videoDoc.exists) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const video = videoDoc.data()!;
    const resourceType = video.mediaType === "image" ? "image" : "video";

    // Delete from Cloudinary if a public_id exists
    if (video.cloudinaryPublicId) {
      try {
        const cld = getCloudinaryInstance(video.storageBucket);
        await cld.uploader.destroy(video.cloudinaryPublicId, {
          resource_type: resourceType,
          invalidate: true,
        });
      } catch (cloudErr) {
        // Log but continue — Firestore record must still be cleaned up
        console.error(
          "Cloudinary delete failed (continuing with Firestore delete):",
          cloudErr
        );
      }
    }

    await videoRef.delete();

    return Response.json({ success: true, videoId });
  } catch (error: any) {
    console.error("Video deletion failed:", error);
    return Response.json(
      { error: "Failed to delete video" },
      { status: 500 }
    );
  }
}
