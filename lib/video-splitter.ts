"use client";

/**
 * lib/video-splitter.ts
 *
 * Public entry point for video splitting.
 *
 * Routing logic:
 *  • File ≤ 95 MB        → return as-is (no split needed)
 *  • Mobile + MP4/MOV    → MP4Box.js streaming splitter (supports 5 GB, ~30 MB RAM)
 *  • Everything else     → ffmpeg.wasm splitter (desktop, MKV/AVI/WebM)
 *
 * Re-exports all shared types and constants for backward compatibility
 * with existing callers (upload/page.tsx, etc.).
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util"; // toBlobURL removed — files self-hosted in /public/ffmpeg/

// ── Shared types / constants / helpers (re-exported for callers) ──────────────
export {
  SPLIT_THRESHOLD,
  SEGMENT_TARGET,
  MAX_SPLITTABLE,
  MAX_SPLITTABLE_MOBILE,
  getVideoDuration,
  isMobileDevice,
  isMp4Compatible,
  type SplitSegment,
  type SplitPhase,
  type SplitProgress,
} from "./video-splitter-shared";

import {
  SPLIT_THRESHOLD,
  SEGMENT_TARGET,
  MAX_SPLITTABLE,
  MAX_SPLITTABLE_MOBILE,
  getVideoDuration,
  isMobileDevice,
  isMp4Compatible,
} from "./video-splitter-shared";

import { splitVideoFileMobile } from "./mp4box-splitter";
import type { SplitSegment, SplitProgress } from "./video-splitter-shared";

// ─── ffmpeg.wasm setup ────────────────────────────────────────────────────────
// Files are self-hosted in /public/ffmpeg/ (downloaded by scripts/download-ffmpeg.mjs).
// Same-origin paths eliminate blob URL revocation (ERR_FILE_NOT_FOUND),
// CORS preflight, and COEP require-corp blocking entirely.
const FFMPEG_CORE_JS   = "/ffmpeg/ffmpeg-core.js";
const FFMPEG_CORE_WASM = "/ffmpeg/ffmpeg-core.wasm";

// Store on globalThis so the singleton survives Next.js HMR module resets.
// Without this, each hot reload creates a new FFmpeg instance causing
// duplicate initialisation and stale blob URL errors in development.
const G = globalThis as Record<string, unknown>;

async function getFFmpeg(): Promise<FFmpeg> {
  if (G.__ffmpeg_instance__ && G.__ffmpeg_loaded__) {
    return G.__ffmpeg_instance__ as FFmpeg;
  }
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL: FFMPEG_CORE_JS, wasmURL: FFMPEG_CORE_WASM });
  G.__ffmpeg_instance__ = ffmpeg;
  G.__ffmpeg_loaded__   = true;
  return ffmpeg;
}

// ─── ffmpeg.wasm helpers ──────────────────────────────────────────────────────

function fileExt(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "mp4";
}

function isMov(file: File): boolean {
  const ext  = fileExt(file);
  const mime = file.type.toLowerCase();
  if (ext === "mov" || ext === "heif" || ext === "heic") return true;
  if (mime === "video/quicktime" || mime === "video/x-quicktime") return true;
  if (mime.includes("quicktime")) return true;
  return false;
}

function toTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

// ─── ffmpeg.wasm splitter (desktop / unsupported formats) ────────────────────

async function splitVideoFileFFmpeg(
  file: File,
  onProgress?: (p: SplitProgress) => void,
): Promise<SplitSegment[]> {
  const totalDuration = await getVideoDuration(file);
  if (!isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error("Cannot determine video duration. The file may be corrupted or unsupported.");
  }

  const bytesPerSec    = file.size / totalDuration;
  const segDurationSec = Math.floor(SEGMENT_TARGET / bytesPerSec);
  const totalSegments  = Math.ceil(totalDuration / segDurationSec);

  onProgress?.({ phase: "loading", segmentsDone: 0, totalSegments, message: "Loading video processing engine…" });

  const ffmpeg    = await getFFmpeg();
  const movInput  = isMov(file);
  const inputName = movInput ? "input.mov" : "input.mp4";
  const extraArgs = movInput ? ["-tag:v", "hvc1"] : [];

  onProgress?.({ phase: "splitting", segmentsDone: 0, totalSegments, message: "Preparing video file…" });
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const segments: SplitSegment[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const startSec = i * segDurationSec;
    const durSec   = i < totalSegments - 1 ? segDurationSec : totalDuration - startSec;

    onProgress?.({ phase: "splitting", segmentsDone: i, totalSegments, message: `Processing segment ${i + 1} of ${totalSegments}…` });

    const outName = `seg_${String(i).padStart(4, "0")}.mp4`;
    await ffmpeg.exec([
      "-ss", toTimestamp(startSec),
      "-i",  inputName,
      "-t",  toTimestamp(durSec),
      "-c",  "copy",
      ...extraArgs,
      "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart",
      "-y", outName,
    ]);

    onProgress?.({ phase: "reading", segmentsDone: i, totalSegments, message: `Reading segment ${i + 1}…` });

    const data = await ffmpeg.readFile(outName) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([data], { type: "video/mp4" });
    const actualDuration = await getVideoDuration(blob) || durSec;

    segments.push({ index: i, blob, duration: actualDuration, sizeBytes: blob.size });
    try { await ffmpeg.deleteFile(outName); } catch { /* ignore */ }
  }

  try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }

  if (segments.length === 0) {
    throw new Error("Video splitting produced no output. Please check the file format.");
  }
  return segments;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split a video File into ≤90 MB segments.
 *
 * Routing:
 *  1. File ≤ 95 MB           → return as-is (no split needed)
 *  2. MP4 / MOV / M4V / HEIF → MP4Box.js streaming splitter
 *                               Works on BOTH mobile AND desktop.
 *                               No SharedArrayBuffer, no WASM heap, no COEP needed.
 *                               Supports up to 5 GB.
 *  3. MKV / AVI / WebM       → ffmpeg.wasm (desktop only, up to 3 GB)
 *                               Requires cross-origin isolation (COEP).
 */
