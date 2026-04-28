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
    // Expose primary cloud name to the client for next-cloudinary CldVideoPlayer
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.CLOUDINARY_CLOUD_NAME_1 || process.env.CLOUDINARY_CLOUD_NAME || "",
  },
  // Large files are uploaded directly from the browser to Cloudinary via XHR
  // (chunked, 100 MB per chunk). Only JSON metadata passes through Next.js
  // API routes. The limit below is a safety net for those small JSON payloads.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
