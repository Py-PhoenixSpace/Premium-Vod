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
  // COOP/COEP headers for ffmpeg.wasm are handled by middleware.ts instead.
  turbopack: {},
};

export default nextConfig;
