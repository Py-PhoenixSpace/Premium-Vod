import { v2 as cloudinary } from "cloudinary";

export interface BucketConfig {
  id: string;
  label: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Registry of all Cloudinary storage buckets.
 *
 * Buckets are auto-discovered from numbered environment variables:
 *   CLOUDINARY_CLOUD_NAME_1, CLOUDINARY_API_KEY_1, CLOUDINARY_API_SECRET_1
 *   CLOUDINARY_CLOUD_NAME_2, CLOUDINARY_API_KEY_2, CLOUDINARY_API_SECRET_2
 *   CLOUDINARY_CLOUD_NAME_3, CLOUDINARY_API_KEY_3, CLOUDINARY_API_SECRET_3
 *   ... and so on, indefinitely.
 *
 * To add Bucket N: add the three env vars above — zero code changes required.
 * Scanning stops at the first missing CLOUDINARY_CLOUD_NAME_N.
 */
export function getAllBuckets(): BucketConfig[] {
  const buckets: BucketConfig[] = [];

  // Human-readable labels for well-known bucket numbers
  const LABELS: Record<number, string> = {
    1: "Primary Storage",
    2: "Secondary Storage",
    3: "Tertiary Storage",
  };

  // Dynamic scan: auto-discover bucket-1, bucket-2, bucket-3 … bucket-N
  let i = 1;
  while (process.env[`CLOUDINARY_CLOUD_NAME_${i}`]) {
    buckets.push({
      id: `bucket-${i}`,
      label: LABELS[i] ?? `Storage Bucket ${i}`,
      cloudName: process.env[`CLOUDINARY_CLOUD_NAME_${i}`]!,
      apiKey: process.env[`CLOUDINARY_API_KEY_${i}`]!,
      apiSecret: process.env[`CLOUDINARY_API_SECRET_${i}`]!,
    });
    i++;
  }

  // Fallback: if no numbered buckets found, use legacy bare env vars
  if (buckets.length === 0 && process.env.CLOUDINARY_CLOUD_NAME) {
    buckets.push({
      id: "bucket-1",
      label: "Primary Storage",
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      apiSecret: process.env.CLOUDINARY_API_SECRET!,
    });
  }

  return buckets;
}

/**
 * Get a specific bucket's config by ID.
 * Falls back to bucket-1 if not found.
 */
export function getBucketConfig(bucketId?: string): BucketConfig {
  const buckets = getAllBuckets();
  if (!buckets.length) {
    throw new Error(
      "No Cloudinary buckets configured. Set CLOUDINARY_CLOUD_NAME_1 in your environment."
    );
  }
  if (!bucketId) return buckets[0];
  return buckets.find((b) => b.id === bucketId) || buckets[0];
}

/**
 * Returns a Cloudinary SDK instance isolated to a specific bucket.
 *
 * IMPORTANT: The Cloudinary v2 SDK does NOT support true instance cloning —
 * `cloudinary.clone()` is not available in the Node SDK. Instead, we use the
 * module-level singleton but re-configure it atomically before every call and
 * only use it sequentially (enforced by the storage API route). For URL signing
 * (a pure CPU operation), we use `cloudinary.utils.api_sign_request` directly
 * with the bucket's own apiSecret, which is fully thread-safe.
 *
 * For all async Cloudinary Admin API calls (upload, destroy, usage) that must
 * use the singleton, callers must ensure sequential execution — see
 * `/api/admin/storage/route.ts` for the sequential pattern.
 */
export function getCloudinaryInstance(bucketId?: string) {
  const bucket = getBucketConfig(bucketId);

  cloudinary.config({
    cloud_name: bucket.cloudName,
    api_key: bucket.apiKey,
    api_secret: bucket.apiSecret,
    secure: true,
  });

  return cloudinary;
}

/**
 * Generates a Cloudinary upload signature for a given bucket WITHOUT touching
 * the singleton's global config. Fully concurrency-safe.
 */
export function signUploadRequest(
  paramsToSign: Record<string, string | number>,
  bucketId?: string
): { signature: string; apiKey: string; cloudName: string; timestamp: number } {
  const bucket = getBucketConfig(bucketId);
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { ...paramsToSign, timestamp },
    bucket.apiSecret
  );

  return {
    signature,
    apiKey: bucket.apiKey,
    cloudName: bucket.cloudName,
    timestamp,
  };
}

/**
 * Fetch storage usage for a single bucket via Cloudinary Admin API.
 * Must be called sequentially — see note on getCloudinaryInstance above.
 */
export async function getBucketUsage(bucket: BucketConfig) {
  cloudinary.config({
    cloud_name: bucket.cloudName,
    api_key: bucket.apiKey,
    api_secret: bucket.apiSecret,
    secure: true,
  });

  try {
    const usage = await cloudinary.api.usage();

    const usedBytes = usage?.storage?.usage ?? 0;
    const totalCredits = usage?.credits?.limit ?? 0;

    const usedGB = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(2));
    const limitGB = Number(totalCredits);

    const percent =
      limitGB > 0 ? Number(((usedGB / limitGB) * 100).toFixed(1)) : 0;

    return {
      id: bucket.id,
      label: bucket.label,
      cloudName: bucket.cloudName,
      usedGB,
      limitGB,
      percent,
      plan: usage?.plan || "Free",
    };
  } catch (error) {
    console.error(`Failed to fetch usage for ${bucket.label}:`, error);
    return {
      id: bucket.id,
      label: bucket.label,
      cloudName: bucket.cloudName,
      usedGB: 0,
      limitGB: 0,
      percent: 0,
      error: "Failed to fetch usage",
    };
  }
}

/**
 * Verifies a Cloudinary webhook notification signature.
 * Call this at the top of /api/video/webhook to prevent spoofed callbacks.
 *
 * @param body - The raw request body string
 * @param signature - The X-Cld-Signature header value
 * @param timestamp - The X-Cld-Timestamp header value
 * @param bucketId - Optional bucket to use for verification (defaults to bucket-1)
 */
export function verifyCloudinaryWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  bucketId?: string
): boolean {
  const bucket = getBucketConfig(bucketId);
  try {
    // Cloudinary signs: SHA1(body + timestamp + api_secret)
    const { createHash } = require("crypto") as typeof import("crypto");
    const expectedSig = createHash("sha1")
      .update(body + timestamp + bucket.apiSecret)
      .digest("hex");
    return expectedSig === signature;
  } catch {
    return false;
  }
}
