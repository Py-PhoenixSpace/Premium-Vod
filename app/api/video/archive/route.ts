export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";

/**
 * POST /api/video/archive
 * Admin-only: toggles a video between "published" and "archived" status.
 * Server-side route to replace the insecure direct Firestore write
 * that was previously done client-side in the admin videos page.
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
  if (!videoId || typeof videoId !== "string") {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const videoRef = adminDb.collection("videos").doc(videoId);
    const videoDoc = await videoRef.get();

    if (!videoDoc.exists) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const currentStatus = videoDoc.data()!.status;

    // Only allow toggling between published and archived
    if (currentStatus !== "published" && currentStatus !== "archived") {
      return Response.json(
        {
          error: `Cannot archive a video with status "${currentStatus}". Only published videos can be archived.`,
        },
        { status: 400 }
      );
    }

    const newStatus = currentStatus === "archived" ? "published" : "archived";
    await videoRef.update({ status: newStatus });

    return Response.json({ success: true, videoId, status: newStatus });
  } catch (error: any) {
    console.error("Video archive toggle failed:", error);
    return Response.json(
      { error: "Failed to update video status" },
      { status: 500 }
    );
  }
}
