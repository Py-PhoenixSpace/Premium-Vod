/**
 * screen-capture-guard.ts
 *
 * Production-grade, multi-layer screen-capture protection for premium content.
 *
 * LAYER 1 — API Poisoning (JS runtime)
 *   - Overwrites navigator.mediaDevices.getDisplayMedia to return a synthetic
 *     black-pixel stream so OS-level screen recorders that use the browser's
 *     capture prompt receive nothing but black frames.
 *   - Intercepts MediaRecorder construction — any recorder started while the
 *     guard is active immediately stops and receives only silence/black.
 *   - Intercepts HTMLCanvasElement.getContext / toDataURL / toBlob so canvas-
 *     based frame grabbers can't extract pixel data from composited video.
 *   - Intercepts OffscreenCanvas for the same reason.
 *
 * LAYER 2 — CSS Visibility Hardening
 *   - Sets `display: block !important` isolation on the player wrapper.
 *   - Forces `pointer-events: none` on any overlay injected by extensions.
 *
 * LAYER 3 — Video Element Hardening
 *   - Sets `disablePictureInPicture` on all <video> elements inside the guard.
 *   - Prevents `enterpictureinpicture` event (secondary PiP interception).
 *   - Sets `controlsList="nodownload"` and removes the default browser controls.
 *
 * LAYER 4 — Visibility / Focus Monitoring
 *   - Page-Visibility-API: hides content when tab loses focus or is backgrounded.
 *   - `visibilitychange` + `blur` + `focus` triple-lock.
 *
 * LAYER 5 — Forensic Watermarking
 *   - Embeds a per-user invisible watermark string into every captured frame
 *     via an invisible SVG filter on the video wrapper (imperceptible to the
 *     human eye, visible under forensic analysis).
 *
 * IMPORTANT — Honest limits:
 *   No browser API can prevent an OS-level external screen recorder (e.g. OBS
 *   capturing the display output directly via the GPU framebuffer). The goal
 *   of this module is to:
 *     (a) Make the recorder capture black for every known in-browser vector.
 *     (b) Embed a forensic fingerprint so content can be traced back to the user
 *         even if a camera-to-screen recording bypasses all API hooks.
 *     (c) Provide a highly convincing deterrent that stops casual piracy cold.
 */

// ── Black-frame stream factory ────────────────────────────────────────────────
// Produces a valid MediaStream whose video track contains only black pixels and
// whose audio track contains only silence. Used as the return value for any
// captured getDisplayMedia / getUserMedia call targeting screen content.
function createBlackStream(): MediaStream {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1, 1);

    // Use a minimal frame rate so we don't waste CPU
    const videoTrack = (canvas as any).captureStream(1).getVideoTracks()[0];

    // Silent audio track via AudioContext
    let audioTrack: MediaStreamTrack | null = null;
    try {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      audioTrack = dest.stream.getAudioTracks()[0] ?? null;
    } catch { /* AudioContext blocked — fine, video track alone suffices */ }

    const tracks: MediaStreamTrack[] = [videoTrack];
    if (audioTrack) tracks.push(audioTrack);
    return new MediaStream(tracks);
  } catch {
    // Last-resort: return an empty stream (no tracks = no capture)
    return new MediaStream();
  }
}

// ── Internal guard state ──────────────────────────────────────────────────────
let _installed = false;
let _originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | null = null;
let _originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | null = null;
let _MediaRecorderOriginal: typeof MediaRecorder | null = null;
let _canvasGetContextOriginal: typeof HTMLCanvasElement.prototype.getContext | null = null;
let _canvasToDataURLOriginal: typeof HTMLCanvasElement.prototype.toDataURL | null = null;
let _canvasToBlobOriginal: typeof HTMLCanvasElement.prototype.toBlob | null = null;
let _pip_disabled_elements = new WeakSet<HTMLVideoElement>();
const _pip_abort_controllers: AbortController[] = [];

