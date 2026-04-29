"use client";

/**
 * lib/video-splitter.ts
 *
 * Browser-side video splitting using ffmpeg.wasm.
 * Splits large video files into ≤90 MB MP4 segments using stream copy
 * (no re-encoding — fast). Each segment is extracted one at a time so
 * WASM memory usage stays bounded to: input_file + one_segment at any
 * given moment.
 *
 * Limits:
 *  • Files ≤ SPLIT_THRESHOLD (95 MB) are returned as-is (no split needed)
 *  • Files > MAX_SPLITTABLE_SIZE (3 GB) exceed practical WASM memory limits
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ─── Constants ─────────────────────────────────────────────────────────────
export const SPLIT_THRESHOLD   = 95  * 1024 * 1024; // 95 MB — skip split below this
export const SEGMENT_TARGET    = 90  * 1024 * 1024; // 90 MB target per segment
export const MAX_SPLITTABLE    = 3   * 1024 * 1024 * 1024; // 3 GB WASM limit (desktop)
export const MAX_SPLITTABLE_MOBILE = 800 * 1024 * 1024; // 800 MB — iOS tab crash prevention

/** Returns the lowercase extension of a file, defaulting to "mp4". */
function fileExt(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "mp4";
}

/** Returns true if the file is a MOV/QuickTime container (iPhone camera). */
function isMov(file: File): boolean {
  return fileExt(file) === "mov" || file.type === "video/quicktime";
}

const FFMPEG_CORE_VERSION = "0.12.6";
const CDN = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

// ─── Types ──────────────────────────────────────────────────────────────────
export interface SplitSegment {
  index:    number;
  blob:     Blob;
  duration: number; // seconds, may be 0 if metadata unreadable
  sizeBytes: number;
}

export type SplitPhase = "loading" | "splitting" | "reading";

export interface SplitProgress {
  phase:          SplitPhase;
  segmentsDone:   number;
  totalSegments:  number;
  message:        string;
}

// ─── Singleton FFmpeg instance ───────────────────────────────────────────────
let _ffmpeg: FFmpeg | null = null;
let _loaded  = false;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_ffmpeg && _loaded) return _ffmpeg;
  _ffmpeg = new FFmpeg();
  if (onLog) _ffmpeg.on("log", ({ message }) => onLog(message));
  await _ffmpeg.load({
    coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`,   "text/javascript"),
    wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, "application/wasm"),
  });
  _loaded = true;
  return _ffmpeg;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read video duration via a temporary <video> element (no WASM needed). */
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

/** Convert seconds to "HH:MM:SS.mmm" for ffmpeg -ss / -t args. */
function toTimestamp(seconds: number): string {
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Split a video File into ≤90 MB segments.
 *
 * Returns a single-element array (the original file as a Blob) if the file is
 * below SPLIT_THRESHOLD — callers don't need to special-case this.
 */
export async function splitVideoFile(
  file: File,
  onProgress?: (p: SplitProgress) => void,
): Promise<SplitSegment[]> {

  // Small file — return as-is
  if (file.size <= SPLIT_THRESHOLD) {
    const duration = await getVideoDuration(file);
    return [{ index: 0, blob: file, duration, sizeBytes: file.size }];
  }

  // ── Get duration via <video> ────────────────────────────────────────────
  const totalDuration = await getVideoDuration(file);
  if (!isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error(
      "Cannot determine video duration. The file may be corrupted or in an unsupported format."
    );
  }

  // ── Calculate segment duration ──────────────────────────────────────────
  const bytesPerSec    = file.size / totalDuration;
  const segDurationSec = Math.floor(SEGMENT_TARGET / bytesPerSec);
  const totalSegments  = Math.ceil(totalDuration / segDurationSec);

  // ── Load ffmpeg.wasm ────────────────────────────────────────────────────
  onProgress?.({
    phase: "loading", segmentsDone: 0, totalSegments,
    message: "Loading video processing engine…",
  });

  const ffmpeg = await getFFmpeg();

  // Use the correct input filename so ffmpeg container detection works
  // (MOV files need to be named .mov for reliable demuxer selection)
  const movInput = isMov(file);
  const inputName = movInput ? "input.mov" : "input.mp4";

  // Write input once — stays in WASM virtual FS throughout
  onProgress?.({
    phase: "splitting", segmentsDone: 0, totalSegments,
    message: "Preparing video file…",
  });
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Extra args for HEVC/MOV inputs:
  // -tag:v hvc1 — makes HEVC segments recognised by QuickTime/iOS players
  // Without this, iPhone-recorded HEVC videos produce unplayable MP4 segments.
  const extraArgs = movInput ? ["-tag:v", "hvc1"] : [];

  // ── Extract segments one at a time ─────────────────────────────────────
  const segments: SplitSegment[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const startSec = i * segDurationSec;
    const durSec   = i < totalSegments - 1
      ? segDurationSec
      : totalDuration - startSec; // last segment: remainder

    onProgress?.({
      phase: "splitting", segmentsDone: i, totalSegments,
      message: `Processing segment ${i + 1} of ${totalSegments}…`,
    });

    const outName = `seg_${String(i).padStart(4, "0")}.mp4`;

    await ffmpeg.exec([
      "-ss", toTimestamp(startSec),     // seek BEFORE -i for fast seek
      "-i",  inputName,
      "-t",  toTimestamp(durSec),
      "-c",  "copy",                    // stream copy — no re-encode
      ...extraArgs,                     // HEVC tag for MOV sources
      "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart",
      "-y",
      outName,
    ]);

    // ── Read output ───────────────────────────────────────────────────────
    onProgress?.({
      phase: "reading", segmentsDone: i, totalSegments,
      message: `Reading segment ${i + 1}…`,
    });

    const data = await ffmpeg.readFile(outName) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([data], { type: "video/mp4" });

    // Try to get actual duration from the produced segment
    const actualDuration = await getVideoDuration(blob) || durSec;

    segments.push({
      index:     i,
      blob,
      duration:  actualDuration,
      sizeBytes: blob.size,
    });

    // Free segment from WASM virtual FS immediately to reclaim memory
    try { await ffmpeg.deleteFile(outName); } catch { /* ignore */ }
  }

  // Clean up input file from virtual FS
  try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }

  if (segments.length === 0) {
    throw new Error("Video splitting produced no output. Please check the file format.");
  }

  return segments;
}
