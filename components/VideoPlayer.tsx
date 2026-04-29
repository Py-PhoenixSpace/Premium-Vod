"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CldVideoPlayer } from "next-cloudinary";
import "next-cloudinary/dist/cld-video-player.css";
import { Loader2, AlertCircle, Lock, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CloudinaryVideoPlayer } from "next-cloudinary";
import Image from "next/image";
import type { MediaType } from "@/types";
import { useUIStore } from "@/lib/stores/ui-store";
import SegmentedVideoPlayer, { type SegmentInfo } from "@/components/SegmentedVideoPlayer";

interface VideoPlayerProps {
  videoId: string;
  onProgress?: (timestamp: number) => void;
}

interface StreamData {
  url?:             string;         // single-file videos
  mediaType:        MediaType;
  lastTimestamp:    number;
  title:            string;
  description:      string;
  durationInSeconds: number;
  category:         string;
  // Segmented
  isSegmented?:     boolean;
  segments?:        SegmentInfo[];
  totalDuration?:   number;
}

export default function VideoPlayer({ videoId, onProgress }: VideoPlayerProps) {
  const { openPremiumModal } = useUIStore();
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);

  const lastSaveTime = useRef<number>(0);
  const playerRef = useRef<CloudinaryVideoPlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch signed stream URL on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchStream() {
      try {
        const res = await fetch(`/api/video/stream?id=${videoId}`);

        if (res.status === 403) {
          if (!cancelled) setAccessDenied(true);
          return;
        }

        if (!res.ok) throw new Error("Failed to load content");

        const data = await res.json();
        if (!cancelled) setStreamData(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStream();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Throttled progress save (at most once every 10 seconds)
  const saveProgress = useCallback(
    async (currentTime: number, completed: boolean = false) => {
      const now = Date.now();
      if (now - lastSaveTime.current < 10_000 && !completed) return;
      lastSaveTime.current = now;

      try {
        await fetch("/api/video/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            timestamp: currentTime,
            isCompleted: completed,
          }),
        });
        onProgress?.(currentTime);
      } catch (err) {
        console.warn("Failed to save video progress:", err);
      }
    },
    [videoId, onProgress]
  );

  /**
   * Attach timeupdate listener to the underlying <video> element.
   * Uses a MutationObserver on the player container to detect when
   * CldVideoPlayer actually mounts the <video> tag — avoids the fragile
   * setInterval polling pattern that was here before.
   */
  useEffect(() => {
    if (!streamData || streamData.mediaType !== "video") return;

    let videoEl: HTMLVideoElement | null = null;

    function onTimeUpdate() {
      if (videoEl) saveProgress(videoEl.currentTime);
    }

    function attachIfFound(el: HTMLVideoElement) {
      videoEl = el;
      videoEl.addEventListener("timeupdate", onTimeUpdate);
    }

    // If the video element is already in the ref (fast render), attach directly
    if (videoRef.current) {
      attachIfFound(videoRef.current);
      return () => {
        videoEl?.removeEventListener("timeupdate", onTimeUpdate);
      };
    }

    // Otherwise, watch for the <video> element to appear in the DOM
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
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function toggleImageFullscreen() {
    const el = imageContainerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        return;
      }

      if (!document.fullscreenElement && typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
        return;
      }

      window.open(streamData?.url || "", "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("Fullscreen not available for this browser:", err);
      window.open(streamData?.url || "", "_blank", "noopener,noreferrer");
    }
  }

  if (loading) {
    return (
      <div className="aspect-video w-full bg-muted rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Loading content...</p>
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
            Purchase this item or subscribe to PremiumVOD to start
            viewing.
          </p>
          <div className="flex gap-3">
            <Button
              className="brand-gradient text-white"
              type="button"
              onClick={openPremiumModal}
            >
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
          <p className="text-destructive font-medium">
            {error || "Failed to load content"}
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            size="sm"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Segmented video path ───────────────────────────────────────────────
  if (streamData.isSegmented && streamData.segments?.length) {
    return (
      <SegmentedVideoPlayer
        segments={streamData.segments}
        totalDuration={streamData.totalDuration || streamData.durationInSeconds || 0}
        lastTimestamp={streamData.lastTimestamp || 0}
        title={streamData.title}
        onProgress={(t, completed) => saveProgress(t, completed)}
      />
    );
  }

  if (streamData.mediaType === "image") {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden brand-glow border border-primary/30 ring-1 ring-white/10 shadow-2xl bg-black/40">
        <div
          ref={imageContainerRef}
          className="relative aspect-video w-full bg-black"
          onContextMenuCapture={(e) => e.preventDefault()}
        >
          <Image
            src={streamData.url!}
            alt={streamData.title || "Premium image"}
            fill
            className="object-contain"
            sizes="(max-width: 1024px) 100vw, 66vw"
            unoptimized
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
            {isImageFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden brand-glow border border-primary/30 ring-1 ring-white/10 shadow-2xl bg-black"
      onContextMenuCapture={(e) => e.preventDefault()}
    >
      <CldVideoPlayer
        id={`player-${videoId}`}
        width="1920"
        height="1080"
        src={streamData.url!}
        logo={false}
        colors={{
          accent: "#FF4500",
          base: "#1a1a2e",
          text: "#ffffff",
        }}
        autoplay={false}
        playerRef={playerRef}
        videoRef={videoRef}
        onEnded={() => {
          saveProgress(streamData.durationInSeconds, true);
        }}
      />
    </div>
  );
}