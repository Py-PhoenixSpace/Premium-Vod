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
          { key: "Cross-Origin-Embedder-Policy",  value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
