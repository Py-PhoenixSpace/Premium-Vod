export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: {
    videoId?: string;
    title?: string;
    description?: string;
    category?: string;
    priceINR?: number;
    priceUSD?: number;
    isPremium?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { videoId, title, description, category, priceINR, priceUSD, isPremium } = body;

  if (!videoId || typeof videoId !== "string") {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const videoRef = adminDb.collection("videos").doc(videoId);
    const videoDoc = await videoRef.get();

    if (!videoDoc.exists) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (priceINR !== undefined) updates.priceINR = priceINR;
    if (priceUSD !== undefined) updates.priceUSD = priceUSD;
    if (isPremium !== undefined) updates.isPremium = isPremium;

    if (Object.keys(updates).length > 0) {
      await videoRef.update(updates);
    }

    return Response.json({ success: true, videoId, updates });
  } catch (error: any) {
    console.error("Video edit failed:", error);
    return Response.json(
      { error: "Failed to update video metadata" },
      { status: 500 }
    );
  }
}
