"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Loader2 } from "lucide-react";

export interface SegmentInfo {
  index:    number;
  url:      string;
  duration: number;
}

interface Props {
  segments:      SegmentInfo[];
  totalDuration: number;
  lastTimestamp: number;
  onProgress?:  (globalTime: number, completed: boolean) => void;
  title?:        string;
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildCumulative(durations: number[]): number[] {
  const cum: number[] = [0];
  for (const d of durations) cum.push(cum[cum.length - 1] + d);
  return cum;
}

/** iOS Safari only supports fullscreen on <video> elements, not <div> wrappers. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function SegmentedVideoPlayer({
  segments, totalDuration: propTotal, lastTimestamp, onProgress, title,
}: Props) {
  const videoA       = useRef<HTMLVideoElement>(null);
  const videoB       = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeRef, setActiveRef]       = useState<"A" | "B">("A");
  const [currentSeg, setCurrentSeg]     = useState(0);
  const [playing, setPlaying]           = useState(false);
  const [muted, setMuted]               = useState(false);
  const [volume, setVolume]             = useState(1);
  const [globalTime, setGlobalTime]     = useState(lastTimestamp || 0);
  const [buffering, setBuffering]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isMobile, setIsMobile]         = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMobile(isIOS() || /Mobi|Android/i.test(navigator.userAgent));
    }
  }, []);

  const [actualDurations, setActualDurations] = useState<number[]>(
    () => segments.map(s => s.duration || 0)
  );

  const cumulativeDurations = buildCumulative(actualDurations);
  const totalDuration = cumulativeDurations[cumulativeDurations.length - 1] || propTotal || 0;

  const cumulativeRef  = useRef<number[]>(cumulativeDurations);
  const totalDurRef    = useRef<number>(totalDuration);
  const currentSegRef  = useRef<number>(currentSeg);
  const segQueue       = useRef<number>(0);
  const progressSaveAt = useRef<number>(0);
  const hideTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { cumulativeRef.current = cumulativeDurations; }, [actualDurations]); // eslint-disable-line
  useEffect(() => { totalDurRef.current   = totalDuration;        }, [totalDuration]);
  useEffect(() => { currentSegRef.current = currentSeg;           }, [currentSeg]);

  const getActive   = useCallback(() => activeRef === "A" ? videoA.current : videoB.current, [activeRef]);
  const getInactive = useCallback(() => activeRef === "A" ? videoB.current : videoA.current, [activeRef]);

  function onMetadata(segIdx: number, el: HTMLVideoElement) {
    const d = el.duration;
    if (isFinite(d) && d > 0) {
      setActualDurations(prev => {
        const next = [...prev];
        next[segIdx] = d;
        return next;
      });
    }
  }

  // ── Initial load & resume ──────────────────────────────────────────────────
  useEffect(() => {
    if (!segments.length) return;
    const cum = buildCumulative(segments.map(s => s.duration || 0));
    let startSeg = 0, localTime = lastTimestamp;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (lastTimestamp >= cum[i]) { startSeg = i; localTime = lastTimestamp - cum[i]; break; }
    }
    const active = videoA.current!;
    active.src = segments[startSeg].url;
    active.onloadedmetadata = () => {
      onMetadata(startSeg, active);
      active.currentTime = localTime;
    };
    setCurrentSeg(startSeg);
    currentSegRef.current = startSeg;
    segQueue.current = startSeg;

    if (startSeg + 1 < segments.length) {
      const inactive = videoB.current!;
      inactive.src = segments[startSeg + 1].url;
      inactive.onloadedmetadata = () => onMetadata(startSeg + 1, inactive);
      segQueue.current = startSeg + 1;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    [videoA, videoB].forEach(r => {
      if (r.current) { r.current.volume = volume; r.current.muted = muted; }
    });
  }, [volume, muted]);

  // ── timeupdate ─────────────────────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const active = getActive(); if (!active) return;
    const cum = cumulativeRef.current;
    const seg = currentSegRef.current;
    const gt  = (cum[seg] || 0) + active.currentTime;
    setGlobalTime(gt);

    const actualSegDur = active.duration;
    const nextIdx = seg + 1;
    if (
      isFinite(actualSegDur) && actualSegDur > 0 &&
      active.currentTime / actualSegDur > 0.75 &&
      nextIdx < segments.length &&
      segQueue.current < nextIdx
    ) {
      const inactive = getInactive();
      if (inactive) {
        inactive.src = segments[nextIdx].url;
        inactive.onloadedmetadata = () => onMetadata(nextIdx, inactive);
        segQueue.current = nextIdx;
      }
    }

    const now = Date.now();
    if (now - progressSaveAt.current > 10_000) {
      progressSaveAt.current = now;
      onProgress?.(gt, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getActive, getInactive, segments, onProgress]);

  // ── ended: swap to next segment ───────────────────────────────────────────
  const handleEnded = useCallback(() => {
    const seg     = currentSegRef.current;
    const nextIdx = seg + 1;

    if (nextIdx >= segments.length) {
      setPlaying(false);
      onProgress?.(totalDurRef.current, true);
      return;
    }

    const inactive = getInactive()!;
    if (!inactive.src || inactive.src !== segments[nextIdx].url) {
      inactive.src = segments[nextIdx].url;
      inactive.onloadedmetadata = () => onMetadata(nextIdx, inactive);
    }
    inactive.currentTime = 0;

    setActiveRef(prev => prev === "A" ? "B" : "A");
    setCurrentSeg(nextIdx);
    currentSegRef.current = nextIdx;
    segQueue.current = nextIdx;

    // Use a small delay for iOS — it needs a tick before play() after src swap
    setTimeout(() => { inactive.play().catch(() => {}); }, 50);

    const afterNext = nextIdx + 1;
    if (afterNext < segments.length) {
      const oldActive = getActive()!;
      oldActive.src = segments[afterNext].url;
      oldActive.onloadedmetadata = () => onMetadata(afterNext, oldActive);
      segQueue.current = afterNext;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, getActive, getInactive, onProgress]);

  // ── Event listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onPlay    = () => setPlaying(true);
    const onPause   = () => setPlaying(false);

    [videoA, videoB].forEach(r => {
      const el = r.current; if (!el) return;
      el.addEventListener("timeupdate", handleTimeUpdate);
      el.addEventListener("ended",      handleEnded);
      el.addEventListener("waiting",    onWaiting);
      el.addEventListener("playing",    onPlaying);
      el.addEventListener("play",       onPlay);
      el.addEventListener("pause",      onPause);
    });
    return () => {
      [videoA, videoB].forEach(r => {
        const el = r.current; if (!el) return;
        el.removeEventListener("timeupdate", handleTimeUpdate);
        el.removeEventListener("ended",      handleEnded);
        el.removeEventListener("waiting",    onWaiting);
        el.removeEventListener("playing",    onPlaying);
        el.removeEventListener("play",       onPlay);
        el.removeEventListener("pause",      onPause);
      });
    };
  }, [handleTimeUpdate, handleEnded]);

  // ── Fullscreen change listener (standard + webkit) ─────────────────────────
  useEffect(() => {
    const onChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.webkitCurrentFullScreenElement
      ));
    };
    // iOS fires webkitbeginfullscreen / webkitendfullscreen on the <video> element
    const onBegin = () => setIsFullscreen(true);
    const onEnd   = () => setIsFullscreen(false);

    document.addEventListener("fullscreenchange",       onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    videoA.current?.addEventListener("webkitbeginfullscreen", onBegin);
    videoA.current?.addEventListener("webkitendfullscreen",   onEnd);
    videoB.current?.addEventListener("webkitbeginfullscreen", onBegin);
    videoB.current?.addEventListener("webkitendfullscreen",   onEnd);

    return () => {
      document.removeEventListener("fullscreenchange",       onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      videoA.current?.removeEventListener("webkitbeginfullscreen", onBegin);
      videoA.current?.removeEventListener("webkitendfullscreen",   onEnd);
      videoB.current?.removeEventListener("webkitbeginfullscreen", onBegin); // eslint-disable-line react-hooks/exhaustive-deps
      videoB.current?.removeEventListener("webkitendfullscreen",   onEnd);   // eslint-disable-line react-hooks/exhaustive-deps
    };
  }, []);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowRight") { e.preventDefault(); seek(globalTime + 10); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); seek(Math.max(0, globalTime - 10)); }
      if (e.key === "m") setMuted(v => !v);
      if (e.key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalTime]);

  // ── Controls ───────────────────────────────────────────────────────────────
  function togglePlay() {
    const active = getActive(); if (!active) return;
    if (active.paused) { active.play().catch(() => {}); }
    else               { active.pause(); }
  }

  function seek(targetGlobal: number) {
    const cum     = cumulativeRef.current;
    const total   = totalDurRef.current;
    const clamped = Math.max(0, Math.min(targetGlobal, total || targetGlobal));
    let segIdx = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (clamped >= (cum[i] || 0)) { segIdx = i; break; }
    }
    const localTime = clamped - (cum[segIdx] || 0);

    if (segIdx === currentSegRef.current) {
      const active = getActive();
      if (active) active.currentTime = localTime;
    } else {
      const active   = getActive()!;
      const inactive = getInactive()!;
      const wasPlaying = !active.paused;
      active.src = segments[segIdx].url;
      active.onloadedmetadata = () => {
        onMetadata(segIdx, active);
        active.currentTime = localTime;
        if (wasPlaying) active.play().catch(() => {});
      };
      const nextIdx = segIdx + 1;
      if (nextIdx < segments.length) {
        inactive.src = segments[nextIdx].url;
        inactive.onloadedmetadata = () => onMetadata(nextIdx, inactive);
        segQueue.current = nextIdx;
      }
      setCurrentSeg(segIdx);
      currentSegRef.current = segIdx;
    }
    setGlobalTime(clamped);
  }

  function toggleFullscreen() {
    const doc = document as any;
    const isFs = !!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.webkitCurrentFullScreenElement
    );

    if (isIOS()) {
      // iOS: fullscreen must be called on the active <video> element
      const activeVid = getActive() as any;
      if (!activeVid) return;
      if (isFs || activeVid.webkitDisplayingFullscreen) {
        if (activeVid.webkitExitFullscreen) activeVid.webkitExitFullscreen();
      } else {
        if (activeVid.webkitEnterFullscreen) activeVid.webkitEnterFullscreen();
      }
      return;
    }

    // Standard + webkit-prefixed for Android/desktop
    const el = containerRef.current as any;
    if (!el) return;
    if (isFs) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } else {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar  = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - bar.left) / bar.width;
    seek(frac * (totalDurRef.current || 1));
  }

  // Touch seek support for mobile progress bar
  function handleBarTouch(e: React.TouchEvent<HTMLDivElement>) {
    e.stopPropagation();
    const bar  = e.currentTarget.getBoundingClientRect();
    const frac = (e.touches[0].clientX - bar.left) / bar.width;
    seek(Math.max(0, Math.min(1, frac)) * (totalDurRef.current || 1));
  }

  const progressFrac = totalDuration > 0 ? Math.min(globalTime / totalDuration, 1) : 0;
  const totalLabel   = totalDuration > 0 ? formatTime(totalDuration) : "--:--";

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-2xl overflow-hidden select-none"
      style={{ aspectRatio: "16/9" }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={togglePlay}
      onContextMenu={e => e.preventDefault()}
    >
      {/*
        NOTE: crossOrigin is intentionally omitted.
        Setting crossOrigin="anonymous" triggers a CORS preflight on every
        Cloudinary signed URL — and on iOS Safari those preflights fail,
        preventing the video from loading entirely.
        We don't need canvas read-access, so CORS is unnecessary here.

        webkit-playsinline + playsInline are both set for max iOS compat.
      */}
      <video ref={videoA}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ zIndex: activeRef === "A" ? 10 : 1, opacity: activeRef === "A" ? 1 : 0 }}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
      />
      <video ref={videoB}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ zIndex: activeRef === "B" ? 10 : 1, opacity: activeRef === "B" ? 1 : 0 }}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
      />

      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20 }}>
          <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

      <div className="absolute top-3 left-3 text-[10px] font-mono text-white/50 bg-black/40 px-2 py-0.5 rounded" style={{ zIndex: 30 }}>
        {currentSeg + 1}/{segments.length}
      </div>

      {/* Controls overlay */}
      <div
        className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none"
        style={{ zIndex: 30, opacity: showControls || !playing ? 1 : 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        <div className="relative px-4 pb-4 space-y-2 pointer-events-auto" onClick={e => e.stopPropagation()}>
          {title && <p className="text-white text-sm font-medium truncate opacity-90 drop-shadow">{title}</p>}

          {/* Progress bar — tall touch target on mobile */}
          <div
            className="w-full rounded-full cursor-pointer group/bar flex items-center"
            style={{ height: isMobile ? "20px" : "12px", padding: isMobile ? "8px 0" : "4px 0" }}
            onClick={handleBarClick}
            onTouchStart={handleBarTouch}
            onTouchMove={handleBarTouch}
          >
            <div className="w-full h-1.5 bg-white/20 rounded-full relative">
              <div className="h-full bg-white rounded-full relative transition-none" style={{ width: `${progressFrac * 100}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
              {playing ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5" fill="white" />}
            </button>

            {/* Volume — hidden on iOS (iOS ignores programmatic volume control) */}
            {!isMobile && (
              <>
                <button onClick={() => setMuted(v => !v)} className="text-white hover:text-white/80 transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }}
                  className="w-20 accent-white h-1 cursor-pointer" onClick={e => e.stopPropagation()} />
              </>
            )}

            <span className="text-white/80 text-xs font-mono ml-1">
              {formatTime(globalTime)} / {totalLabel}
            </span>

            <div className="flex-1" />

            <button
              onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white hover:text-white/80 transition-colors p-1"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
