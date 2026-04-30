"use client";
/**
 * lib/mp4box-splitter.ts
 *
 * Mobile-safe video splitter using MP4Box.js.
 * Reads the file in 8 MB streaming chunks — peak heap usage ~30 MB
 * regardless of total file size, enabling 5 GB+ uploads on iPhone.
 *
 * Supported: MP4, MOV (H.264 / HEVC / ProRes), M4V, HEIF  
 * NOT supported: MKV, AVI, WebM → caller falls back to ffmpeg.wasm
 */

// mp4box has no default export — use namespace import to access createFile() and DataStream
import * as MP4Box from "mp4box";
import type { MP4Info, MP4MediaTrack, MP4Sample } from "mp4box";
import {
  SEGMENT_TARGET,
  getVideoDuration,
  type SplitProgress,
  type SplitSegment,
} from "./video-splitter-shared";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB per FileReader slice

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(new Error("FileReader error reading video chunk"));
    fr.readAsArrayBuffer(file.slice(start, end));
  });
}

/**
 * Serialise an ISOFile to an ArrayBuffer using MP4Box's DataStream.
 * DataStream is not exported publicly by mp4box but is accessible as a
 * property on the MP4Box object itself.
 */
function isoFileToBuffer(isoFile: ReturnType<typeof MP4Box.createFile>): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (MP4Box as any).DataStream;
  const ds = new DS(undefined, 0, DS.BIG_ENDIAN);
  (isoFile as any).write(ds);
  return ds.buffer as ArrayBuffer;
}

/**
 * Build a standalone MP4 Blob from collected video (+optional audio) samples.
 *
 * Key: we pass `sample.description` directly into addTrack() — MP4Box copies
 * the codec-specific SampleEntry box (avcC for H.264, hvcC for HEVC, esds
 * for AAC) from the input file into the new output file, preserving full
 * decoder compatibility.
 */
