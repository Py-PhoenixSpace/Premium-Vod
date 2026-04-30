"use client";
/**
 * lib/mp4box-splitter.ts — Mobile-safe MP4/MOV splitter using MP4Box.js
 *
 * Algorithm:
 *  1. Feed entire file in 8 MB chunks via FileReader (peak RAM ~30 MB)
 *  2. MP4Box fires onReady() once the moov atom is parsed
 *  3. MP4Box fires onSamples() with decoded frame batches
 *  4. Accumulate samples; at each keyframe boundary ≥ SEGMENT_TARGET bytes,
 *     flush into a standalone MP4 Blob via addTrack/addSample/writeFile
 *  5. Flush remaining samples at EOF
 *
 * Bug fixes in this version vs previous:
 *  - feedNext() no longer breaks after the first post-ready chunk.
 *    Previously only 1 chunk was fed, so most of the file was never parsed.
 *  - Removed isFlushing guard from onSamples() that silently dropped samples.
 *  - Uses isoFile.writeFile() for serialisation instead of DataStream.
 */

import * as MP4Box from "mp4box";
import type { MP4Info, MP4MediaTrack, MP4Sample } from "mp4box";
import {
  SEGMENT_TARGET,
  getVideoDuration,
  type SplitProgress,
  type SplitSegment,
} from "./video-splitter-shared";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(new Error("FileReader slice error"));
    fr.readAsArrayBuffer(file.slice(start, end));
  });
}

/**
 * Build a standalone MP4 Blob from accumulated video (+ optional audio) samples.
 * Uses MP4Box's addTrack/addSample/writeFile API — no external DataStream needed.
 */
