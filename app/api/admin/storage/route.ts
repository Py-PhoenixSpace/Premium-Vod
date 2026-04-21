export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { getAllBuckets, getBucketUsage } from "@/lib/cloudinary-buckets";

/**
 * GET /api/admin/storage
 * Admin/super-admin: returns storage usage for all Cloudinary buckets.
 *
 * IMPORTANT: Fetched SEQUENTIALLY (not parallel) because the Cloudinary SDK
 * is a module-level singleton — running concurrent .config() calls corrupts
 * credentials. This is documented in lib/cloudinary-buckets.ts.
 */
export async function GET(_request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const buckets = getAllBuckets();
    const usageData: any[] = [];

    for (const bucket of buckets) {
      const usage = await getBucketUsage(bucket);
      usageData.push(usage);
    }

    return Response.json({ buckets: usageData });
  } catch (error: any) {
    console.error("Storage usage fetch failed:", error);
    return Response.json(
      { error: "Failed to fetch storage usage" },
      { status: 500 }
    );
  }
}
