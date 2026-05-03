/**
 * screen-capture-guard.ts
 *
 * Production-grade, multi-layer screen-capture protection — mobile-safe.
 *
 * Every API call is wrapped in try/catch and existence-checked so the module
 * NEVER throws on mobile browsers (iOS Safari, Android Chrome, Samsung Internet)
 * where APIs like getDisplayMedia and MediaRecorder may not exist.
 *
 * LAYERS
 *  1A  Poison getDisplayMedia  → returns 1×1 black stream
 *  1B  Poison getUserMedia screen-share paths → black stream
 *  1C  Proxy MediaRecorder constructor (desktop only, skipped where unsupported)
 *  2   hardenVideoElement: PiP off, AirPlay off, no native download controls
 *  3   Visibility lock + keyboard heuristics (in ScreenProtector component)
 *  4   Moving forensic watermark (in ScreenProtector component)
 *  5   CSS isolation / stacking context (in ScreenProtector component)
 *
 * NOTE ON CANVAS PATCHING:
 *   We intentionally do NOT patch CanvasRenderingContext2D.drawImage.
 *   That approach breaks the Cloudinary/HLS.js player's internal canvas
 *   thumbnail and buffer-management operations on Android/iOS, causing the
 *   "This page couldn't load" crash. The forensic watermark + visibility
 *   shield covers the same threat model without side-effects.
 */

// ─── Black-frame stream factory ──────────────────────────────────────────────
// Returns a MediaStream with a 1×1 black video track + silent audio track.
// Called when a recorder tries to capture the screen via browser APIs.
function createBlackStream(): MediaStream {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1, 1); }

    // captureStream is available in Chrome/Firefox/Edge; not in iOS Safari
    const captureStream = (canvas as any).captureStream;
    if (typeof captureStream !== "function") return new MediaStream();

    const videoTrack: MediaStreamTrack | undefined =
      captureStream.call(canvas, 1)?.getVideoTracks?.()?.[0];

    const tracks: MediaStreamTrack[] = [];
    if (videoTrack) tracks.push(videoTrack);

    // Silent audio via AudioContext (may be blocked on mobile — graceful fallback)
    try {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) tracks.push(audioTrack);
    } catch { /* AudioContext unavailable — video-only black stream is fine */ }

    return new MediaStream(tracks);
  } catch {
    // Absolute last resort: empty stream (recorder gets no tracks at all)
    try { return new MediaStream(); } catch { return {} as MediaStream; }
  }
}

// ─── Module-level guard state ────────────────────────────────────────────────
let _installed = false;
let _originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | null = null;
let _originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | null = null;
let _MediaRecorderOriginal: typeof MediaRecorder | null = null;
const _pip_disabled_elements = new WeakSet<HTMLVideoElement>();
const _pip_abort_controllers: AbortController[] = [];

// ─── LAYER 1A — Poison getDisplayMedia ──────────────────────────────────────
// iOS Safari does not have getDisplayMedia at all.
// We check for its existence before touching it.
function _poisonGetDisplayMedia(): void {
  try {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getDisplayMedia !== "function") return;

    _originalGetDisplayMedia = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = async (_constraints?: DisplayMediaStreamOptions) => {
      // Return black stream — recorder starts but captures nothing
      return createBlackStream();
    };
  } catch (e) {
    // Silently swallow: some browsers mark mediaDevices as read-only
    console.warn("[ScreenGuard] Could not patch getDisplayMedia:", e);
  }
}

// ─── LAYER 1B — Poison getUserMedia screen-share paths ──────────────────────
// Only intercepts calls that explicitly request screen/display media.
// Camera and microphone requests are passed through normally.
function _poisonGetUserMedia(): void {
  try {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== "function") return;

    _originalGetUserMedia = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      // Firefox legacy screen-share uses video.mediaSource
      if (constraints && (constraints as any).video?.mediaSource) {
        return createBlackStream();
      }
      return _originalGetUserMedia!(constraints);
    };
  } catch (e) {
    console.warn("[ScreenGuard] Could not patch getUserMedia:", e);
  }
}

