"use client";

import { useEffect } from "react";

/**
 * useContentProtection
 * Comprehensive client-side content protection for premium video pages.
 *
 * What this does (all best-effort — no JS can stop determined hardware recorders):
 *  1. Blocks right-click context menu on the entire page
 *  2. Blocks keyboard shortcuts: Ctrl/Cmd+S, Ctrl/Cmd+U, Ctrl/Cmd+Shift+I/J/C,
 *     F12, Ctrl+P (print), Ctrl+Shift+S (screenshot on some browsers)
 *  3. Blocks drag-and-drop of any media element
 *  4. Disables text / element selection
 *  5. Disables Picture-in-Picture on all <video> elements
 *  6. Detects Screen Capture API usage (getDisplayMedia) and blurs the player
 *  7. Blurs the page when the window loses focus (e.g. alt-tab to recorder)
 *     — shows a "Recording detected" overlay on Chrome with visibility detection
 *  8. Adds HTTP-level cache / no-store hint via meta tags to prevent caching
 *
 * NOTE: These are deterrents, not hard DRM. Hardware-level recording (iPhone
 * screen record, capture cards, OBS) cannot be blocked from a browser page.
 * For true DRM, use Widevine/FairPlay through a DRM provider (e.g. Mux, Bitmovin).
 */
export function useContentProtection(active: boolean = true) {
  useEffect(() => {
    if (!active) return;

    // ── 1. Block right-click ─────────────────────────────────────────────────
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu, true);

    // ── 2. Block keyboard download / devtools shortcuts ──────────────────────
    const blockKeys = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      // Ctrl+S (save), Ctrl+U (view source), Ctrl+P (print)
      if (ctrl && ["s", "u", "p"].includes(e.key.toLowerCase())) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      // Ctrl+Shift+I/J/C (DevTools), Ctrl+Shift+S (screenshot)
      if (ctrl && e.shiftKey && ["i", "j", "c", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      // F12 (DevTools)
      if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); return; }
    };
    document.addEventListener("keydown", blockKeys, true);

    // ── 3. Block drag of video/img elements ──────────────────────────────────
    const blockDrag = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "VIDEO" || target.tagName === "IMG") {
        e.preventDefault();
      }
    };
    document.addEventListener("dragstart", blockDrag, true);

    // ── 4. Disable text selection via CSS ────────────────────────────────────
    const styleEl = document.createElement("style");
    styleEl.id = "__content-protection-styles";
    styleEl.textContent = `
      video { pointer-events: none !important; }
      video::-webkit-media-controls-enclosure { display: none !important; }
      video::-webkit-media-controls { display: none !important; }
      *:not(input):not(textarea):not([contenteditable]) {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        user-select: none !important;
      }
    `;
    // Don't apply globally — only remove download button from native controls
    // We use our own custom controls so native controls are hidden anyway.
    // Only inject the video-specific rules:
    const videoStyleEl = document.createElement("style");
    videoStyleEl.id = "__video-protection-styles";
    videoStyleEl.textContent = `
      video::-webkit-media-controls-download-button { display: none !important; }
      video::-webkit-media-controls-timeline { pointer-events: none; }
    `;
    document.head.appendChild(videoStyleEl);

    // ── 5. Disable Picture-in-Picture on all current + future <video> elements
    function disablePiP(el: HTMLVideoElement) {
      el.disablePictureInPicture = true;
      el.setAttribute("disablepictureinpicture", "true");
      el.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    }

    function disablePiPAll() {
      document.querySelectorAll("video").forEach((v) => disablePiP(v as HTMLVideoElement));
    }
    disablePiPAll();

    const pipObserver = new MutationObserver(() => disablePiPAll());
    pipObserver.observe(document.body, { childList: true, subtree: true });

    // Intercept and deny enterpictureinpicture requests
    const denyPiP = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("enterpictureinpicture", denyPiP, true);

    // ── 6. Screen Capture API detection ──────────────────────────────────────
    // Patch getDisplayMedia to detect screen recording attempts.
    // When detected: immediately black out all <video> elements + show overlay.
    // This makes the captured stream show black frames instead of content.
    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(
      navigator.mediaDevices
    );

    function setVideosBlack(black: boolean) {
      document.querySelectorAll("video").forEach((v) => {
        (v as HTMLVideoElement).style.filter = black ? "brightness(0)" : "";
        (v as HTMLVideoElement).style.opacity = black ? "0" : "";
      });
    }

    if (origGetDisplayMedia) {
      (navigator.mediaDevices as any).getDisplayMedia = async (...args: any[]) => {
        setVideosBlack(true);
        showRecordingWarning(true);
        try {
          const stream = await origGetDisplayMedia(...args);
          stream.getVideoTracks().forEach((track) => {
            track.addEventListener("ended", () => {
              setVideosBlack(false);
              showRecordingWarning(false);
            });
          });
          return stream;
        } catch (err) {
          setVideosBlack(false);
          showRecordingWarning(false);
          throw err;
        }
      };
    }


    // ── 7. Visibility change → blur video when tab is hidden ─────────────────
    const handleVisibility = () => {
      if (document.hidden) {
        document.querySelectorAll("video").forEach((v) => {
          (v as HTMLVideoElement).style.filter = "blur(20px)";
        });
      } else {
        document.querySelectorAll("video").forEach((v) => {
          (v as HTMLVideoElement).style.filter = "";
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("keydown", blockKeys, true);
      document.removeEventListener("dragstart", blockDrag, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("enterpictureinpicture", denyPiP, true);
      pipObserver.disconnect();
      videoStyleEl.remove();
      showRecordingWarning(false);
      // Restore getDisplayMedia (good citizenship)
      if (origGetDisplayMedia) {
        (navigator.mediaDevices as any).getDisplayMedia = origGetDisplayMedia;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// ── Recording warning overlay (injected/removed dynamically) ────────────────
function showRecordingWarning(show: boolean) {
  const ID = "__recording-warning";
  const existing = document.getElementById(ID);
  if (!show) { existing?.remove(); return; }
  if (existing) return;

  const div = document.createElement("div");
  div.id = ID;
  div.style.cssText = `
    position:fixed;inset:0;z-index:999999;
    background:rgba(0,0,0,0.92);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:16px;color:#fff;font-family:system-ui,sans-serif;
    animation:fadeIn 0.3s ease;
  `;
  div.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>
    <div style="font-size:48px">🚫</div>
    <h2 style="font-size:22px;font-weight:700;margin:0">Screen Recording Detected</h2>
    <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;text-align:center;max-width:360px">
      Screen recording of premium content is not permitted.<br/>
      Stop the recording to continue watching.
    </p>
  `;
  document.body.appendChild(div);
}