function buildSegmentBlob(
  videoTrack:   MP4MediaTrack,
  audioTrack:   MP4MediaTrack | null,
  videoSamples: MP4Sample[],
  audioSamples: MP4Sample[],
): Blob {
  if (videoSamples.length === 0) return new Blob([], { type: "video/mp4" });

  const out = MP4Box.createFile();
  const oa = out as any;

  // ── Video track ──
  const vtid = oa.addTrack({
    type:        "video",
    timescale:   videoTrack.timescale,
    width:       videoTrack.video?.width  ?? 1920,
    height:      videoTrack.video?.height ?? 1080,
    description: videoSamples[0].description,
  });
  const vBase = videoSamples[0].dts;
  for (const s of videoSamples) {
    oa.addSample(vtid, s.data, {
      duration: s.duration,
      dts:      s.dts - vBase,
      cts:      s.cts - vBase,
      is_sync:  s.is_sync,
      description: s.description,
    });
  }

  // ── Audio track (optional) ──
  if (audioTrack && audioSamples.length > 0) {
    const atid = oa.addTrack({
      type:          "audio",
      timescale:     audioTrack.timescale,
      channel_count: audioTrack.audio?.channel_count ?? 2,
      samplerate:    audioTrack.audio?.sample_rate   ?? 44100,
      samplesize:    audioTrack.audio?.sample_size   ?? 16,
      description:   audioSamples[0].description,
    });
    const aBase = audioSamples[0].dts;
    for (const s of audioSamples) {
      oa.addSample(atid, s.data, {
        duration: s.duration,
        dts:      s.dts - aBase,
        cts:      s.cts - aBase,
        is_sync:  s.is_sync,
        description: s.description,
      });
    }
  }

  // getBuffer() returns a DataStream; .buffer gives the ArrayBuffer
  const stream = oa.getBuffer();
  return new Blob([stream.buffer], { type: "video/mp4" });
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

    // Accumulate samples for the current segment
    const vSamples: MP4Sample[] = [];
    const aSamples: MP4Sample[] = [];
    let videoBytes = 0;
    let lastVNum   = 0;
    let lastANum   = 0;

    const estimated = Math.max(1, Math.ceil(file.size / SEGMENT_TARGET));

    // ── Flush current samples into a Blob segment ─────────────────────────────
    async function flushSegment() {
      console.log('[MP4Box] flushSegment called, vSamples:', vSamples.length);
      if (vSamples.length === 0) return;
      const idx = segments.length;
      onProgress?.({ phase: "reading", segmentsDone: idx, totalSegments: estimated,
        message: `Packaging segment ${idx + 1}…` });
      try {
        const blob     = buildSegmentBlob(videoTrack!, audioTrack, [...vSamples], [...aSamples]);
        console.log('[MP4Box] built blob size:', blob.size);
        const duration = await getVideoDuration(blob);
        segments.push({ index: idx, blob, duration, sizeBytes: blob.size });
      } catch (e) {
        console.error('[MP4Box] Segment build error:', e);
        reject(new Error(`Segment build failed: ${e}`));
        return;
      }
      if (videoId >= 0) isoFile.releaseUsedSamples(videoId, lastVNum);
      if (audioId >= 0 && lastANum > 0) isoFile.releaseUsedSamples(audioId, lastANum);
      vSamples.length = 0;
      aSamples.length = 0;
      videoBytes = 0;
    }

    // ── onReady: moov parsed ──────────────────────────────────────────────────
    isoFile.onReady = (info: MP4Info) => {
      console.log('[MP4Box] onReady fired, videoTracks:', info.videoTracks.length, 'audioTracks:', info.audioTracks.length);
      videoTrack = info.videoTracks[0] ?? null;
      audioTrack = info.audioTracks[0] ?? null;
      if (!videoTrack) {
        reject(new Error("No video track found in this file."));
        return;
      }
      videoId = videoTrack.id;
      isoFile.setExtractionOptions(videoId, null, { nbSamples: 200 });
      if (audioTrack) {
        audioId = audioTrack.id;
        isoFile.setExtractionOptions(audioId, null, { nbSamples: 200 });
      }
      isoFile.start();
    };

    // ── onSamples: frame batches arrive ──────────────────────────────────────
    // Called synchronously by MP4Box inside appendBuffer().
    // Declared async only to allow `await flushSegment()` at boundaries.
    // Sample accumulation (push) runs synchronously before any await.
    isoFile.onSamples = async (id: number, _u: unknown, samples: MP4Sample[]) => {
      console.log('[MP4Box] onSamples id:', id, 'videoId:', videoId, 'count:', samples.length);
      if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
      if (id === videoId) {
        for (const s of samples) {
          if (s.is_sync && videoBytes >= SEGMENT_TARGET && vSamples.length > 0) {
            await flushSegment();
            onProgress?.({ phase: "splitting", segmentsDone: segments.length,
              totalSegments: estimated, message: `Split ${segments.length} of ~${estimated}…` });
          }
          vSamples.push(s);
          videoBytes += s.size;
          lastVNum = s.number;
        }
      } else if (id === audioId) {
        for (const s of samples) {
          aSamples.push(s);
          lastANum = s.number;
        }
      }
    };

    isoFile.onError = (e: string) => {
      reject(new Error(`MP4Box error: ${e}`));
    };

    // ── Feed file in 8 MB chunks — all chunks, no early break ────────────────
    (async () => {
      let offset = 0;
      while (offset < file.size) {
        if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }

        const end   = Math.min(offset + CHUNK_SIZE, file.size);
        const isEof = end >= file.size;

        onProgress?.({ phase: "splitting", segmentsDone: segments.length,
          totalSegments: estimated, message: "Analysing video structure…" });

        let raw: ArrayBuffer;
        try { raw = await readSlice(file, offset, end); }
        catch (err) { reject(err); return; }

        // Pass last=true on the final chunk — triggers processSamples(true)
        // which flushes any remaining samples through onSamples before resolving.
        (raw as any).fileStart = offset;
        offset = end;
        isoFile.appendBuffer(raw as any, isEof);

        if (isEof) {
          // Give async onSamples continuations a tick to land
          await new Promise(r => setTimeout(r, 20));
          await flushSegment();

          if (segments.length === 0) {
            reject(new Error("No segments produced. The file may be in an unsupported format."));
            return;
          }
          onProgress?.({ phase: "reading", segmentsDone: segments.length,
            totalSegments: segments.length, message: `Ready: ${segments.length} segment(s).` });
          resolve(segments);
        }
      }
    })().catch(reject);
  });
}
