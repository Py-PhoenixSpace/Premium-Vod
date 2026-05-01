import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.94.182.188"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.CLOUDINARY_CLOUD_NAME_1 || process.env.CLOUDINARY_CLOUD_NAME || "",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Next.js 16 uses Turbopack by default — empty config silences the warning.
  turbopack: {},

  // Belt-and-suspenders COOP/COEP fallback for ffmpeg.wasm SharedArrayBuffer.
  // The primary source is middleware.ts; this static config ensures headers are
  // present even on edge deployments where middleware may be bypassed.
  async headers() {
    return [
      {
        source: "/admin/upload",
        headers: [
          { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy",  value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        // Premium video player pages — prevent caching and iframe embedding.
        // Cache-Control: no-store prevents the browser (and any CDN) from
        // caching the page, which could otherwise expose signed stream URLs.
        // X-Frame-Options + CSP frame-ancestors block the page being embedded
        // in an iframe scraper.
        source: "/watch/:id*",
        headers: [
          { key: "Cache-Control",    value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma",           value: "no-cache" },
          { key: "Expires",          value: "0" },
          { key: "X-Frame-Options",  value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options",  value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
