/**
 * Minimal TypeScript declarations for the `mp4box` npm package.
 * MP4Box.js by GPAC — https://gpac.github.io/mp4box.js/
 *
 * mp4box uses CommonJS exports (no default export).
 * Import with:  import * as MP4Box from "mp4box"
 */
declare module "mp4box" {
  // ── ArrayBuffer subtype that MP4Box requires ──────────────────────────────
  interface MP4ArrayBuffer extends ArrayBuffer {
    /** Byte offset of this chunk within the original file. */
    fileStart: number;
  }

  // ── Track info returned by onReady ────────────────────────────────────────
  interface MP4VideoTrackInfo {
    width:  number;
    height: number;
  }

  interface MP4MediaTrack {
    id:               number;
    type:             "video" | "audio" | "hint" | "metadata" | "text";
    codec:            string;
    duration:         number;   // in timescale units
    timescale:        number;
    nb_samples:       number;
    movie_duration?:  number;
    video?:           MP4VideoTrackInfo;
    audio?: {
      sample_rate:    number;
      channel_count:  number;
      sample_size:    number;
    };
  }

  interface MP4Info {
    duration:    number;   // in timescale units
    timescale:   number;
    isFragmented: boolean;
    tracks:      MP4MediaTrack[];
    videoTracks: MP4MediaTrack[];
    audioTracks: MP4MediaTrack[];
  }

  // ── Individual decoded sample ─────────────────────────────────────────────
  interface MP4Sample {
    track_id:   number;
    description: unknown; // codec box — opaque to us
    is_sync:    boolean;  // true = IDR / keyframe
    dts:        number;   // decode timestamp (timescale units)
    cts:        number;   // composition timestamp (timescale units)
    duration:   number;   // sample duration (timescale units)
    size:       number;   // byte size
    data:       ArrayBuffer;
    timescale:  number;
    number:     number;   // 1-based sample index within track
  }

  // ── Extraction options ────────────────────────────────────────────────────
  interface ExtractionOptions {
    nbSamples?:     number;
    rapAlignement?: boolean; // typo in MP4Box API — kept intentionally
  }

  // ── Output segment description returned by flush() ────────────────────────
  interface MP4Segment {
    id:   number;
    user: unknown;
    buffer: ArrayBuffer;
    sampleNum: number;
    samples:   MP4Sample[];
  }

  // ── Main ISOFile API ──────────────────────────────────────────────────────
  interface ISOFile {
    // Callbacks — set before calling appendBuffer/start
    onReady:   ((info: MP4Info) => void) | null;
    onSamples: ((id: number, user: unknown, samples: MP4Sample[]) => void) | null;
    onError:   ((e: string) => void) | null;

    /**
     * Feed the next chunk of file data. The ArrayBuffer MUST have a
     * `fileStart` property set to its byte offset within the full file.
     */
    appendBuffer(buffer: MP4ArrayBuffer): number;

    /** Signal that all data has been fed (EOF). */
    flush(): void;

    /**
     * Register a track for sample extraction.
     * Must be called inside the `onReady` callback.
     */
    setExtractionOptions(
      trackId:  number,
      user?:    unknown,
      options?: ExtractionOptions,
    ): void;

    /** Start sample extraction (call after setExtractionOptions). */
    start(): void;

    /** Stop extraction. */
    stop(): void;

    /**
     * Free internal memory for samples up to `sampleNum` on `trackId`.
     * Call after processing each batch in `onSamples` to prevent OOM.
     */
    releaseUsedSamples(trackId: number, sampleNum: number): void;
  }

  /** Create a new ISOFile parser instance. */
  function createFile(): ISOFile;

  /**
   * DataStream — used to serialise an ISOFile to an ArrayBuffer.
   * Accessed as (MP4Box as any).DataStream in production code because
   * it's not exported in all bundle variants.
   */
  class DataStream {
    static BIG_ENDIAN: boolean;
    buffer: ArrayBuffer;
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
    write(obj: unknown): void;
  }
}
