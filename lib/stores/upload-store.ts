import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────
export type UploadPhase =
  | "idle"
  | "splitting"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export interface GlobalUploadState {
  // Status
  phase:         UploadPhase;
  title:         string;         // video title being uploaded
  // Progress
  overallPct:    number;         // 0-100
  bytesUploaded: number;
  totalBytes:    number;
  speedMBps:     number;
  etaSec:        number;
  segDone:       number;
  segTotal:      number;
  // Result
  errorMsg:      string;
  // Whether the FAB is minimised by the user
  minimised:     boolean;

  // Actions
  start:         (title: string, totalBytes: number) => void;
  setSplitting:  (segDone: number, segTotal: number) => void;
  setProgress:   (opts: { overallPct: number; bytesUploaded: number; speedMBps: number; etaSec: number; segDone: number; segTotal: number }) => void;
  setFinalizing: () => void;
  setDone:       () => void;
  setError:      (msg: string) => void;
  reset:         () => void;
  toggleMinimise:() => void;
  // Cancel
  setCancelFn:   (fn: (() => void) | null) => void;
  cancel:        () => void;
}

const IDLE: Omit<GlobalUploadState, "start"|"setSplitting"|"setProgress"|"setFinalizing"|"setDone"|"setError"|"reset"|"toggleMinimise"|"setCancelFn"|"cancel"> = {
  phase: "idle", title: "", overallPct: 0,
  bytesUploaded: 0, totalBytes: 0,
  speedMBps: 0, etaSec: 0,
  segDone: 0, segTotal: 0,
  errorMsg: "", minimised: false,
};

// Module-level ref — lives outside the store so it never triggers re-renders
let _cancelFn: (() => void) | null = null;

export const useUploadStore = create<GlobalUploadState>((set) => ({
  ...IDLE,

  start: (title, totalBytes) =>
    set({ ...IDLE, title, totalBytes, phase: "uploading" }),

  setSplitting: (segDone, segTotal) =>
    set({ phase: "splitting", segDone, segTotal }),

  setProgress: (opts) =>
    set({ phase: "uploading", ...opts }),

  setFinalizing: () =>
    set({ phase: "finalizing", overallPct: 100 }),

  setDone: () =>
    set({ phase: "done", overallPct: 100, etaSec: 0, speedMBps: 0 }),

  setError: (errorMsg) =>
    set({ phase: "error", errorMsg }),

  reset: () => set({ ...IDLE }),

  toggleMinimise: () =>
    set((s) => ({ minimised: !s.minimised })),

  // Cancel: call the stored abort function then reset
  setCancelFn: (fn) => { _cancelFn = fn; },
  cancel: () => { _cancelFn?.(); _cancelFn = null; },
}));
