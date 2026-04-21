import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://premiumvod.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/videos", "/watch/", "/login", "/register"],
        disallow: ["/dashboard/", "/admin/", "/super-admin/", "/api/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
