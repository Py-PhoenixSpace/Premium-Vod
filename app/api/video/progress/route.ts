export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/auth-guards";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/video/progress
 * Saves watch progress to users/{uid}/watchHistory/{videoId}.
 * Called every ~10 seconds by the video player.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { videoId?: string; timestamp?: number; isCompleted?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { videoId, timestamp, isCompleted } = body;

  if (!videoId || timestamp === undefined || timestamp === null) {
    return Response.json(
      { error: "videoId and timestamp are required" },
      { status: 400 }
    );
  }

  if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp < 0) {
    return Response.json(
      { error: "timestamp must be a non-negative number" },
      { status: 400 }
    );
  }

  try {
    await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("watchHistory")
      .doc(videoId)
      .set(
        {
          videoId,
          lastTimestamp: Math.round(timestamp),
          isCompleted: isCompleted === true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Progress save failed:", error);
    return Response.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
