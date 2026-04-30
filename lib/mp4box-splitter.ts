"use client";
/**
 * lib/mp4box-splitter.ts — Production MP4/MOV splitter using MP4Box.js v2.3.0
 *
 * Strategy: Parse-metadata-then-slice
 *  1. Feed chunks until MP4Box parses the moov atom (first few KB/MB of file).
 *     The moov atom contains ALL sample metadata: offsets, sizes, keyframes, timestamps.
 *  2. After onReady, stop feeding. We now have complete sample metadata without
 *     loading any actual video frame data into memory.
 *  3. Calculate segment boundaries at keyframe positions nearest SEGMENT_TARGET.
 *  4. For each segment: read the raw sample bytes directly from the File using
 *     FileReader.slice at the exact byte offsets from the sample table.
 *     Only ~90MB of data is in memory at a time regardless of file size.
 *  5. Build a valid MP4 file for each segment using MP4Box addTrack/addSample/getBuffer.
 *
 * Why we abandoned onSamples:
 *  mp4box v2.3.0's getSample() uses stream.findPosition() to locate mdat bytes.
 *  In streaming mode, those stream buffers are consumed/released after box parsing,
 *  so findPosition returns -1 and getSample returns null → onSamples never fires.
 *  This approach bypasses getSample entirely by reading bytes ourselves.
 */

import * as MP4Box from "mp4box";
import type { MP4Info, MP4MediaTrack } from "mp4box";
import {
  SEGMENT_TARGET,
  getVideoDuration,
  type SplitProgress,
  type SplitSegment,
} from "./video-splitter-shared";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

// ─── Internal types ───────────────────────────────────────────────────────────

interface RawSample {
  number:           number;
  track_id:         number;
  timescale:        number;
  description_index: number;
  description:      unknown; // codec box (avcC / hvcC / mp4a …)
  size:             number;
  dts:              number;
  cts:              number;
  duration:         number;
  is_sync:          boolean;
  offset:           number;  // absolute byte offset in the original file
  data:             Uint8Array | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(new Error("FileReader error"));
    fr.readAsArrayBuffer(file.slice(start, end));
  });
}

/**
 * Parse the moov atom by feeding chunks until onReady fires.
 * Returns the ISOFile (containing all track + sample metadata).
 */
function parseMovMetadata(
  file: File,
  signal?: AbortSignal,
): Promise<{ isoFile: unknown; info: MP4Info }> {
  return new Promise((resolve, reject) => {
    const isoFile = MP4Box.createFile();
    let ready = false;

    isoFile.onReady = (info: MP4Info) => {
      ready = true;
      resolve({ isoFile, info });
    };
    isoFile.onError = (e: string) => reject(new Error(`MP4Box: ${e}`));

    (async () => {
      let feedFrom = 0;
      while (feedFrom < file.size) {
        if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
        const end = Math.min(feedFrom + CHUNK_SIZE, file.size);
        let raw: ArrayBuffer;
        try { raw = await readSlice(file, feedFrom, end); }
        catch (e) { reject(e); return; }
        (raw as any).fileStart = feedFrom;
        const next = isoFile.appendBuffer(raw as any) as number | undefined;
        if (ready) return; // moov parsed — stop feeding
        feedFrom = (next && next > 0) ? next : end;
      }
      if (!ready) reject(new Error("moov atom not found — file may be corrupt or not an MP4."));
    })().catch(reject);
  });
}

/**
 * Build a self-contained MP4 Blob from raw sample byte arrays.
 */
