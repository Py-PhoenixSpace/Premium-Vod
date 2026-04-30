"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Upload, Loader2, CheckCircle, Film, ImageIcon,
  AlertCircle, Sparkles, HardDrive, Database, X, Scissors,
} from "lucide-react";
import type { MediaType, VideoCategory } from "@/types";
import {
  splitVideoFile, SPLIT_THRESHOLD,
  MAX_SPLITTABLE, MAX_SPLITTABLE_MOBILE,
  isMobileDevice,
  type SplitSegment, type SplitProgress,
} from "@/lib/video-splitter";
import { useUploadStore } from "@/lib/stores/upload-store";

// Desktop: 3 parallel XHRs. Mobile: 1 — fewer connections = fewer drops on weak networks.
const CONCURRENCY = 3;

// ─── Retry wrapper — handles dropped mobile connections ─────────────────────────
// Retries up to MAX_RETRIES times with exponential backoff (2s, 4s, 8s).
// AbortError (user cancel) bypasses retries immediately.
async function uploadWithRetry(
  blob: Blob,
  signData: Record<string, any>,
  onProgress: (frac: number) => void,
  signal: AbortSignal,
  maxRetries = 3,
): Promise<Record<string, any>> {
  let lastErr: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Reset progress to 0 on retry so the bar doesn't jump backwards confusingly
      if (attempt > 0) onProgress(0);
      return await uploadToCloudinary(blob, signData, onProgress, signal);
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;           // user cancelled — stop immediately
      lastErr = err;
      if (attempt < maxRetries) {
        const delaySec = Math.pow(2, attempt + 1);          // 2s, 4s, 8s
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    }
  }
  throw new Error(`Segment upload failed after ${maxRetries} retries: ${lastErr.message}`);
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Mobile uses MP4Box.js streaming (5 GB safe); desktop uses ffmpeg.wasm (3 GB).
const MAX_FILE_SIZE = isMobileDevice() ? MAX_SPLITTABLE_MOBILE : MAX_SPLITTABLE;