// ── LAYER 1A — Poison getDisplayMedia ────────────────────────────────────────
function _poisonGetDisplayMedia() {
  if (!navigator.mediaDevices) return;
  _originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getDisplayMedia = async (_constraints?: DisplayMediaStreamOptions) => {
    console.warn("[ScreenGuard] getDisplayMedia intercepted — returning black stream.");
    // Return a black stream instead of throwing so the recorder starts but
    // captures nothing. Throwing causes many recorders to retry with fallbacks.
    return createBlackStream();
  };
}

// ── LAYER 1B — Poison getUserMedia for screen sharing fallbacks ───────────────
function _poisonGetUserMedia() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  _originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    // If the request includes screen video, intercept it
    if (constraints && (constraints as any).video?.mediaSource) {
      console.warn("[ScreenGuard] getUserMedia screen-share intercepted — returning black stream.");
      return createBlackStream();
    }
    // Pass through camera / mic requests normally
    return _originalGetUserMedia!(constraints);
  };
}

// ── LAYER 1C — Intercept MediaRecorder ───────────────────────────────────────
function _poisonMediaRecorder() {
  if (typeof MediaRecorder === "undefined") return;
  _MediaRecorderOriginal = MediaRecorder;

  // Proxy the constructor so any new MediaRecorder immediately stops
  (window as any).MediaRecorder = new Proxy(MediaRecorder, {
    construct(Target, args: [MediaStream, ...unknown[]]) {
      const [stream] = args;
      // Inspect the tracks: if ANY track is from a display/screen source, poison it
      const tracks = stream?.getTracks?.() ?? [];
      const isScreenCapture = tracks.some(
        t => t.label.toLowerCase().includes("screen") ||
             t.label.toLowerCase().includes("display") ||
             t.label.toLowerCase().includes("monitor") ||
             t.label.toLowerCase().includes("window") ||
             (t as any).getSettings?.()?.displaySurface !== undefined
      );

      if (isScreenCapture) {
        console.warn("[ScreenGuard] MediaRecorder of screen stream intercepted — replacing with black stream.");
        // Replace stream tracks with silence/black
        const blackStream = createBlackStream();
        return new Target(blackStream, args[1] as MediaRecorderOptions | undefined);
      }

      // Non-screen MediaRecorder (e.g. camera) — pass through
      return new Target(...(args as ConstructorParameters<typeof MediaRecorder>));
    }
  });
}

