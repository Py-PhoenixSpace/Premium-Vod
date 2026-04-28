export const dynamic = "force-dynamic";
// Allow up to 5 minutes for large chunk transfers (adjust per your host)
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";

/**
 * POST /api/video/chunk-proxy
 *
 * Admin-only server-side proxy for Cloudinary chunked uploads.
 * The browser POSTs each chunk here (same-origin → no CORS) and this route
 * streams it straight to Cloudinary (server-to-server → no CORS).
 *
 * Required proxy headers from the client:
 *   x-cld-cloud-name     – Cloudinary cloud name
 *   x-cld-resource-type  – "video" | "image"
 *   x-cld-upload-id      – UUID that ties all chunks of one upload together
 *   x-cld-content-range  – e.g. "bytes 0-5242879/1073741824"
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cloudName    = request.headers.get("x-cld-cloud-name");
  const resourceType = request.headers.get("x-cld-resource-type") || "video";
  const uploadId     = request.headers.get("x-cld-upload-id");
  const contentRange = request.headers.get("x-cld-content-range");
  // Forward the multipart boundary from the browser's Content-Type
  const contentType  = request.headers.get("content-type") || "";

  if (!cloudName || !uploadId || !contentRange) {
    return Response.json(
      { error: "Missing headers: x-cld-cloud-name, x-cld-upload-id, x-cld-content-range" },
      { status: 400 }
    );
  }

  const cloudinaryUrl =
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  try {
    // Stream the multipart body straight to Cloudinary — nothing is buffered in memory
    const cldRes = await (fetch as any)(cloudinaryUrl, {
      method: "POST",
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range":      contentRange,
        "Content-Type":       contentType,
      },
      body:   request.body,   // ReadableStream — no memory copy
      duplex: "half",         // Required for Node 18+ streaming request bodies
    });

    const text = await cldRes.text();
    return new Response(text, {
      status: cldRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[chunk-proxy] Error forwarding to Cloudinary:", err);
    return Response.json(
      { error: "Proxy upload failed", detail: err.message },
      { status: 502 }
    );
  }
}