function formatBytes(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BucketUsage {
  id: string; label: string; cloudName: string;
  usedGB: number; limitGB: number; percent: number; error?: string;
}

type UploadPhase = "idle" | "splitting" | "uploading" | "finalizing" | "done" | "error";

// ─── Direct Cloudinary upload (XHR, supports AbortSignal) ───────────────────
function uploadToCloudinary(
  blob: Blob,
  signData: Record<string, any>,
  onProgress: (frac: number) => void,
  signal?: AbortSignal,
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file",       blob);
    fd.append("api_key",    signData.apiKey);
    fd.append("timestamp",  signData.timestamp.toString());
    fd.append("signature",  signData.signature);
    fd.append("folder",     signData.folder);
    fd.append("public_id",  signData.publicId);
    fd.append("overwrite",  "false");
    fd.append("invalidate", "false");
    if (signData.eager)           fd.append("eager",                  signData.eager);
    if (signData.eagerAsync)      fd.append("eager_async",            signData.eagerAsync);
    if (signData.notificationUrl) fd.append("eager_notification_url", signData.notificationUrl);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${signData.cloudName}/${signData.mediaType}/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        let msg = "Upload failed";
        try { const b = JSON.parse(xhr.responseText); if (b?.error?.message) msg = b.error.message; } catch { /**/ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection"));

    // Abort support — cancel the XHR when the signal fires
    if (signal) {
      if (signal.aborted) { xhr.abort(); reject(new DOMException("Upload cancelled", "AbortError")); return; }
      signal.addEventListener("abort", () => { xhr.abort(); reject(new DOMException("Upload cancelled", "AbortError")); }, { once: true });
    }

    xhr.send(fd);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminUploadPage() {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [file,          setFile]          = useState<File | null>(null);
  const [mediaType,     setMediaType]     = useState<MediaType>("video");
  const [title,         setTitle]         = useState("");
  const [description,   setDescription]   = useState("");
  const [category,      setCategory]      = useState<VideoCategory>("featured");
  const [priceINR,      setPriceINR]      = useState("");
  const [priceUSD,      setPriceUSD]      = useState("");
  const [isPremium,     setIsPremium]     = useState(false);
  const [storageBucket, setStorageBucket] = useState("bucket-1");

  const store = useUploadStore();

  // Mirror store state locally for the page UI
  const phase        = store.phase      as UploadPhase;
  const segDone      = store.segDone;
  const segTotal     = store.segTotal;
  const overallPct   = store.overallPct;
  const bytesUploaded= store.bytesUploaded;
  const totalBytes   = store.totalBytes;
  const speedMBps    = store.speedMBps;
  const etaSec       = store.etaSec;
  const errorMsg     = store.errorMsg;

  const [splitProg,  setSplitProg]  = useState<SplitProgress | null>(null);
  const [segPct,     setSegPct]     = useState(0);
  const uploadStartRef = useRef<number>(0);

  // Duplicate check
  const [dupWarning,    setDupWarning]    = useState(false);
  const [checkingDup,   setCheckingDup]   = useState(false);

  // Storage buckets
  const [buckets,       setBuckets]       = useState<BucketUsage[]>([]);
  const [bucketsLoading,setBucketsLoading]= useState(true);

  useEffect(() => {
    fetch("/api/admin/storage").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.buckets?.length) { setBuckets(d.buckets); setStorageBucket(d.buckets[0].id); }
    }).catch(console.error).finally(() => setBucketsLoading(false));
  }, []);

  const checkDuplicate = useCallback(async (v: string) => {
    if (!v.trim() || v.length < 3) { setDupWarning(false); return; }
    setCheckingDup(true);
    try {
      const r = await fetch(`/api/admin/check-title?title=${encodeURIComponent(v.trim())}`);
      if (r.ok) setDupWarning((await r.json()).exists);
    } catch { /* ignore */ } finally { setCheckingDup(false); }
  }, []);

  useEffect(() => { const t = setTimeout(() => checkDuplicate(title), 600); return () => clearTimeout(t); }, [title, checkDuplicate]);
  useEffect(() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }, [mediaType]);

  const isLargeVideo = file && mediaType === "video" && file.size > SPLIT_THRESHOLD;
  const tooBig       = file && file.size > MAX_FILE_SIZE;

  // ── Main upload handler — PARALLEL uploads ───────────────────────────────
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || tooBig) return;

    store.reset();
    setSegPct(0);

    try {
      // 1. Split ─────────────────────────────────────────────────────────────
      let segments: SplitSegment[];

      if (mediaType === "video" && file.size > SPLIT_THRESHOLD) {
        store.setSplitting(0, 1);
        // AbortSignal passed so user cancel also stops mid-split on mobile
        const controller2 = new AbortController();
        store.setCancelFn(() => controller2.abort());
        segments = await splitVideoFile(file, (p) => {
          setSplitProg(p);
          store.setSplitting(p.segmentsDone, p.totalSegments);
        }, controller2.signal);
      } else {
        segments = [{ index: 0, blob: file, duration: 0, sizeBytes: file.size }];
      }

      const sharedVideoId = crypto.randomUUID();
      const isSegmented   = segments.length > 1;
      const grandTotal    = segments.reduce((s, g) => s + g.sizeBytes, 0);

      store.start(title, grandTotal);

      // Adaptive concurrency: mobile gets 1 worker (fewer dropped connections)
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const concurrency = isMobile ? 1 : CONCURRENCY;

      // Register abort controller so the FAB Stop button can cancel uploads
      const controller = new AbortController();
      store.setCancelFn(() => controller.abort());

      // Acquire Screen Wake Lock to prevent the device sleeping mid-upload
      // (critical on mobile — OS kills background XHR when screen turns off)
      let wakeLock: WakeLockSentinel | null = null;
      try {
        if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch { /* Wake Lock not supported or denied — continue without it */ }

      // 2. Fetch ALL signatures upfront in parallel (fast — just JSON) ────────
      const signatures = await Promise.all(
        segments.map((_, i) =>
          fetch("/api/video/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mediaType, storageBucket,
              videoId: sharedVideoId,
              segmentIndex: isSegmented ? i : undefined,
            }),
          }).then(r => { if (!r.ok) throw new Error(`Signature failed for segment ${i+1}`); return r.json(); })
        )
      );

      // 3. Upload with CONCURRENCY parallel XHRs ─────────────────────────────
      // Per-segment loaded bytes — needed to compute combined progress
      const segLoaded   = new Array(segments.length).fill(0) as number[];
      const segResults  = new Array(segments.length) as Record<string, any>[];
      let   segsDone    = 0;
      const overallStart = Date.now();

      function computeStats() {
        const totalLoaded  = segLoaded.reduce((a, b) => a + b, 0);
        const elapsedSec   = (Date.now() - overallStart) / 1000 || 0.001;
        const speedBps     = totalLoaded / elapsedSec;
        const remaining    = grandTotal - totalLoaded;
        const eta          = speedBps > 0 ? remaining / speedBps : 0;
        const pct          = Math.round((totalLoaded / grandTotal) * 100);
        store.setProgress({
          overallPct:    pct,
          bytesUploaded: totalLoaded,
          speedMBps:     parseFloat((speedBps / 1024 / 1024).toFixed(2)),
          etaSec:        Math.round(eta),
          segDone:       segsDone,
          segTotal:      segments.length,
        });
        setSegPct(pct); // local page bar mirrors overall when parallel
      }

      // Pool worker — picks next segment from queue and uploads it
      const queue = segments.map((_, i) => i);

      async function worker() {
        while (queue.length > 0) {
          const i = queue.shift()!;
          const seg = segments[i];
          const sign = signatures[i];

          // uploadWithRetry: up to 3 retries on network error (mobile drops)
          segResults[i] = await uploadWithRetry(seg.blob, sign, (frac) => {
            segLoaded[i] = frac * seg.sizeBytes;
            computeStats();
          }, controller.signal);

          segLoaded[i] = seg.sizeBytes; // mark complete
          segsDone++;
          computeStats();
        }
      }

      // Launch workers (mobile: 1, desktop: 3)
      await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, worker));

      // Release Wake Lock — upload done
      wakeLock?.release().catch(() => {});

      store.setFinalizing();

      // 4. Finalize ──────────────────────────────────────────────────────────
      const uploadedSegments = segments.map((seg, i) => ({
        index:         i,
        publicId:      segResults[i]?.public_id || signatures[i].publicId,
        duration:      segResults[i]?.duration  || seg.duration || 0,
        storageBucket: storageBucket,
      }));

      const firstResult = uploadedSegments[0];
      const finalizeBody = isSegmented
        ? {
            videoId: sharedVideoId, title, description, category, mediaType,
            priceINR: Number(priceINR) || 0, priceUSD: Number(priceUSD) || 0,
            isPremium, storageBucket, isSegmented: true,
            segments: uploadedSegments,
            totalDuration: uploadedSegments.reduce((s, g) => s + g.duration, 0),
          }
        : {
            videoId: sharedVideoId, publicId: firstResult.publicId,
            duration: firstResult.duration, secureUrl: "",
            title, description, category, mediaType,
            priceINR: Number(priceINR) || 0, priceUSD: Number(priceUSD) || 0,
            isPremium, storageBucket, isSegmented: false,
          };

      const finalRes = await fetch("/api/video/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalizeBody),
      });
      if (!finalRes.ok) throw new Error("Metadata save failed — upload succeeded, please retry.");

      store.setDone();
      setTitle(""); setDescription(""); setPriceINR(""); setPriceUSD("");
      setIsPremium(false); setFile(null);
      if (fileRef.current) fileRef.current.value = "";

    } catch (err: any) {
      // Release Wake Lock on error too
      try { (globalThis as any)._wakeLock?.release(); } catch { /**/ }
      const msg = err?.name === "AbortError" ? "Upload cancelled." : (err.message || "Upload failed");
      store.setError(msg);
      store.setCancelFn(null);
    }
  }

  const busy = phase === "splitting" || phase === "uploading" || phase === "finalizing";

  function getBarColor(pct: number) {
    if (pct >= 85) return "from-red-500 to-red-400";
    if (pct >= 60) return "from-yellow-500 to-amber-400";
    return "from-primary to-violet-400";
  }

  return (
    <div className="max-w-2xl w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
          Upload <span className="brand-gold-text">Media</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Videos over 95 MB are automatically split into segments and uploaded separately.
        </p>
      </div>

      {/* Success */}
      {phase === "done" && (
        <div className="bg-accent/10 border border-accent/20 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Uploaded successfully!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mediaType === "image" ? "Image saved." : `Video is published${segTotal > 1 ? ` (${segTotal} segments)` : ""}.`}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl px-5 py-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{errorMsg}</p>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6">
        <form onSubmit={handleUpload} className="space-y-6">

          {/* Media type */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Media Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["video", "image"] as const).map((t) => (
                <button key={t} type="button" onClick={() => !busy && setMediaType(t)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${mediaType === t ? "border-primary/50 bg-primary/5 text-foreground" : "border-border/20 text-muted-foreground hover:border-primary/30"}`}>
                  {t === "video" ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Storage bucket */}
          <div>
            <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Storage Destination
            </Label>
            {bucketsLoading ? (
              <div className="flex items-center gap-2 p-4 border border-border/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Loading storage buckets…</span>
              </div>
            ) : buckets.length > 0 ? (
              <div className="grid gap-3">
                {buckets.map((b) => (
                  <label key={b.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${storageBucket === b.id ? "border-primary/50 bg-primary/5" : "border-border/20 hover:border-primary/30"}`}>
                    <input type="radio" name="storageBucket" value={b.id} checked={storageBucket === b.id}
                      onChange={() => setStorageBucket(b.id)} className="w-4 h-4 accent-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold">{b.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{b.cloudName}</span>
                        </div>
                        <span className={`text-xs font-bold ${b.percent >= 85 ? "text-red-400" : b.percent >= 60 ? "text-yellow-400" : "text-primary"}`}>{b.percent}%</span>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${getBarColor(b.percent)} transition-all duration-500`} style={{ width: `${Math.min(b.percent, 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{b.usedGB.toFixed(2)} GB / {b.limitGB} GB used</p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4 border border-border/20 rounded-xl">Using default storage.</p>
            )}
          </div>

          {/* File picker */}
          <div>
            <Label className="text-sm font-medium mb-2 block">{mediaType === "image" ? "Image File" : "Video File"}</Label>
            <div
              onClick={() => !busy && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${file ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-primary/30 hover:bg-primary/5"}`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    {mediaType === "image" ? <ImageIcon className="w-6 h-6 text-primary" /> : <Film className="w-6 h-6 text-primary" />}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                      {isLargeVideo && !tooBig && (
                        <span className="ml-2 text-amber-400 font-semibold flex items-center gap-1 inline-flex">
                          <Scissors className="w-3 h-3" /> Will be split into segments
                        </span>
                      )}
                      {tooBig && <span className="ml-2 text-destructive font-semibold">⚠ Exceeds 3 GB WASM limit</span>}
                    </p>
                  </div>
                  {!busy && (
                    <button type="button"
                      onClick={(ev) => { ev.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="shrink-0 w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center hover:bg-destructive/20 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    {mediaType === "image" ? <ImageIcon className="w-7 h-7 text-muted-foreground" /> : <Upload className="w-7 h-7 text-muted-foreground" />}
                  </div>
                  <p className="text-sm text-muted-foreground">Click to select {mediaType === "image" ? "image" : "video"} file</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {mediaType === "image" ? "JPG, PNG, or WebP" : "MP4, MOV, M4V · Up to 20 GB · Auto-split via MP4Box (~90 MB RAM only)"}
                  </p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file"
              accept={mediaType === "image"
                ? "image/*"
                // iPhone 17 Pro: ProRes (.mov), HEVC (.mov/.mp4), HEIF video (.heif/.heic)
                // Standard: MP4, MKV, WebM, MOV
                : "video/*,video/quicktime,video/mp4,video/x-matroska,.mov,.hevc,.mp4,.mkv,.webm,.heif,.heic,.prores"}
              className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <div className="relative">
              <Input id="title" placeholder="e.g., 30-Minute Premium Video Title" value={title}
                onChange={(e) => setTitle(e.target.value)} required
                className={`h-11 bg-muted/30 pr-8 ${dupWarning ? "border-amber-500/60" : "border-border/40"}`} />
              {checkingDup && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            {dupWarning && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> A video with this title already exists.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <span className={`text-xs tabular-nums ${description.length > 450 ? "text-amber-500" : "text-muted-foreground"}`}>{description.length} / 500</span>
            </div>
            <textarea id="description" rows={3} placeholder="Describe the video…" value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value as VideoCategory)}
              className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm outline-none h-11">
              <option value="featured">Featured</option>
              <option value="educational">Educational</option>
              <option value="entertainment">Entertainment</option>
              <option value="tutorial">Tutorial</option>
              <option value="exclusive">Exclusive</option>
            </select>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceINR">Price (INR)</Label>
              <Input id="priceINR" type="number" placeholder="0 = free" value={priceINR}
                onChange={(e) => setPriceINR(e.target.value)} className="h-11 bg-muted/30 border-border/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceUSD">Price (USD)</Label>
              <Input id="priceUSD" type="number" placeholder="0 = free" value={priceUSD}
                onChange={(e) => setPriceUSD(e.target.value)} className="h-11 bg-muted/30 border-border/40" />
            </div>
          </div>

          {/* Premium toggle */}
          <label htmlFor="isPremium" className="flex items-center gap-3 cursor-pointer glass rounded-xl px-4 py-3">
            <input id="isPremium" type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Include in PremiumVOD Premium</span>
            </div>
          </label>

          {/* Progress area */}
          {busy && (
            <div className="space-y-3 bg-muted/20 border border-border/20 rounded-xl p-4">

              {/* Splitting phase */}
              {phase === "splitting" && splitProg && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                      <Scissors className="w-3.5 h-3.5 animate-pulse" />
                      {splitProg.message}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {splitProg.segmentsDone} / {splitProg.totalSegments} segments
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300"
                      style={{ width: splitProg.totalSegments > 0 ? `${(splitProg.segmentsDone / splitProg.totalSegments) * 100}%` : "5%" }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Splitting uses your browser — no internet needed for this step.
                  </p>
                </div>
              )}

              {/* Upload phase */}
              {(phase === "uploading" || phase === "finalizing") && (
                <>
                  {/* MB stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/30 rounded-lg py-2 px-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Uploaded</p>
                      <p className="text-xs font-bold font-mono text-foreground">{formatBytes(bytesUploaded)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg py-2 px-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Remaining</p>
                      <p className="text-xs font-bold font-mono text-foreground">
                        {formatBytes(Math.max(0, totalBytes - bytesUploaded))}
                      </p>
                    </div>
                    <div className="bg-muted/30 rounded-lg py-2 px-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Speed</p>
                      <p className="text-xs font-bold font-mono text-primary">
                        {speedMBps > 0 ? `${speedMBps} MB/s` : "—"}
                      </p>
                    </div>
                  </div>

                  {/* ETA */}
                  {etaSec > 0 && phase === "uploading" && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      ⏱ About {etaSec < 60 ? `${etaSec}s` : `${Math.ceil(etaSec / 60)} min`} remaining
                    </p>
                  )}

                  {/* Per-segment bar (only for multi-segment) */}
                  {segTotal > 1 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Segment {Math.min(segDone + 1, segTotal)} of {segTotal}</span>
                        <span className="font-mono">{segPct}%</span>
                      </div>
                      <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full bg-primary/50 rounded-full transition-all duration-200"
                          style={{ width: `${segPct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Overall progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {phase === "finalizing" ? "Saving to database…" : `Total progress`}
                      </span>
                      <span className="font-mono font-bold text-foreground">{overallPct}%</span>
                    </div>
                    <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
                      <div className="h-full brand-gradient rounded-full transition-all duration-300"
                        style={{ width: `${overallPct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right font-mono">
                      {formatBytes(bytesUploaded)} / {formatBytes(totalBytes)}
                    </p>
                  </div>
                </>
              )}

              {/* Do-not-close warning */}
              <div className="flex items-center gap-2 pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  {phase === "finalizing"
                    ? "Saving metadata — almost done, please don't close this tab."
                    : "Upload in progress — keep this tab open until complete."}
                </p>
              </div>
            </div>
          )}

          {/* Mobile large-file info — MP4Box.js supports up to 5 GB on mobile */}
          {isLargeVideo && !busy && (
            <div className="bg-blue-500/15 border border-blue-400/30 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <span className="text-blue-300 text-base shrink-0 mt-0.5">ℹ</span>
              <div>
                <p className="text-xs font-semibold text-blue-900 dark:text-white">Large file detected</p>
                <p className="text-[11px] text-blue-800 dark:text-blue-100/80 mt-0.5">
                  {formatBytes(file?.size ?? 0)} will be split into segments automatically using{" "}
                  <strong className="text-blue-900 dark:text-white">MP4Box</strong> — up to <strong className="text-blue-900 dark:text-white">20 GB</strong> on both desktop and mobile (~90 MB peak RAM regardless of file size).
                  Keep your screen on and stay on this tab during the upload.
                </p>
              </div>
            </div>
          )}

          <Button type="submit" disabled={busy || !file || !!tooBig}
            className="w-full h-12 brand-gradient text-white font-semibold shadow-lg shadow-primary/20">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            {phase === "splitting"  ? `Splitting… (${splitProg?.segmentsDone || 0}/${splitProg?.totalSegments || "?"})` :
             phase === "uploading"  ? `Uploading… (${overallPct}%)` :
             phase === "finalizing" ? "Saving…" :
             `Upload ${mediaType === "image" ? "Image" : "Video"}`}
          </Button>
        </form>
      </div>
    </div>
  );
}