// ─── LAYER 1C — Proxy MediaRecorder constructor ──────────────────────────────
// Only applied where Proxy is available AND MediaRecorder exists.
// iOS Safari has neither, so this is effectively a no-op there.
function _poisonMediaRecorder(): void {
  try {
    if (typeof MediaRecorder === "undefined") return;
    if (typeof Proxy === "undefined") return;

    _MediaRecorderOriginal = MediaRecorder;

    (window as any).MediaRecorder = new Proxy(MediaRecorder, {
      construct(Target, args: ConstructorParameters<typeof MediaRecorder>) {
        try {
          const stream: MediaStream = args[0];
          const tracks = stream?.getTracks?.() ?? [];
          const isScreen = tracks.some((t) => {
            try {
              const label = t.label.toLowerCase();
              if (
                label.includes("screen") ||
                label.includes("display") ||
                label.includes("monitor") ||
                label.includes("window")
              ) return true;
              // Chrome 107+ exposes displaySurface on getSettings()
              if ((t as any).getSettings?.()?.displaySurface !== undefined) return true;
            } catch { /* getSettings() not supported */ }
            return false;
          });

          if (isScreen) {
            const blackStream = createBlackStream();
            return new Target(blackStream, args[1]);
          }
        } catch { /* track inspection failed — fall through to original */ }

        return new Target(...args);
      },
    });
  } catch (e) {
    console.warn("[ScreenGuard] Could not proxy MediaRecorder:", e);
  }
}

// ─── LAYER 2 — Harden individual <video> elements ────────────────────────────
// Safe to call on any browser, including iOS Safari.
export function hardenVideoElement(video: HTMLVideoElement): void {
  if (_pip_disabled_elements.has(video)) return;
  _pip_disabled_elements.add(video);

  // Picture-in-Picture (Chrome 70+, Firefox 116+)
  try {
    if (typeof video.disablePictureInPicture !== "undefined") {
      video.disablePictureInPicture = true;
    }
    video.setAttribute("disablepictureinpicture", "");
  } catch { /* read-only in some older WebViews */ }

  // controlslist (Chrome/Edge — not supported in Safari but harmless)
  try {
    video.setAttribute("controlslist", "nodownload noremoteplayback");
  } catch { /* ignore */ }

  // Mark as guarded (used for canvas taint detection if re-enabled later)
  try { video.dataset.pvGuarded = "1"; } catch { /* ignore */ }

  // AirPlay / remote playback (Safari 12+, Chrome for Android)
  try {
    if ((video as any).disableRemotePlayback !== undefined) {
      (video as any).disableRemotePlayback = true;
    }
    video.setAttribute("x-webkit-airplay", "deny");
  } catch { /* ignore */ }

  // Remove native controls (we render our own)
  try { video.removeAttribute("controls"); } catch { /* ignore */ }

  // Block PiP entry event
  const ac = new AbortController();
  _pip_abort_controllers.push(ac);

  try {
    video.addEventListener(
      "enterpictureinpicture",
      (e) => {
        e.preventDefault();
        try { document.exitPictureInPicture?.(); } catch { /* already exited */ }
      },
      { signal: ac.signal }
    );
    // Block iOS long-press context menu
    video.addEventListener(
      "contextmenu",
      (e) => e.preventDefault(),
      { signal: ac.signal }
    );
  } catch { /* event listeners not supported */ }
}

// ─── Install ─────────────────────────────────────────────────────────────────
export function installScreenCaptureGuard(): void {
  // Guard: only run in browser, only install once
  if (_installed || typeof window === "undefined") return;
  _installed = true;

  _poisonGetDisplayMedia();
  _poisonGetUserMedia();
  _poisonMediaRecorder();

  // Disable document.pictureInPictureEnabled globally (Chrome 70+)
  try {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      get: () => false,
      configurable: true,
    });
  } catch { /* already defined or non-configurable — harmless */ }
}

// ─── Uninstall ───────────────────────────────────────────────────────────────
export function uninstallScreenCaptureGuard(): void {
  if (!_installed || typeof window === "undefined") return;
  _installed = false;

  try {
    if (_originalGetDisplayMedia && navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = _originalGetDisplayMedia;
    }
  } catch { /* ignore */ } finally { _originalGetDisplayMedia = null; }

  try {
    if (_originalGetUserMedia && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = _originalGetUserMedia;
    }
  } catch { /* ignore */ } finally { _originalGetUserMedia = null; }

  try {
    if (_MediaRecorderOriginal) {
      (window as any).MediaRecorder = _MediaRecorderOriginal;
    }
  } catch { /* ignore */ } finally { _MediaRecorderOriginal = null; }

  // Abort all PiP event listeners
  _pip_abort_controllers.forEach((ac) => { try { ac.abort(); } catch { /* ignore */ } });
  _pip_abort_controllers.length = 0;
}
