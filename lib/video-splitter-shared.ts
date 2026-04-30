/**
 * lib/video-splitter-shared.ts
 *
 * Shared constants, types, and helpers used by both
 * video-splitter.ts (ffmpeg.wasm) and mp4box-splitter.ts (MP4Box.js).
 */

// ─── Constants ─────────────────────────────────────────────────────────────
export const SPLIT_THRESHOLD       = 95  * 1024 * 1024; // 95 MB
export const SEGMENT_TARGET        = 90  * 1024 * 1024; // 90 MB per segment
export const MAX_SPLITTABLE        = 3   * 1024 * 1024 * 1024; // 3 GB  (ffmpeg.wasm — MKV/AVI/WebM on desktop only)
export const MAX_SPLITTABLE_MOBILE = 20  * 1024 * 1024 * 1024; // 20 GB (MP4Box parse-then-slice — RAM peak ~90 MB regardless of file size)

// ─── Types ──────────────────────────────────────────────────────────────────
export interface SplitSegment {
  index:    number;
  blob:     Blob;
  duration: number; // seconds (may be 0 if metadata unreadable)
  sizeBytes: number;
}

export type SplitPhase = "loading" | "splitting" | "reading";

export interface SplitProgress {
  phase:         SplitPhase;
  segmentsDone:  number;
  totalSegments: number;
  message:       string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read video duration via a temporary <video> element — no WASM needed. */
export function getVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => { cleanup(); resolve(video.duration); };
    video.onerror          = () => { cleanup(); resolve(0); };
    video.src = url;
  });
}

/** Returns true on iOS Safari and Android browsers. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    /Android/i.test(navigator.userAgent);
}

/**
 * Returns true if the file is an MP4-compatible container
 * that MP4Box.js can parse (MP4, MOV, M4V, HEIF, HEIC).
 * MKV, AVI, WebM are NOT supported — fall back to ffmpeg.wasm.
 */
export function isMp4Compatible(file: File): boolean {
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();
  const mp4Exts  = ["mp4", "m4v", "mov", "heif", "heic", "m4a"];
  const mp4Mimes = ["video/mp4", "video/quicktime", "video/x-quicktime", "video/x-m4v"];
  return mp4Exts.includes(ext) || mp4Mimes.some(m => mime.startsWith(m));
}
