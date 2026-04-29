"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Loader2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SegmentInfo {
  index:    number;
  url:      string;
  duration: number; // seconds — hint from Firestore, may be 0; actual comes from <video>
}

interface Props {
  segments:      SegmentInfo[];
  totalDuration: number;   // Firestore hint — may be 0; we compute from actual metadata
  lastTimestamp: number;
  onProgress?:  (globalTime: number, completed: boolean) => void;
  title?:        string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Build cumulative start-times array from per-segment durations. */
function buildCumulative(durations: number[]): number[] {
  const cum: number[] = [0];
  for (const d of durations) cum.push(cum[cum.length - 1] + d);
  return cum;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SegmentedVideoPlayer({
  segments, totalDuration: propTotal, lastTimestamp, onProgress, title,
}: Props) {
  const videoA      = useRef<HTMLVideoElement>(null);
  const videoB      = useRef<HTMLVideoElement>(null);
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

  // ── Actual per-segment durations learned from <video>.loadedmetadata ──────
  // Initialised from the Firestore hint; updated as each segment's metadata loads.
  const [actualDurations, setActualDurations] = useState<number[]>(
    () => segments.map(s => s.duration || 0)
  );

  // Derived totals — recomputed whenever actualDurations changes
  const cumulativeDurations = buildCumulative(actualDurations); // length = N+1
  const totalDuration = cumulativeDurations[cumulativeDurations.length - 1] || propTotal || 0;

  // Refs that callbacks can read without stale closure issues
  const cumulativeRef    = useRef<number[]>(cumulativeDurations);
  const totalDurRef      = useRef<number>(totalDuration);
  const currentSegRef    = useRef<number>(currentSeg);
  const segQueue         = useRef<number>(0);
  const progressSaveAt   = useRef<number>(0);
  const hideTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { cumulativeRef.current = cumulativeDurations; }, [actualDurations]); // eslint-disable-line
  useEffect(() => { totalDurRef.current   = totalDuration;        }, [totalDuration]);
  useEffect(() => { currentSegRef.current = currentSeg;           }, [currentSeg]);

  // ── Active / inactive video helpers ────────────────────────────────────────
  const getActive   = useCallback(() => activeRef === "A" ? videoA.current : videoB.current, [activeRef]);
  const getInactive = useCallback(() => activeRef === "A" ? videoB.current : videoA.current, [activeRef]);

  // ── loadedmetadata: record real duration for each segment ─────────────────
  // This is THE fix for the "duration shows 1s and grows" issue.
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

    let startSeg  = 0;
    let localTime = lastTimestamp;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (lastTimestamp >= cum[i]) { startSeg = i; localTime = lastTimestamp - cum[i]; break; }
    }

    const active = videoA.current!;
    active.src = segments[startSeg].url;
    active.onloadedmetadata = () => { onMetadata(startSeg, active); active.currentTime = localTime; };
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

  // ── Sync volume / mute ─────────────────────────────────────────────────────
  useEffect(() => {
    [videoA, videoB].forEach(r => {
      if (r.current) { r.current.volume = volume; r.current.muted = muted; }
    });
  }, [volume, muted]);

  // ── timeupdate ─────────────────────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const active = getActive();
    if (!active) return;
    const cum = cumulativeRef.current;
    const seg = currentSegRef.current;
    const gt  = (cum[seg] || 0) + active.currentTime;
    setGlobalTime(gt);

    // Trigger preload at 75% of actual segment duration
    const actualSegDur = active.duration; // from the live <video> element — always accurate
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

    // Save progress every 10 s
    const now = Date.now();
    if (now - progressSaveAt.current > 10_000) {
      progressSaveAt.current = now;
      onProgress?.(gt, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getActive, getInactive, segments, onProgress]);

  // ── ended: swap to pre-loaded next segment ────────────────────────────────
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
    inactive.play().catch(() => {});

    const afterNext = nextIdx + 1;
    if (afterNext < segments.length) {
      const oldActive = getActive()!;
      oldActive.src = segments[afterNext].url;
      oldActive.onloadedmetadata = () => onMetadata(afterNext, oldActive);
      segQueue.current = afterNext;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, getActive, getInactive, onProgress]);

  // ── Attach listeners ───────────────────────────────────────────────────────
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

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
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

  // ── Controls ──────────────────────────────────────────────────────────────
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
      active.onloadedmetadata = () => { onMetadata(segIdx, active); active.currentTime = localTime; if (wasPlaying) active.play().catch(() => {}); };
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
    const el = containerRef.current; if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar  = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - bar.left) / bar.width;
    seek(frac * (totalDurRef.current || 1));
  }

  // Derived progress fraction — safe when totalDuration is 0
  const progressFrac = totalDuration > 0 ? Math.min(globalTime / totalDuration, 1) : 0;
  const totalLabel   = totalDuration > 0 ? formatTime(totalDuration) : "--:--";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-2xl overflow-hidden select-none"
      style={{ aspectRatio: "16/9" }}
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Video A */}
      <video ref={videoA} className="absolute inset-0 w-full h-full object-contain"
        style={{ zIndex: activeRef === "A" ? 10 : 1, opacity: activeRef === "A" ? 1 : 0 }}
        playsInline preload="auto" crossOrigin="anonymous" />
      {/* Video B */}
      <video ref={videoB} className="absolute inset-0 w-full h-full object-contain"
        style={{ zIndex: activeRef === "B" ? 10 : 1, opacity: activeRef === "B" ? 1 : 0 }}
        playsInline preload="auto" crossOrigin="anonymous" />

      {/* Buffering */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20 }}>
          <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

      {/* Segment badge */}
      <div className="absolute top-3 left-3 text-[10px] font-mono text-white/50 bg-black/40 px-2 py-0.5 rounded" style={{ zIndex: 30 }}>
        {currentSeg + 1}/{segments.length}
      </div>

      {/* Controls overlay */}
      <div className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300"
        style={{ zIndex: 30, opacity: showControls || !playing ? 1 : 0 }}
        onClick={e => e.stopPropagation()}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        <div className="relative px-4 pb-4 space-y-2">
          {title && <p className="text-white text-sm font-medium truncate opacity-90 drop-shadow">{title}</p>}

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer group/bar" onClick={handleBarClick}>
            <div className="h-full bg-white rounded-full relative transition-none" style={{ width: `${progressFrac * 100}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
              {playing ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5" fill="white" />}
            </button>
            <button onClick={() => setMuted(v => !v)} className="text-white hover:text-white/80 transition-colors" title="Mute (M)">
              {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }}
              className="w-20 accent-white h-1 cursor-pointer" onClick={e => e.stopPropagation()} />

            {/* Time display — shows --:-- until actual duration is known */}
            <span className="text-white/80 text-xs font-mono ml-1">
              {formatTime(globalTime)} / {totalLabel}
            </span>

            <div className="flex-1" />

            <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors" title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