function buildSegmentBlob(
  videoTrack:    MP4MediaTrack,
  audioTrack:    MP4MediaTrack | null,
  vSamples:      RawSample[],
  aSamples:      RawSample[],
  vData:         ArrayBuffer,   // raw bytes for video samples
  aData:         ArrayBuffer | null,
  vDataStart:    number,        // file offset of first byte in vData
  aDataStart:    number,        // file offset of first byte in aData
): Blob {
  if (vSamples.length === 0) return new Blob([], { type: "video/mp4" });

  const out = MP4Box.createFile();
  const oa = out as any;

  // ── Video track ──
  const vtid = oa.addTrack({
    type:        "video",
    timescale:   videoTrack.timescale,
    width:       videoTrack.video?.width  ?? 1920,
    height:      videoTrack.video?.height ?? 1080,
    description: vSamples[0].description,
  });
  const vBase = vSamples[0].dts;
  for (const s of vSamples) {
    const sStart = s.offset - vDataStart;
    const sData  = vData.slice(sStart, sStart + s.size);
    oa.addSample(vtid, sData, {
      duration:    s.duration,
      dts:         s.dts - vBase,
      cts:         s.cts - vBase,
      is_sync:     s.is_sync,
      description: s.description,
    });
  }

  // ── Audio track ──
  if (audioTrack && aSamples.length > 0 && aData) {
    const atid = oa.addTrack({
      type:          "audio",
      timescale:     audioTrack.timescale,
      channel_count: audioTrack.audio?.channel_count ?? 2,
      samplerate:    audioTrack.audio?.sample_rate   ?? 44100,
      samplesize:    audioTrack.audio?.sample_size   ?? 16,
      description:   aSamples[0].description,
    });
    const aBase = aSamples[0].dts;
    for (const s of aSamples) {
      const sStart = s.offset - aDataStart;
      const sData  = aData.slice(sStart, sStart + s.size);
      oa.addSample(atid, sData, {
        duration:    s.duration,
        dts:         s.dts - aBase,
        cts:         s.cts - aBase,
        is_sync:     s.is_sync,
        description: s.description,
      });
    }
  }

  const stream = oa.getBuffer();
  return new Blob([stream.buffer], { type: "video/mp4" });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function splitVideoFileMobile(
  file: File,
  onProgress?: (p: SplitProgress) => void,
  signal?: AbortSignal,
): Promise<SplitSegment[]> {

  // ── Step 1: Parse moov to get all sample metadata ─────────────────────────
  onProgress?.({ phase: "splitting", segmentsDone: 0, totalSegments: 1,
    message: "Analysing video structure…" });

  const { isoFile, info } = await parseMovMetadata(file, signal);
  const moov = (isoFile as any).moov;

  const videoTrack = info.videoTracks[0] ?? null;
  const audioTrack = info.audioTracks[0] ?? null;
  if (!videoTrack) throw new Error("No video track found in this file.");

  const vTrak = moov.traks.find((t: any) => t.tkhd.track_id === videoTrack.id);
  const aTrak = audioTrack
    ? moov.traks.find((t: any) => t.tkhd.track_id === audioTrack.id)
    : null;

  const vAllSamples: RawSample[] = vTrak.samples;
  const aAllSamples: RawSample[] = aTrak?.samples ?? [];

  // ── Step 2: Calculate segment boundaries at keyframe positions ────────────
  const boundaries: number[] = []; // start sample indices for each segment
  boundaries.push(0);
  let accBytes = 0;
  for (let i = 0; i < vAllSamples.length; i++) {
    accBytes += vAllSamples[i].size;
    if (accBytes >= SEGMENT_TARGET && vAllSamples[i].is_sync && i > (boundaries.at(-1) ?? 0)) {
      boundaries.push(i);
      accBytes = 0;
    }
  }
  boundaries.push(vAllSamples.length); // sentinel end

  const totalSegments = boundaries.length - 1;

  // ── Step 3: Build each segment ────────────────────────────────────────────
  const segments: SplitSegment[] = [];

  for (let si = 0; si < totalSegments; si++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

    onProgress?.({ phase: "splitting", segmentsDone: si, totalSegments,
      message: `Packaging segment ${si + 1} of ${totalSegments}…` });

    const vSegSamples = vAllSamples.slice(boundaries[si], boundaries[si + 1]);
    if (vSegSamples.length === 0) continue;

    // Read raw video bytes for this segment in one contiguous slice
    const vStart = Math.min(...vSegSamples.map(s => s.offset));
    const vEnd   = Math.max(...vSegSamples.map(s => s.offset + s.size));
    const vData  = await readSlice(file, vStart, vEnd);

    // Find overlapping audio samples by DTS range
    const vDtsStart = vSegSamples[0].dts;
    const vDtsEnd   = vSegSamples.at(-1)!.dts + vSegSamples.at(-1)!.duration;
    const aSegSamples = aAllSamples.filter(
      s => s.dts >= vDtsStart && s.dts < vDtsEnd
    );

    let aData: ArrayBuffer | null = null;
    let aStart = 0;
    if (aSegSamples.length > 0) {
      aStart = Math.min(...aSegSamples.map(s => s.offset));
      const aEnd = Math.max(...aSegSamples.map(s => s.offset + s.size));
      aData = await readSlice(file, aStart, aEnd);
    }

    const blob = buildSegmentBlob(
      videoTrack, audioTrack,
      vSegSamples, aSegSamples,
      vData, aData, vStart, aStart,
    );
    const duration = await getVideoDuration(blob);
    segments.push({ index: si, blob, duration, sizeBytes: blob.size });
  }

  if (segments.length === 0) throw new Error("No segments produced — file may be unsupported.");

  onProgress?.({ phase: "reading", segmentsDone: segments.length,
    totalSegments: segments.length, message: `Ready: ${segments.length} segment(s).` });

  return segments;
}