export async function splitVideoFile(
  file: File,
  onProgress?: (p: SplitProgress) => void,
  signal?: AbortSignal,
): Promise<SplitSegment[]> {

  // ── Small file: no split needed ──────────────────────────────────────────
  if (file.size <= SPLIT_THRESHOLD) {
    const duration = await getVideoDuration(file);
    return [{ index: 0, blob: file, duration, sizeBytes: file.size }];
  }

  const mobile = isMobileDevice();

  // ── MP4 / MOV / M4V / HEIF — use MP4Box.js on ALL devices ───────────────
  // MP4Box reads in 8 MB chunks: peak RAM ~30 MB, supports up to 5 GB.
  // No SharedArrayBuffer required — works without any COOP/COEP headers.
  if (isMp4Compatible(file)) {
    if (file.size > MAX_SPLITTABLE_MOBILE) {
      throw new Error(
        `File is too large (max 5 GB, got ${(file.size / 1e9).toFixed(1)} GB). ` +
        `Please trim the video or compress it before uploading.`
      );
    }
    return splitVideoFileMobile(file, onProgress, signal);
  }

  // ── Non-MP4 formats (MKV, AVI, WebM) — ffmpeg.wasm, desktop only ────────
  if (mobile) {
    throw new Error(
      "MKV, AVI, and WebM files are not supported on mobile. " +
      "Please convert to MP4 first, then upload."
    );
  }

  if (file.size > MAX_SPLITTABLE) {
    throw new Error(
      `File is too large for desktop upload (max 3 GB, got ${(file.size / 1e9).toFixed(1)} GB).`
    );
  }

  return splitVideoFileFFmpeg(file, onProgress);
}

