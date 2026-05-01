"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CldVideoPlayer } from "next-cloudinary";
import "next-cloudinary/dist/cld-video-player.css";
import { Loader2, AlertCircle, Lock, Maximize2, Minimize2, ChevronUp, Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudinaryVideoPlayer } from "next-cloudinary";
import Image from "next/image";
import type { MediaType } from "@/types";
import { useUIStore } from "@/lib/stores/ui-store";
import SegmentedVideoPlayer, { type SegmentInfo } from "@/components/SegmentedVideoPlayer";

// ── Quality types ────────────────────────────────────────────────────────────
export type QualityLevel = "auto" | "low" | "medium" | "high";

const QUALITY_OPTIONS: { value: QualityLevel; label: string; desc: string }[] = [
  { value: "auto",   label: "Auto",  desc: "Adaptive"        },
  { value: "high",   label: "1080p", desc: "HD · More data"  },
  { value: "medium", label: "720p",  desc: "Balanced"        },
  { value: "low",    label: "480p",  desc: "Data saver"      },
];

/**
 * Detect the best quality tier for this device.
 * Runs client-side only (browser APIs). Returns "low" | "medium" | "high".
 *
 * Decision matrix:
 *   Device memory ≤ 2GB OR 2G network  → low    (480p)
 *   Mobile screen OR 3G network        → medium (720p)
 *   Desktop + 4G/WiFi                  → high   (1080p)
 *
 * Falls back to "medium" (720p) on any API unavailability — safest default.
 */
