export const dynamic = "force-dynamic";

import { adminDb } from "@/lib/firebase-admin";
import {
  DEFAULT_SOCIAL_LINKS,
  normalizeSocialLinks,
  SOCIAL_LINKS_SETTINGS_COLLECTION,
  SOCIAL_LINKS_SETTINGS_DOC_ID,
} from "@/lib/social-links";

export async function GET() {
  try {
    const snapshot = await adminDb
      .collection(SOCIAL_LINKS_SETTINGS_COLLECTION)
      .doc(SOCIAL_LINKS_SETTINGS_DOC_ID)
      .get();

    const links = normalizeSocialLinks(snapshot.data() || {});

    return Response.json(
      {
        links,
        source: snapshot.exists ? "firestore" : "defaults",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Public social links fallback to defaults:", error);

    return Response.json(
      {
        links: DEFAULT_SOCIAL_LINKS,
        source: "defaults",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
