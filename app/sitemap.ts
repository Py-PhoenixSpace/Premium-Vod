import type { MetadataRoute } from "next";
import { adminDb } from "@/lib/firebase-admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://premiumvod.com";
  const now = new Date();

  // ── Static routes ─────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base,               lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/videos`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/login`,    lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // ── Dynamic video routes ──────────────────────────────────────────────────
  let videoRoutes: MetadataRoute.Sitemap = [];
  try {
    const snapshot = await adminDb
      .collection("videos")
      .where("status", "==", "published")
      .get();

    videoRoutes = snapshot.docs.map((doc) => {
      const data = doc.data();
      const modified =
        data.updatedAt?.toDate?.() ?? data.createdAt?.toDate?.() ?? now;
      return {
        url: `${base}/watch/${doc.id}`,
        lastModified: modified,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      };
    });
  } catch (err) {
    console.error("Sitemap: failed to fetch published videos:", err);
  }

  return [...staticRoutes, ...videoRoutes];
}
