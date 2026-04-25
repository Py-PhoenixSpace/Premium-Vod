export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const ref = adminDb.collection("platformStats").doc("dashboardUI");
    const snapshot = await ref.get();
    const raw = snapshot.data() || {};

    return Response.json({
      imageUrl: raw.imageUrl || null,
    });
  } catch (error) {
    console.error("Failed to load dashboard UI settings:", error);
    return Response.json({ imageUrl: null }, { status: 200 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl } = body;

  try {
    const ref = adminDb.collection("platformStats").doc("dashboardUI");

    await ref.set(
      {
        imageUrl: imageUrl || null,
        updatedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return Response.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Failed to update dashboard UI settings:", error);
    return Response.json({ error: "Failed to update dashboard UI" }, { status: 500 });
  }
}
