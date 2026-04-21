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
};

export default nextConfig;