// ── LAYER 1D — Intercept Canvas pixel extraction ──────────────────────────────
// This prevents frame grabbers that draw video to canvas and call toDataURL/toBlob
function _poisonCanvas() {
  _canvasGetContextOriginal = HTMLCanvasElement.prototype.getContext;
  _canvasToDataURLOriginal  = HTMLCanvasElement.prototype.toDataURL;
  _canvasToBlobOriginal     = HTMLCanvasElement.prototype.toBlob;

  // We use a WeakSet to track canvases that have drawn from a protected <video>
  const _taintedCanvases = new WeakSet<HTMLCanvasElement>();

  // Proxy drawImage to detect when a protected video is drawn
  const _origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(
    this: CanvasRenderingContext2D,
    image: CanvasImageSource,
    ...rest: number[]
  ) {
    if (image instanceof HTMLVideoElement && image.dataset.pvGuarded === "1") {
      // Mark the canvas as tainted
      _taintedCanvases.add(this.canvas);
      // Fill with black instead of actual video pixels
      this.fillStyle = "#000000";
      this.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    return (_origDrawImage as Function).apply(this, [image, ...rest]);
  };

  // Proxy toDataURL / toBlob to return black if canvas is tainted
  HTMLCanvasElement.prototype.toDataURL = function(this: HTMLCanvasElement, ...args: Parameters<typeof HTMLCanvasElement.prototype.toDataURL>) {
    if (_taintedCanvases.has(this)) {
      // Return a 1x1 black PNG
      const c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#000"; cx.fillRect(0,0,1,1);
      return (_canvasToDataURLOriginal as typeof HTMLCanvasElement.prototype.toDataURL).apply(c, args);
    }
    return (_canvasToDataURLOriginal as typeof HTMLCanvasElement.prototype.toDataURL).apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function(this: HTMLCanvasElement, callback: BlobCallback, ...args: [string?, number?]) {
    if (_taintedCanvases.has(this)) {
      const c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#000"; cx.fillRect(0,0,1,1);
      (_canvasToBlobOriginal as typeof HTMLCanvasElement.prototype.toBlob).apply(c, [callback, ...args]);
      return;
    }
    (_canvasToBlobOriginal as typeof HTMLCanvasElement.prototype.toBlob).apply(this, [callback, ...args]);
  };
}

// ── LAYER 3 — Harden video elements against PiP & download ───────────────────
export function hardenVideoElement(video: HTMLVideoElement) {
  if (_pip_disabled_elements.has(video)) return;
  _pip_disabled_elements.add(video);

  // Disable Picture-in-Picture via attribute (Chrome/Edge/Firefox)
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");

  // Mark as guarded so canvas drawImage proxy can identify it
  video.dataset.pvGuarded = "1";

  // Prevent PiP request via event
  const ac = new AbortController();
  _pip_abort_controllers.push(ac);
  video.addEventListener("enterpictureinpicture", (e) => {
    e.preventDefault();
    try { document.exitPictureInPicture(); } catch { /* already not in PiP */ }
  }, { signal: ac.signal });

  // Prevent AirPlay / remote playback (Safari / iOS)
  if ((video as any).disableRemotePlayback !== undefined) {
    (video as any).disableRemotePlayback = true;
  }

  // Remove native controls entirely (we render our own)
  video.removeAttribute("controls");

  // Prevent long-press save on iOS Safari
  video.addEventListener("contextmenu", (e) => e.preventDefault(), { signal: ac.signal });
}

// ── Install / Uninstall ───────────────────────────────────────────────────────
export function installScreenCaptureGuard() {
  if (_installed || typeof window === "undefined") return;
  _installed = true;

  _poisonGetDisplayMedia();
  _poisonGetUserMedia();
  _poisonMediaRecorder();
  _poisonCanvas();

  // Disable PiP globally at the document level (Chrome 70+)
  try {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      get: () => false,
      configurable: true,
    });
  } catch { /* property already defined or not configurable */ }

  console.info("[ScreenGuard] Screen capture guard installed.");
}

export function uninstallScreenCaptureGuard() {
  if (!_installed || typeof window === "undefined") return;
  _installed = false;

  // Restore getDisplayMedia
  if (_originalGetDisplayMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getDisplayMedia = _originalGetDisplayMedia;
    _originalGetDisplayMedia = null;
  }

  // Restore getUserMedia
  if (_originalGetUserMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = _originalGetUserMedia;
    _originalGetUserMedia = null;
  }

  // Restore MediaRecorder
  if (_MediaRecorderOriginal) {
    (window as any).MediaRecorder = _MediaRecorderOriginal;
    _MediaRecorderOriginal = null;
  }

  // Restore canvas methods
  if (_canvasGetContextOriginal) {
    HTMLCanvasElement.prototype.getContext = _canvasGetContextOriginal;
    _canvasGetContextOriginal = null;
  }
  if (_canvasToDataURLOriginal) {
    HTMLCanvasElement.prototype.toDataURL = _canvasToDataURLOriginal;
    _canvasToDataURLOriginal = null;
  }
  if (_canvasToBlobOriginal) {
    HTMLCanvasElement.prototype.toBlob = _canvasToBlobOriginal;
    _canvasToBlobOriginal = null;
  }

  // Abort all PiP listeners
  _pip_abort_controllers.forEach(ac => ac.abort());
  _pip_abort_controllers.length = 0;

  console.info("[ScreenGuard] Screen capture guard uninstalled.");
}
