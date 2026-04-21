export const dynamic = "force-dynamic";

import { adminDb } from "@/lib/firebase-admin";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  normalizeSubscriptionPricing,
  PRICING_SETTINGS_COLLECTION,
  PRICING_SETTINGS_DOC_ID,
} from "@/lib/subscription-pricing";

export async function GET() {
  try {
    const snapshot = await adminDb
      .collection(PRICING_SETTINGS_COLLECTION)
      .doc(PRICING_SETTINGS_DOC_ID)
      .get();

    const pricing = normalizeSubscriptionPricing(snapshot.data() || {});

    return Response.json(
      {
        pricing,
        source: snapshot.exists ? "firestore" : "defaults",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Public pricing fallback to defaults:", error);

    return Response.json(
      {
        pricing: DEFAULT_SUBSCRIPTION_PRICING,
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