function getQualityHint(): "low" | "medium" | "high" {
  if (typeof window === "undefined") return "medium";
  const conn    = (navigator as any).connection;
  const mem     = (navigator as any).deviceMemory || 4;
  const screenW = window.screen.width * (window.devicePixelRatio || 1);
  const isMob   = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (mem <= 2 || conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") return "low";
  if (isMob || conn?.effectiveType === "3g" || screenW <= 1280) return "medium";
  return "high";
}

interface VideoPlayerProps {
  videoId: string;
  onProgress?: (timestamp: number) => void;
}

interface StreamData {
  url?:             string;
  mediaType:        MediaType;
  lastTimestamp:    number;
  title:            string;
  description:      string;
  durationInSeconds: number;
  category:         string;
  expiresAt?:       number;
  qualityLabel?:    string;
  isSegmented?:     boolean;
  segments?:        SegmentInfo[];
  totalDuration?:   number;
}

// ── Inline quality picker (used for CldVideoPlayer overlay) ─────────────────
function QualityPicker({
  current,
  onChange,
  resolvedLabel,
}: {
  current: QualityLevel;
  onChange: (q: QualityLevel) => void;
  resolvedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLabel = current === "auto"
    ? `Auto${resolvedLabel ? ` (${resolvedLabel})` : ""}`
    : QUALITY_OPTIONS.find(o => o.value === current)?.label ?? "Auto";

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-white/80 text-xs border border-white/20 rounded
                   px-1.5 py-0.5 hover:text-white hover:border-white/50 transition-colors bg-black/40"
        title="Quality"
      >
        <Settings2 className="w-3 h-3" />
        <span>{currentLabel}</span>
        <ChevronUp className={`w-3 h-3 transition-transform duration-150 ${open ? "" : "rotate-180"}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-black/95 border border-white/15
                        rounded-xl overflow-hidden min-w-[148px] shadow-2xl backdrop-blur-md z-50">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Quality
          </p>
          {QUALITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setOpen(false); onChange(opt.value); }}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-left
                          hover:bg-white/10 transition-colors
                          ${current === opt.value ? "text-violet-400" : "text-white/80"}`}
            >
              <span className="text-xs font-medium">{opt.label}</span>
              <span className="text-[10px] text-white/35 ml-2">{opt.desc}</span>
              {current === opt.value && <Check className="w-3 h-3 text-violet-400 ml-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VideoPlayer({ videoId, onProgress }: VideoPlayerProps) {
  const { openPremiumModal } = useUIStore();
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const [isSwitchingQuality, setIsSwitchingQuality] = useState(false);

  // Quality: "auto" reads from localStorage and falls back to getQualityHint on first fetch.
  const [quality, setQuality] = useState<QualityLevel>(() => {
    if (typeof window === "undefined") return "auto";
    return (localStorage.getItem("pvod_quality") as QualityLevel) ?? "auto";
  });

  const lastSaveTime      = useRef<number>(0);
  const playerRef         = useRef<CloudinaryVideoPlayer | null>(null);
  const videoRef          = useRef<HTMLVideoElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  // Track live playback position so quality switches resume at the correct timestamp.
  const liveTimestampRef  = useRef<number>(0);
  // After quality switch for CldVideoPlayer, seek to this position once src loads.
  const seekAfterLoadRef  = useRef<number>(0);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    const selectedQuality = quality;
    const resolvedQ: "low" | "medium" | "high" =
      selectedQuality === "auto" ? getQualityHint() : selectedQuality;

    setLoading(true);
    setError(null);

    fetch(`/api/video/stream?id=${videoId}&quality=${resolvedQ}`)
      .then(async res => {
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403) { setAccessDenied(true); return; }
          throw new Error(data?.error || "Failed to load content");
        }
        const data = await res.json();
        if (!cancelled) setStreamData(data);
      })
      .catch(err => { if (!cancelled) setError(err.message || "Failed to load content"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // ── Quality switch handler ─────────────────────────────────────────────────
  const handleQualityChange = useCallback(async (newQuality: QualityLevel) => {
    if (newQuality === quality) return;

    const startAt = liveTimestampRef.current;
    setIsSwitchingQuality(true);

    const resolvedQ: "low" | "medium" | "high" =
      newQuality === "auto" ? getQualityHint() : newQuality;

    try {
      const res = await fetch(`/api/video/stream?id=${videoId}&quality=${resolvedQ}`);
      if (!res.ok) throw new Error("Quality switch failed");
      const data = await res.json();

      setQuality(newQuality);
      localStorage.setItem("pvod_quality", newQuality);

      // For CldVideoPlayer (single-file), seek to startAt after the player remounts.
      if (!data.isSegmented && data.mediaType === "video") {
        seekAfterLoadRef.current = startAt;
      }
      // Override lastTimestamp so segmented player resumes from live position.
      setStreamData({ ...data, lastTimestamp: startAt });
    } catch (err) {
      console.warn("Quality switch failed:", err);
    } finally {
      setIsSwitchingQuality(false);
    }
  }, [quality, videoId]);

  // After CldVideoPlayer remounts (src changes), seek to saved position.
  useEffect(() => {
    if (!streamData?.url || seekAfterLoadRef.current === 0) return;
    const seekTo = seekAfterLoadRef.current;
    seekAfterLoadRef.current = 0;

    const doSeek = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.readyState >= 1) {
        el.currentTime = seekTo;
      } else {
        el.addEventListener("loadedmetadata", () => { el.currentTime = seekTo; }, { once: true });
      }
    };

    // Give the player a tick to mount before seeking.
    const t = setTimeout(doSeek, 400);
    return () => clearTimeout(t);
  }, [streamData?.url]);

  // Throttled progress save
  const saveProgress = useCallback(
    async (currentTime: number, completed: boolean = false) => {
      liveTimestampRef.current = currentTime; // keep live position in sync
      const now = Date.now();
      if (now - lastSaveTime.current < 10_000 && !completed) return;
      lastSaveTime.current = now;

      try {
        await fetch("/api/video/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, timestamp: currentTime, isCompleted: completed }),
        });
        onProgress?.(currentTime);
      } catch (err) {
        console.warn("Failed to save video progress:", err);
      }
    },
    [videoId, onProgress]
  );

  // Attach timeupdate listener to the underlying <video> element for CldVideoPlayer.
  useEffect(() => {
    if (!streamData || streamData.mediaType !== "video" || streamData.isSegmented) return;

    let videoEl: HTMLVideoElement | null = null;

    function onTimeUpdate() {
      if (videoEl) saveProgress(videoEl.currentTime);
    }

    function attachIfFound(el: HTMLVideoElement) {
      videoEl = el;
      videoEl.addEventListener("timeupdate", onTimeUpdate);
    }

    if (videoRef.current) {
      attachIfFound(videoRef.current);
      return () => { videoEl?.removeEventListener("timeupdate", onTimeUpdate); };
    }

    const container = document.getElementById(`player-${videoId}`);
    if (!container) return;

    const observer = new MutationObserver(() => {
      const found = container.querySelector("video");
      if (found && !videoEl) {
        attachIfFound(found as HTMLVideoElement);
        observer.disconnect();
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      videoEl?.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [streamData, saveProgress, videoId]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsImageFullscreen(document.fullscreenElement === imageContainerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleImageFullscreen() {
    const el = imageContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement && typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen not available:", err);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="aspect-video w-full bg-muted rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Loading content…</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="aspect-video w-full bg-muted/50 rounded-xl flex items-center justify-center glass">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Premium Content</h3>
          <p className="text-muted-foreground max-w-sm">
            Purchase this item or subscribe to PremiumVOD to start viewing.
          </p>
          <div className="flex gap-3">
            <Button className="brand-gradient text-white" type="button" onClick={openPremiumModal}>
              View Plans
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !streamData) {
    return (
      <div className="aspect-video w-full bg-destructive/5 rounded-xl flex items-center justify-center border border-destructive/20">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-destructive font-medium">{error || "Failed to load content"}</p>
          <Button variant="outline" onClick={() => window.location.reload()} size="sm">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Segmented video path ──────────────────────────────────────────────────
  if (streamData.isSegmented && streamData.segments?.length) {
    return (
      <SegmentedVideoPlayer
        segments={streamData.segments}
        totalDuration={streamData.totalDuration || streamData.durationInSeconds || 0}
        lastTimestamp={streamData.lastTimestamp || 0}
        title={streamData.title}
        videoId={videoId}
        expiresAt={streamData.expiresAt}
        qualityHint={quality === "auto" ? getQualityHint() : quality}
        currentQuality={quality}
        onQualityChange={handleQualityChange}
        isSwitchingQuality={isSwitchingQuality}
        resolvedQualityLabel={streamData.qualityLabel}
        onProgress={(t, completed) => saveProgress(t, completed)}
      />
    );
  }

  // ── Image path ─────────────────────────────────────────────────────────────
  if (streamData.mediaType === "image") {
    return (
      <div
        className="relative w-full rounded-2xl overflow-hidden brand-glow border border-primary/30 ring-1 ring-white/10 shadow-2xl bg-black/40"
        onContextMenu={e => e.preventDefault()}
      >
        <div
          ref={imageContainerRef}
          className="relative aspect-video w-full bg-black"
          onContextMenu={e => e.preventDefault()}
        >
          <Image
            src={streamData.url!}
            alt={streamData.title || "Premium image"}
            fill
            className="object-contain select-none"
            sizes="(max-width: 1024px) 100vw, 66vw"
            unoptimized
            draggable={false}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute top-3 right-3 z-10 bg-black/60 text-white border border-white/20 hover:bg-black/75"
            onClick={toggleImageFullscreen}
            title={isImageFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isImageFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isImageFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // ── Single-file HLS path (CldVideoPlayer) ─────────────────────────────────
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden brand-glow border border-primary/30 ring-1 ring-white/10 shadow-2xl bg-black"
      onContextMenu={e => e.preventDefault()}
    >
      {/* Quality switching shimmer bar */}
      {isSwitchingQuality && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden">
          <div
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-violet-400 to-transparent"
            style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
          />
          <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
        </div>
      )}

      {/* Quality picker overlay — top-right corner */}
      <div className="absolute top-3 right-3 z-40">
        <QualityPicker
          current={quality}
          onChange={handleQualityChange}
          resolvedLabel={streamData.qualityLabel}
        />
      </div>

      <CldVideoPlayer
        key={`${videoId}-${quality}`}
        id={`player-${videoId}`}
        width="1920"
        height="1080"
        src={streamData.url!}
        logo={false}
        colors={{ accent: "#FF4500", base: "#1a1a2e", text: "#ffffff" }}
        autoplay={false}
        playerRef={playerRef}
        videoRef={videoRef}
        onEnded={() => { saveProgress(streamData.durationInSeconds, true); }}
      />
    </div>
  );
}