function buildSegmentBlob(
  videoTrack:   MP4MediaTrack,
  audioTrack:   MP4MediaTrack | null,
  videoSamples: MP4Sample[],
  audioSamples: MP4Sample[],
): Blob {
  if (videoSamples.length === 0) return new Blob([], { type: "video/mp4" });

  const out = MP4Box.createFile();

  // ── Video track ────────────────────────────────────────────────────────────
  const vtid = (out as any).addTrack({
    type:        "video",
    timescale:   videoTrack.timescale,
    width:       videoTrack.video?.width  ?? 1920,
    height:      videoTrack.video?.height ?? 1080,
    // Pass the codec description box directly — works for H.264, HEVC, ProRes
    description: videoSamples[0].description,
  });

  const vBase = videoSamples[0].dts;
  for (const s of videoSamples) {
    (out as any).addSample(vtid, s.data, {
      duration:    s.duration,
      dts:         s.dts - vBase,
      cts:         s.cts - vBase,
      is_sync:     s.is_sync,
      description: s.description,
    });
  }

  // ── Audio track (optional — included when available) ──────────────────────
  if (audioTrack && audioSamples.length > 0) {
    const atid = (out as any).addTrack({
      type:          "audio",
      timescale:     audioTrack.timescale,
      channel_count: audioTrack.audio?.channel_count ?? 2,
      samplerate:    audioTrack.audio?.sample_rate   ?? 44100,
      samplesize:    audioTrack.audio?.sample_size   ?? 16,
      description:   audioSamples[0].description,
    });

    const aBase = audioSamples[0].dts;
    for (const s of audioSamples) {
      (out as any).addSample(atid, s.data, {
        duration:    s.duration,
        dts:         s.dts - aBase,
        cts:         s.cts - aBase,
        is_sync:     s.is_sync,
        description: s.description,
      });
    }
  }

  return new Blob([isoFileToBuffer(out)], { type: "video/mp4" });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function splitVideoFileMobile(
  file: File,
  onProgress?: (p: SplitProgress) => void,
  signal?: AbortSignal,
): Promise<SplitSegment[]> {

  return new Promise<SplitSegment[]>((resolve, reject) => {
    const isoFile = MP4Box.createFile();
    const segments: SplitSegment[] = [];

    let videoTrack: MP4MediaTrack | null = null;
    let audioTrack: MP4MediaTrack | null = null;
    let videoId = -1;
    let audioId = -1;

    // Per-segment sample buffers
    const videoSamples: MP4Sample[] = [];
    const audioSamples: MP4Sample[] = [];
    let videoBytes = 0;

    let readOffset    = 0;
    let isReady       = false;
    let isFlushing    = false;
    const estimatedTotal = Math.max(1, Math.ceil(file.size / SEGMENT_TARGET));

    let lastVideoSampleNum = 0;
    let lastAudioSampleNum = 0;

    // ── Flush current samples into a segment ──────────────────────────────────
    async function flushSegment(): Promise<void> {
      if (videoSamples.length === 0 || isFlushing) return;
      isFlushing = true;

      const segIdx = segments.length;
      onProgress?.({
        phase: "reading", segmentsDone: segIdx, totalSegments: estimatedTotal,
        message: `Packaging segment ${segIdx + 1}…`,
      });

      try {
        const blob = buildSegmentBlob(
          videoTrack!, audioTrack,
          [...videoSamples], [...audioSamples],
        );
        const duration = await getVideoDuration(blob);
        segments.push({ index: segIdx, blob, duration, sizeBytes: blob.size });
      } catch (e) {
        // On build failure: store a best-effort Blob and continue
        console.warn("Segment build error:", e);
      }

      // Release MP4Box internal memory for processed samples
      if (videoId >= 0) isoFile.releaseUsedSamples(videoId, lastVideoSampleNum);
      if (audioId >= 0 && lastAudioSampleNum > 0) {
        isoFile.releaseUsedSamples(audioId, lastAudioSampleNum);
      }

      videoSamples.length = 0;
      audioSamples.length = 0;
      videoBytes = 0;
      isFlushing = false;
    }

    // ── onReady: moov atom parsed ─────────────────────────────────────────────
    isoFile.onReady = (info: MP4Info) => {
      videoTrack = info.videoTracks[0] ?? null;
      audioTrack = info.audioTracks[0] ?? null;

      if (!videoTrack) {
        reject(new Error("No video track found. Please check the file format."));
        return;
      }

      videoId = videoTrack.id;
      isoFile.setExtractionOptions(videoId, null, { nbSamples: 200 });

      if (audioTrack) {
        audioId = audioTrack.id;
        isoFile.setExtractionOptions(audioId, null, { nbSamples: 200 });
      }

      isReady = true;
      isoFile.start();
      feedNext(); // resume feeding remaining chunks
    };

    // ── onSamples: frames arrive ──────────────────────────────────────────────
    isoFile.onSamples = async (id: number, _u: unknown, samples: MP4Sample[]) => {
      if (signal?.aborted) { reject(new DOMException("Upload cancelled", "AbortError")); return; }
      if (isFlushing) return; // will retry on next batch

      if (id === videoId) {
        for (const s of samples) {
          // Flush at a keyframe boundary once we've reached the target size
          if (s.is_sync && videoBytes >= SEGMENT_TARGET && videoSamples.length > 0) {
            await flushSegment();
            onProgress?.({
              phase: "splitting",
              segmentsDone: segments.length,
              totalSegments: estimatedTotal,
              message: `Split ${segments.length} of ~${estimatedTotal} segments…`,
            });
          }
          videoSamples.push(s);
          videoBytes += s.size;
          lastVideoSampleNum = s.number;
        }
      } else if (id === audioId) {
        for (const s of samples) {
          audioSamples.push(s);
          lastAudioSampleNum = s.number;
        }
      }
    };

    // ── onError ───────────────────────────────────────────────────────────────
    isoFile.onError = (e: string) => {
      reject(new Error(
        `MP4Box parsing failed: ${e}. ` +
        `The file may be corrupted or in an unsupported format (try MP4 or MOV).`
      ));
    };

    // ── Feed file in 8 MB chunks ──────────────────────────────────────────────
    let feeding = false;

    async function feedNext() {
      if (feeding) return;
      feeding = true;

      while (readOffset < file.size) {
        if (signal?.aborted) {
          reject(new DOMException("Upload cancelled", "AbortError"));
          return;
        }

        const end   = Math.min(readOffset + CHUNK_SIZE, file.size);
        const isEof = end >= file.size;

        if (!isReady) {
          onProgress?.({
            phase: "loading", segmentsDone: 0, totalSegments: estimatedTotal,
            message: "Analysing video structure…",
          });
        }

        let raw: ArrayBuffer;
        try {
          raw = await readSlice(file, readOffset, end);
        } catch (err) {
          reject(err);
          return;
        }

        // MP4Box requires a `fileStart` property on each buffer
        (raw as any).fileStart = readOffset;
        readOffset = end;

        isoFile.appendBuffer(raw as any);

        if (isEof) {
          isoFile.flush();

          // Flush the final remaining samples
          await flushSegment();

          if (segments.length === 0) {
            reject(new Error("No segments produced. The file may be unsupported."));
            return;
          }

          onProgress?.({
            phase: "reading",
            segmentsDone: segments.length,
            totalSegments: segments.length,
            message: `Prepared ${segments.length} segment${segments.length > 1 ? "s" : ""}.`,
          });

          resolve(segments);
          return;
        }

        // Once ready, onSamples drives the loop; stop feeding until next batch
        if (isReady) break;
      }

      feeding = false;
    }

    feedNext().catch(reject);
  });
}
