export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/auth-guards";
import {
  DEFAULT_SOCIAL_LINKS,
  normalizeSocialLinks,
  socialLinksSchema,
  SOCIAL_LINKS_SETTINGS_COLLECTION,
  SOCIAL_LINKS_SETTINGS_DOC_ID,
} from "@/lib/social-links";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const ref = adminDb
      .collection(SOCIAL_LINKS_SETTINGS_COLLECTION)
      .doc(SOCIAL_LINKS_SETTINGS_DOC_ID);
    const snapshot = await ref.get();
    const raw = snapshot.data() || {};

    const links = normalizeSocialLinks(raw);
    const updatedAt =
      raw.updatedAt && typeof raw.updatedAt.toDate === "function"
        ? raw.updatedAt.toDate().toISOString()
        : null;

    return Response.json({
      links,
      meta: {
        updatedAt,
        updatedBy: raw.updatedBy || null,
        updatedByRole: raw.updatedByRole || null,
        version: Number(raw.version || 0),
      },
    });
  } catch (error) {
    console.error("Failed to load social links settings:", error);
    return Response.json(
      {
        links: DEFAULT_SOCIAL_LINKS,
        meta: {
          updatedAt: null,
          updatedBy: null,
          updatedByRole: null,
          version: 0,
        },
      },
      { status: 200 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = socialLinksSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid social links payload",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 }
    );
  }

  try {
    const ref = adminDb
      .collection(SOCIAL_LINKS_SETTINGS_COLLECTION)
      .doc(SOCIAL_LINKS_SETTINGS_DOC_ID);

    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const currentVersion = Number(existing.data()?.version || 0);

      tx.set(
        ref,
        {
          ...parsed.data,
          version: currentVersion + 1,
          updatedBy: auth.uid,
          updatedByRole: auth.role,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    const updated = await ref.get();
    const raw = updated.data() || {};

    return Response.json({
      success: true,
      links: normalizeSocialLinks(raw),
      meta: {
        updatedAt:
          raw.updatedAt && typeof raw.updatedAt.toDate === "function"
            ? raw.updatedAt.toDate().toISOString()
            : null,
        updatedBy: raw.updatedBy || auth.uid,
        updatedByRole: raw.updatedByRole || auth.role,
        version: Number(raw.version || 1),
      },
    });
  } catch (error) {
    console.error("Failed to update social links settings:", error);
    return Response.json(
      { error: "Failed to update social links" },
      { status: 500 }
    );
  }
}
