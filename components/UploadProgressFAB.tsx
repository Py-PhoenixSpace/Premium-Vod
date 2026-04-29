"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, CheckCircle, AlertCircle, Loader2, Scissors, X, GripVertical, Square } from "lucide-react";
import { useUploadStore } from "@/lib/stores/upload-store";

type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const CORNER_STYLES: Record<Corner, string> = {
  "bottom-right": "bottom-5 right-5",
  "bottom-left":  "bottom-5 left-5",
  "top-right":    "top-5 right-5",
  "top-left":     "top-5 left-5",
};

function formatBytes(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)}MB`;
  return `${(b / 1024).toFixed(0)}KB`;
}

export function UploadProgressFAB() {
  const {
    phase, overallPct, bytesUploaded, totalBytes,
    speedMBps, etaSec, errorMsg, reset, cancel,
  } = useUploadStore();

  const [corner, setCorner] = useState<Corner>("bottom-right");
  const dragRef = useRef(false);

  // Tab-close warning
  useEffect(() => {
    const active = phase === "splitting" || phase === "uploading" || phase === "finalizing";
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  if (phase === "idle") return null;

  const active = phase === "splitting" || phase === "uploading" || phase === "finalizing";
  const done   = phase === "done";
  const error  = phase === "error";

  const icon = phase === "splitting"
    ? <Scissors className="w-3 h-3 text-amber-400 animate-pulse" />
    : active
    ? <Loader2  className="w-3 h-3 text-primary animate-spin" />
    : done
    ? <CheckCircle className="w-3 h-3 text-green-400" />
    : <AlertCircle className="w-3 h-3 text-destructive" />;

  const etaLabel = etaSec > 0
    ? (etaSec < 60 ? `${etaSec}s` : `${Math.ceil(etaSec / 60)}m`)
    : null;

  // Cycle corner on grip drag/click
  const corners: Corner[] = ["bottom-right", "bottom-left", "top-left", "top-right"];
  function cycleCorner() {
    if (dragRef.current) return;
    setCorner(c => corners[(corners.indexOf(c) + 1) % corners.length]);
  }

  return (
    <div
      className={`fixed z-[200] ${CORNER_STYLES[corner]}`}
      style={{ maxWidth: 220 }}
    >
      <div className={`
        flex items-center gap-2 rounded-full px-3 py-1.5
        border shadow-lg backdrop-blur-xl text-xs
        ${done  ? "border-green-500/30 bg-green-950/90 text-green-300" :
          error ? "border-destructive/30 bg-red-950/90 text-red-300"   :
                  "border-primary/20 bg-background/95 text-foreground"}
      `}>
        {/* Drag handle — click cycles corner */}
        <button
          onMouseDown={() => { dragRef.current = false; }}
          onClick={cycleCorner}
          className="shrink-0 opacity-40 hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing"
          title="Click to move"
        >
          <GripVertical className="w-3 h-3" />
        </button>

        {/* Icon */}
        <span className="shrink-0">{icon}</span>

        {/* Content */}
        {active && (
          <>
            <div className="flex-1 min-w-0">
              {/* Thin progress bar */}
              <div className="h-1 bg-white/10 rounded-full overflow-hidden w-full">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    phase === "splitting"
                      ? "bg-amber-400"
                      : "bg-gradient-to-r from-primary to-violet-400"
                  }`}
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
            <span className="font-mono font-bold shrink-0">{overallPct}%</span>
            {etaLabel && (
              <span className="text-muted-foreground shrink-0">{etaLabel}</span>
            )}
            {/* Stop button */}
            <button
              onClick={(e) => { e.stopPropagation(); cancel(); }}
              title="Stop upload"
              className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors"
            >
              <Square className="w-2.5 h-2.5 text-red-400 fill-red-400" />
            </button>
          </>
        )}

        {done && (
          <>
            <span className="font-medium truncate">Done!</span>
            <Link href="/admin/videos" onClick={reset} className="shrink-0 underline underline-offset-2 hover:text-green-200">
              View
            </Link>
          </>
        )}

        {error && (
          <>
            <span className="truncate">{errorMsg.slice(0, 24) || "Failed"}</span>
          </>
        )}

        {/* Dismiss */}
        {(done || error) && (
          <button onClick={reset} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Speed & bytes — only shown when active & uploading, as a tiny line below */}
      {(phase === "uploading" || phase === "finalizing") && totalBytes > 0 && (
        <div className="flex justify-between text-[9px] text-muted-foreground px-3 mt-0.5">
          <span className="font-mono">{formatBytes(bytesUploaded)}/{formatBytes(totalBytes)}</span>
          {speedMBps > 0 && <span className="font-mono text-primary">{speedMBps}MB/s</span>}
        </div>
      )}
    </div>
  );
}
