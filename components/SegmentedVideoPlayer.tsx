"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Loader2, Wifi } from "lucide-react";

export interface SegmentInfo {
  index: number; url: string; duration: number;
}
interface Props {
  segments: SegmentInfo[]; totalDuration: number; lastTimestamp: number;
  onProgress?: (t: number, done: boolean) => void; title?: string;
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}` : `${m}:${String(ss).padStart(2,"0")}`;
}
function buildCum(d: number[]) {
  const c = [0]; for (const x of d) c.push(c[c.length-1]+x); return c;
}
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
}

export default function SegmentedVideoPlayer({ segments, totalDuration: propTotal, lastTimestamp, onProgress, title }: Props) {
  const vA = useRef<HTMLVideoElement>(null);
  const vB = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [active, setActive]       = useState<"A"|"B">("A");
  const activeRef                  = useRef<"A"|"B">("A"); // mirrors active; sync, no stale closure
  const [curSeg, setCurSeg]       = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [muted, setMuted]         = useState(false);
  const [vol, setVol]             = useState(1);
  const [gt, setGt]               = useState(lastTimestamp||0);
  const [stalled, setStalled]     = useState(false);  // mid-play stall
  const [isFs, setIsFs]           = useState(false);
  const [showCtrl, setShowCtrl]   = useState(true);
  const [mobile, setMobile]       = useState(false);

  // ── YouTube-style initial load state ──────────────────────────────────────
  // "init" = player mounted but canplay not yet fired
  // We show a lightweight non-blocking overlay (NOT a full blocker)
  // so the user can see the title and understands something is happening.
  const [phase, setPhase]         = useState<"init"|"ready">("init");
  const [bufPct, setBufPct]       = useState(0);
  const [bufferedFrac, setBufferedFrac] = useState(0); // for gray buffered bar
  const [speed, setSpeed]         = useState(1);
  const [tapFeedback, setTapFeedback] = useState<{dir:"L"|"R",n:number}|null>(null);
  const [seeking, setSeeking]         = useState(false); // cross-segment seek in progress
  const initDone      = useRef(false);
  const stallTimer    = useRef<ReturnType<typeof setTimeout>|null>(null);
  const stallDebounce = useRef<ReturnType<typeof setTimeout>|null>(null);
  const playStartedAt = useRef<number>(0); // timestamp when play() was called
  const lastTap       = useRef<{t:number,x:number}|null>(null);
  const inactiveReady = useRef(false); // true when inactive seg fired canplay

  // FIX: durs is a REF not state. setMeta() used to call setDurs() which triggered
  // a React re-render → new cum array → g = cum[s]+currentTime snapped to a new
  // value mid-playback → visible "rewind" of the progress bar.
  // Using a plain ref means cum is updated synchronously in-place with zero re-render.
  const dursRef = useRef<number[]>(segments.map(s => s.duration || 0));
  const cum = buildCum(dursRef.current);
  const totalDur = propTotal > 0 ? propTotal : (cum[cum.length-1] || 0);

  const cumRef  = useRef(buildCum(dursRef.current));
  const totalRef  = useRef(totalDur);
  const segRef    = useRef(curSeg);
  const queueRef  = useRef(0);
  const saveRef   = useRef(0);
  const hideRef   = useRef<ReturnType<typeof setTimeout>|null>(null);
  // Monotonic buffer bar: once the hint bar reaches a position it NEVER goes back.
  // Seeking backward within a buffered region shouldn't re-download already-cached data.
  // On cross-segment seeks we reset to the new seek position as the new floor.
  const maxBufFracRef = useRef(0);

  // Network-adaptive preload threshold: 4G=20%, 3G=40%, slow=60%
  function preloadThreshold() {
    if (typeof navigator === "undefined") return 0.4;
    const c = (navigator as any).connection;
    if (!c) return 0.3;
    if (c.saveData) return 0.7;
    if (c.effectiveType === "4g") return 0.2;
    if (c.effectiveType === "3g") return 0.4;
    return 0.6;
  }

  useEffect(()=>{ totalRef.current=totalDur; },  [totalDur]);
  useEffect(()=>{ segRef.current=curSeg; },      [curSeg]);
  useEffect(()=>{ if(typeof navigator!=="undefined") setMobile(isIOS()||/Mobi|Android/i.test(navigator.userAgent)); },[]);

  // STABLE getters — read activeRef (a ref, not state) so they NEVER go stale.
  // Old version closed over `active` state → stale after swap → onTime read wrong element
  // → buffer bar froze, global time was wrong, resume started from wrong position.
  const getA  = useCallback(() => activeRef.current === "A" ? vA.current : vB.current, []);
  const getIn = useCallback(() => activeRef.current === "A" ? vB.current : vA.current, []);

  function setMeta(i:number, el:HTMLVideoElement) {
    const d = el.duration;
    if (!isFinite(d) || d <= 0) return;
    // Write directly into the ref — no React state, no re-render, no cum recalculation.
    dursRef.current[i] = d;
    cumRef.current = buildCum(dursRef.current);
  }

  // Network speed helper — reads NetworkInformation API where available (Chrome/Android)
  // Falls back to buffer fill rate estimation on Safari/iOS.
  function getNetworkSpeed(): string {
    if (typeof navigator === "undefined") return "";
    const conn = (navigator as any).connection;
    if (conn?.downlink) {
      const mbps = conn.downlink as number;
      const label = conn.effectiveType ? ` (${conn.effectiveType.toUpperCase()})` : "";
      return `${mbps.toFixed(1)} Mbps${label}`;
    }
    return ""; // Safari/iOS — no NetworkInformation API
  }

  function queueNext(idx:number, el:HTMLVideoElement) {
    if(queueRef.current>=idx||!segments[idx]) return;
    inactiveReady.current=false;
    el.preload="auto"; el.src=segments[idx].url;
    el.onloadedmetadata=()=>setMeta(idx,el);
    el.addEventListener("canplay",()=>{ inactiveReady.current=true; },{once:true});
    queueRef.current=idx;
  }

  // ── Mount: load first segment, wire canplay → auto-play ──────────────────
  useEffect(()=>{
    if(!segments.length) return;
    const c=buildCum(segments.map(s=>s.duration||0));
    let ss=0, lt=lastTimestamp;
    for(let i=segments.length-1;i>=0;i--) { if(lastTimestamp>=c[i]){ss=i;lt=lastTimestamp-c[i];break;} }

    const el=vA.current!;
    el.preload="auto";
    el.src=segments[ss].url;

    // Buffer progress — fires as browser downloads data
    const onProg=()=>{
      if(el.buffered.length>0&&el.duration>0) {
        setBufPct(Math.min(Math.round(el.buffered.end(el.buffered.length-1)/el.duration*100),100));
      }
    };

    // FIX: Set currentTime in loadedmetadata (NOT in canplay).
    // loadedmetadata fires first and tells the browser WHERE to buffer from.
    // canplay then fires only when enough data is ready AT THAT SEEK POSITION.
    // If we set currentTime in canplay, the browser buffers from 0, fires canplay
    // for position 0, then we seek — but there's no data at the resume position,
    // so the seek silently fails and playback starts from 0.
    const onMeta=()=>{
      setMeta(ss,el);
      if(lt>0) el.currentTime=lt; // Seek to resume position early
    };

    const onCanPlay=()=>{
      if(initDone.current) return;
      initDone.current=true;
      setBufPct(100);
      playStartedAt.current=Date.now();
      el.play().catch(()=>{});
      // Immediately start preloading next segment
      const ni=ss+1;
      if(ni<segments.length) queueNext(ni,vB.current!);
    };

    el.addEventListener("progress",        onProg);
    el.addEventListener("canplay",         onCanPlay);
    el.addEventListener("loadedmetadata",  onMeta);

    setCurSeg(ss); segRef.current=ss; queueRef.current=ss;

    const inEl=vB.current!;
    inEl.preload="none"; inEl.removeAttribute("src");

    return ()=>{
      el.removeEventListener("progress",       onProg);
      el.removeEventListener("canplay",        onCanPlay);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{ [vA,vB].forEach(r=>{ if(r.current){r.current.volume=vol;r.current.muted=muted;} }); },[vol,muted]);

  // ── timeupdate ────────────────────────────────────────────────────────────
  const onTime=useCallback(()=>{
    const el=getA(); if(!el) return;
    const c=cumRef.current, s=segRef.current;
    const g=(c[s]||0)+el.currentTime;
    setGt(g);

    // FIX: Hide init overlay on first timeupdate — video frame is definitely painted now
    setPhase("ready");

    // FIX: Track buffered range for BOTH active AND inactive element.
    // Previously only the active element was read, so the hint bar froze at the
    // segment boundary while the next segment was downloading in the background.
    // Now we take the max of both: bar moves continuously as preload advances.
    if(el.buffered.length>0&&el.duration>0){
      const segStart=c[s]||0;
      let bestEnd=0;
      for(let i=0;i<el.buffered.length;i++){
        if(el.buffered.end(i)>bestEnd) bestEnd=el.buffered.end(i);
      }
      let bufFrac=Math.min((segStart+bestEnd)/(totalRef.current||1),1);

      // Also include the inactive element (next segment preloading)
      const ni2=s+1;
      if(ni2<segments.length){
        const inEl2=getIn();
        if(inEl2&&inEl2.src&&inEl2.buffered.length>0){
          const nSegStart=c[ni2]||0;
          let nBest=0;
          for(let i=0;i<inEl2.buffered.length;i++){
            if(inEl2.buffered.end(i)>nBest) nBest=inEl2.buffered.end(i);
          }
          const nFrac=Math.min((nSegStart+nBest)/(totalRef.current||1),1);
          if(nFrac>bufFrac) bufFrac=nFrac;
        }
      }
      // Monotonic: take the max of computed bufFrac and the highest we've seen.
      // This means seeking backward never drops the bar — data is already cached.
      maxBufFracRef.current = Math.max(maxBufFracRef.current, bufFrac);
      setBufferedFrac(maxBufFracRef.current);
    }

    // Network-adaptive preload threshold
    const ni=s+1;
    if(isFinite(el.duration)&&el.duration>0&&el.currentTime/el.duration>preloadThreshold()&&ni<segments.length&&queueRef.current<ni) {
      const inEl=getIn(); if(inEl) queueNext(ni,inEl);
    }

    const now=Date.now();
    if(now-saveRef.current>10_000){ saveRef.current=now; onProgress?.(g,false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[segments,onProgress]);

  // ── ended: canplay-guarded segment swap ──────────────────────────────────
  const onEnded=useCallback(()=>{
    const s=segRef.current, ni=s+1;
    if(ni>=segments.length){ setPlaying(false); onProgress?.(totalRef.current,true); return; }

    const inEl=getIn()!;
    if(!inEl.src||inEl.src!==segments[ni].url) {
      inEl.preload="auto"; inEl.src=segments[ni].url;
      inEl.onloadedmetadata=()=>setMeta(ni,inEl);
    }
    inEl.currentTime=0;

    const doSwap=()=>{
      // Update ref FIRST (sync) so getA/getIn are immediately correct
      // before React re-renders with the new active state.
      const next: "A"|"B" = activeRef.current === "A" ? "B" : "A";
      activeRef.current = next;
      setActive(next);
      setCurSeg(ni); segRef.current=ni; queueRef.current=ni;
      inactiveReady.current=false;
      inEl.play().catch(()=>{});
      const an=ni+1;
      if(an<segments.length){
        // getA() now correctly returns the NEW active (inEl) post-swap via ref.
        // We want to clear the OLD active: it's the opposite of activeRef.
        const oldEl = next === "A" ? vB.current : vA.current;
        if(oldEl){ oldEl.preload="none"; oldEl.removeAttribute("src"); }
      }
    };

    // If inactive already buffered enough, swap instantly (no gap)
    // Otherwise wait for canplay (shows stall spinner briefly)
    if(inactiveReady.current||inEl.readyState>=3){ doSwap(); }
    else { inEl.addEventListener("canplay",doSwap,{once:true}); setStalled(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[segments,onProgress]);

  // ── Event wiring + stall auto-recovery ───────────────────────────────────
  useEffect(()=>{
    const onW=()=>{
      // FIX: Debounce stall indicator by 800ms — prevents flash during normal
      // brief network pauses and suppresses false positive in first 2s of play.
      if(stallDebounce.current) clearTimeout(stallDebounce.current);
      stallDebounce.current=setTimeout(()=>{
        // Don't show stall overlay in first 2s after play started (init buffering)
        if(Date.now()-playStartedAt.current<2000) return;
        setStalled(true);
        // Auto-recovery: if still stalled after 5s, reload from current time
        stallTimer.current=setTimeout(()=>{
          const el=getA(); if(!el||el.paused) return;
          if(el.readyState<3){ const ct=el.currentTime,src=el.src; el.src=src; el.currentTime=ct; el.play().catch(()=>{}); }
        },5000);
      },800);
    };
    const onPl=()=>{
      // Clear both debounce and stall immediately on playing
      if(stallDebounce.current){clearTimeout(stallDebounce.current);stallDebounce.current=null;}
      if(stallTimer.current){clearTimeout(stallTimer.current);stallTimer.current=null;}
      setStalled(false);
    };
    const onPy=()=>setPlaying(true), onPa=()=>setPlaying(false);
    [vA,vB].forEach(r=>{
      const el=r.current; if(!el) return;
      el.addEventListener("timeupdate",onTime); el.addEventListener("ended",onEnded);
      el.addEventListener("waiting",onW);       el.addEventListener("playing",onPl);
      el.addEventListener("play",onPy);         el.addEventListener("pause",onPa);
    });
    return ()=>{ [vA,vB].forEach(r=>{
      const el=r.current; if(!el) return;
      el.removeEventListener("timeupdate",onTime); el.removeEventListener("ended",onEnded);
      el.removeEventListener("waiting",onW);        el.removeEventListener("playing",onPl);
      el.removeEventListener("play",onPy);          el.removeEventListener("pause",onPa);
    }); if(stallTimer.current) clearTimeout(stallTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[onTime,onEnded]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(()=>{
    const oc=()=>{ const d=document as any; setIsFs(!!(document.fullscreenElement||d.webkitFullscreenElement)); };
    const ob=()=>setIsFs(true), oe=()=>setIsFs(false);
    document.addEventListener("fullscreenchange",oc); document.addEventListener("webkitfullscreenchange",oc);
    vA.current?.addEventListener("webkitbeginfullscreen",ob); vA.current?.addEventListener("webkitendfullscreen",oe);
    vB.current?.addEventListener("webkitbeginfullscreen",ob); vB.current?.addEventListener("webkitendfullscreen",oe);
    return ()=>{
      document.removeEventListener("fullscreenchange",oc); document.removeEventListener("webkitfullscreenchange",oc);
      vA.current?.removeEventListener("webkitbeginfullscreen",ob); vA.current?.removeEventListener("webkitendfullscreen",oe); // eslint-disable-line
      vB.current?.removeEventListener("webkitbeginfullscreen",ob); vB.current?.removeEventListener("webkitendfullscreen",oe); // eslint-disable-line
    };
  },[]);

  // ── Controls hide timer ───────────────────────────────────────────────────
  const resetHide=useCallback(()=>{
    setShowCtrl(true);
    if(hideRef.current) clearTimeout(hideRef.current);
    hideRef.current=setTimeout(()=>setShowCtrl(false),3000);
  },[]);

  // Apply speed to both video elements
  useEffect(()=>{ [vA,vB].forEach(r=>{ if(r.current) r.current.playbackRate=speed; }); },[speed]);

  useEffect(()=>{
    const ok=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement).tagName==="INPUT") return;
      if(e.key===" "||e.key==="k"){e.preventDefault();toggle();}
      if(e.key==="ArrowRight"||e.key==="l"){e.preventDefault();seek(gt+10);}
      if(e.key==="ArrowLeft" ||e.key==="j"){e.preventDefault();seek(Math.max(0,gt-10));}
      if(e.key==="m") setMuted(v=>!v);
      if(e.key==="f") toggleFs();
      if(e.key===">") setSpeed(v=>Math.min(2,parseFloat((v+0.25).toFixed(2))));
      if(e.key==="<") setSpeed(v=>Math.max(0.25,parseFloat((v-0.25).toFixed(2))));
    };
    window.addEventListener("keydown",ok);
    return ()=>window.removeEventListener("keydown",ok);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gt]);

  // Double-tap seek on mobile (left zone = -10s, right zone = +10s)
  function handleTap(e:React.TouchEvent){
    resetHide();
    const now=Date.now();
    const touch=e.changedTouches[0];
    const rect=wrapRef.current?.getBoundingClientRect();
    if(!rect) return;
    const x=touch.clientX-rect.left;
    if(lastTap.current&&now-lastTap.current.t<300){
      const dir=x<rect.width*0.4?"L":x>rect.width*0.6?"R":null;
      if(dir){
        const delta=dir==="L"?-10:10;
        seek(Math.max(0,gt+delta));
        setTapFeedback({dir,n:Math.abs(delta)});
        setTimeout(()=>setTapFeedback(null),600);
      }
      lastTap.current=null;
    } else {
      lastTap.current={t:now,x};
      setTimeout(()=>{ if(lastTap.current&&Date.now()-lastTap.current.t>=290){ toggle(); lastTap.current=null; } },300);
    }
  }

  function toggle() {
    const el=getA(); if(!el) return;
    // During init: clicking play does nothing — canplay handles it
    if(phase==="init") return;
    el.paused ? el.play().catch(()=>{}) : el.pause();
  }

  function seek(tg:number) {
    if(phase==="init") return;
    const c=cumRef.current, tot=totalRef.current;
    const cl=Math.max(0,Math.min(tg,tot||tg));
    let si=0;
    for(let i=segments.length-1;i>=0;i--) { if(cl>=(c[i]||0)){si=i;break;} }
    const lt=cl-(c[si]||0);

    if(si===segRef.current) {
      const el=getA(); if(el) el.currentTime=lt;
    } else {
      // Cross-segment seek — mirrors the mount effect's sequence exactly:
      // loadedmetadata → set currentTime (browser buffers FROM seek point)
      // canplay        → fires when enough data at seek point is ready → play
      //
      // OLD bug: play() was called in loadedmetadata before any data was buffered
      // at the seek position. canplay fired for position 0, hiding the seeking
      // overlay early. Browser then played from 0 or a random buffered point.
      setSeeking(true);
      const el=getA()!, inEl=getIn()!;
      const was=!el.paused;

      // Clear stale handler from any previous seek
      el.onloadedmetadata=null;
      el.preload="auto";
      el.src=segments[si].url;

      // Step 1: metadata ready → seek to target position (browser buffers from here)
      el.addEventListener("loadedmetadata", function onMeta() {
        el.removeEventListener("loadedmetadata", onMeta);
        setMeta(si, el);
        el.currentTime = lt;
      }, { once: true });

      // Step 2: canplay fires AFTER seek position has enough data → safe to play
      el.addEventListener("canplay", function onReady() {
        el.removeEventListener("canplay", onReady);
        setSeeking(false);
        if (was) el.play().catch(() => {});
      }, { once: true });

      // Reset the buffer bar floor to the new seek position so it can't drop BELOW
      // where we're seeking to, but preserves any buffer already ahead of that point.
      maxBufFracRef.current = Math.max(0, cl / (totalRef.current || 1));

      inEl.preload="none"; inEl.removeAttribute("src");
      queueRef.current=si; setCurSeg(si); segRef.current=si;
    }
    setGt(cl);
  }

  function enterIOSFs(v:any) {
    if(!v.webkitEnterFullscreen) return;
    const go=()=>{ try{v.webkitEnterFullscreen();}catch{} };
    if(v.readyState>=1){go();return;}
    let done=false;
    const t=setTimeout(()=>{if(!done){done=true;go();}},3000);
    v.addEventListener("loadedmetadata",function cb(){
      if(!done){done=true;clearTimeout(t);v.removeEventListener("loadedmetadata",cb);go();}
    });
  }

  function toggleFs() {
    const doc = document as any;
    const fsEl = document.fullscreenElement || doc.webkitFullscreenElement
               || doc.mozFullScreenElement   || doc.msFullscreenElement;

    // ── iOS Safari: must use webkitEnterFullscreen on the <video> element ────
    // (standard Fullscreen API does NOT work on iOS for video)
    if (isIOS()) {
      // Check both video elements — active one may have swapped since fullscreen opened
      const va = vA.current as any, vb = vB.current as any;
      const displaying = va?.webkitDisplayingFullscreen || vb?.webkitDisplayingFullscreen;
      if (fsEl || displaying) {
        va?.webkitExitFullscreen?.();
        vb?.webkitExitFullscreen?.();
      } else {
        enterIOSFs(getA() as any);
      }
      return;
    }

    // ── Android + Desktop: use Fullscreen API on the container div ────────────
    // Fallback chain covers: Chrome, Firefox, Samsung Internet, Edge Legacy,
    // old WebKit desktop Safari, and any browser that only exposes it on <video>.
    const wrap = wrapRef.current as any;
    const vid  = getA() as any; // video element fallback for Samsung Internet

    if (fsEl) {
      // Exit fullscreen — try all vendor prefixes
      (document.exitFullscreen?.()
        ?? doc.webkitExitFullscreen?.()
        ?? doc.mozCancelFullScreen?.()
        ?? doc.msExitFullscreen?.());
    } else {
      // Enter fullscreen — try container first, fall back to video element
      (wrap?.requestFullscreen?.()
        ?? wrap?.webkitRequestFullscreen?.()
        ?? wrap?.mozRequestFullScreen?.()
        ?? wrap?.msRequestFullscreen?.()
        ?? vid?.requestFullscreen?.()
        ?? vid?.webkitEnterFullscreen?.());  // Samsung Internet / old Android
    }
  }

  function barClick(e:React.MouseEvent<HTMLDivElement>) {
    if(phase==="init") return;
    const r=e.currentTarget.getBoundingClientRect();
    seek((e.clientX-r.left)/r.width*(totalRef.current||1));
  }
  function barTouch(e:React.TouchEvent<HTMLDivElement>) {
    if(phase==="init") return;
    e.stopPropagation();
    const r=e.currentTarget.getBoundingClientRect();
    seek(Math.max(0,Math.min(1,(e.touches[0].clientX-r.left)/r.width))*(totalRef.current||1));
  }

  const pFrac = totalDur>0 ? Math.min(gt/totalDur,1) : 0;
  const tLabel = totalDur>0 ? fmt(totalDur) : "--:--";
  const isInit = phase==="init";

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black rounded-2xl overflow-hidden select-none"
      style={{aspectRatio:"16/9"}}
      onMouseMove={resetHide}
      onTouchEnd={handleTap}
      onClick={toggle} onContextMenu={e=>e.preventDefault()}
    >
      <video ref={vA} className="absolute inset-0 w-full h-full object-contain"
        style={{zIndex:active==="A"?10:1,opacity:active==="A"?1:0}}
        playsInline webkit-playsinline="true" preload="none" />
      <video ref={vB} className="absolute inset-0 w-full h-full object-contain"
        style={{zIndex:active==="B"?10:1,opacity:active==="B"?1:0}}
        playsInline webkit-playsinline="true" preload="none" />

      {/* ── YouTube-style thin top loading bar ─────────────────────────────
          Visible during init AND during mid-play stalls.
          - init: animated shimmer (indeterminate) until bufPct climbs
          - ready: disappears                                              */}
      {isInit && (
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{zIndex:60}}>
          {bufPct>0 ? (
            <div className="h-full bg-violet-500 transition-all duration-300" style={{width:`${bufPct}%`}} />
          ) : (
            /* Indeterminate shimmer when no progress yet */
            <div className="h-full relative overflow-hidden bg-white/10">
              <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-violet-400 to-transparent"
                style={{animation:"shimmer 1.4s ease-in-out infinite"}} />
            </div>
          )}
        </div>
      )}

      {/* ── Lightweight init overlay (NOT full blocking) ────────────────────
          Semi-transparent so the video frame shows through the moment
          the browser has any decoded frame — exactly like YouTube.
          Hides as soon as phase becomes "ready".                          */}
      {isInit && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          style={{zIndex:50,background:"rgba(0,0,0,0.72)",backdropFilter:"blur(2px)"}}
        >
          {/* Central spinner — small, unobtrusive */}
          <Loader2 className="w-10 h-10 animate-spin" style={{color:"#a78bfa",filter:"drop-shadow(0 0 8px rgba(167,139,250,0.7))"}} />

          <div className="text-center space-y-1 px-8">
            <p className="text-white/90 text-sm font-medium">
              {bufPct>30 ? "Almost ready…" : "Preparing your video…"}
            </p>
            <div className="flex items-center justify-center gap-1.5 text-white/40 text-[11px]">
              <Wifi className="w-3 h-3" />
              <span>Ensure a stable internet connection for best quality</span>
            </div>
          </div>

          {/* Compact buffer bar */}
          {bufPct>0 && (
            <div className="w-48 space-y-1">
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{width:`${bufPct}%`,background:"linear-gradient(90deg,#7c3aed,#c084fc)"}} />
              </div>
              <p className="text-center text-white/30 text-[10px] font-mono">{bufPct}% buffered</p>
            </div>
          )}
        </div>
      )}

      {/* ── Mid-play stall OR seeking overlay ───────────────────────────── */}
      {!isInit && (stalled || seeking) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{zIndex:40,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(1px)"}}>
          <Loader2 className="w-11 h-11 animate-spin" style={{color:"#a78bfa"}} />
          <div className="text-center space-y-0.5">
            <p className="text-white/80 text-sm font-medium">
              {seeking ? "Seeking\u2026" : "Buffering\u2026"}
            </p>
            {/* Real-time network speed */}
            {(()=>{ const spd=getNetworkSpeed(); return spd ? (
              <div className="flex items-center justify-center gap-1.5 text-white/40 text-[11px]">
                <Wifi className="w-3 h-3" />
                <span>Network: {spd}</span>
              </div>
            ) : (
              <p className="text-white/30 text-[11px]">Check your internet connection if this persists</p>
            ); })()}
          </div>
        </div>
      )}

      {/* ── Double-tap seek feedback overlay (mobile) ────────────────────── */}
      {tapFeedback && (
        <div className={`absolute inset-y-0 flex items-center justify-center w-2/5 pointer-events-none ${tapFeedback.dir==="L"?"left-0":"right-0"}`}
          style={{zIndex:40,background:tapFeedback.dir==="L"?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.08)",borderRadius:tapFeedback.dir==="L"?"0 50% 50% 0":"50% 0 0 50%"}}>
          <div className="text-white text-center">
            <div className="text-2xl font-bold">{tapFeedback.dir==="L"?"«":"»"}</div>
            <div className="text-xs mt-0.5">{tapFeedback.n}s</div>
          </div>
        </div>
      )}

      {/* ── Segment badge ─────────────────────────────────────────────────── */}
      {!isInit && (
        <div className="absolute top-3 left-3 text-[10px] font-mono text-white/50 bg-black/40 px-2 py-0.5 rounded" style={{zIndex:30}}>
          {curSeg+1}/{segments.length}
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none"
        style={{zIndex:30, opacity: isInit ? 0 : (showCtrl||!playing ? 1 : 0)}}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        <div className="relative px-4 pb-4 space-y-2 pointer-events-auto" onClick={e=>e.stopPropagation()}>
          {title && <p className="text-white text-sm font-medium truncate opacity-90 drop-shadow">{title}</p>}

          {/* Progress bar with buffered range (YouTube gray zone) */}
          <div className="w-full rounded-full cursor-pointer group/bar flex items-center"
            style={{height:mobile?"20px":"12px",padding:mobile?"8px 0":"4px 0"}}
            onClick={barClick} onTouchStart={barTouch} onTouchMove={barTouch}>
            <div className="w-full h-1.5 bg-white/15 rounded-full relative">
              {/* Buffered range — gray zone ahead of playhead */}
              <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full transition-none" style={{width:`${bufferedFrac*100}%`}} />
              {/* Played range */}
              <div className="absolute inset-y-0 left-0 bg-white rounded-full transition-none" style={{width:`${pFrac*100}%`}}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/bar:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={toggle} className="text-white hover:text-white/80 transition-colors">
              {playing ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5" fill="white" />}
            </button>
            {!mobile && (
              <>
                <button onClick={()=>setMuted(v=>!v)} className="text-white hover:text-white/80 transition-colors">
                  {muted||vol===0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:vol}
                  onChange={e=>{setVol(Number(e.target.value));setMuted(false);}}
                  className="w-20 accent-white h-1 cursor-pointer" onClick={e=>e.stopPropagation()} />
              </>
            )}
            <span className="text-white/80 text-xs font-mono ml-1">{fmt(gt)} / {tLabel}</span>
            <div className="flex-1" />
            {/* Speed selector */}
            <select value={speed} onChange={e=>{e.stopPropagation();setSpeed(Number(e.target.value));}}
              onClick={e=>e.stopPropagation()}
              className="bg-transparent text-white/70 text-xs border border-white/20 rounded px-1 py-0.5 cursor-pointer hover:text-white hover:border-white/40 transition-colors">
              {[0.5,0.75,1,1.25,1.5,2].map(s=><option key={s} value={s} className="bg-black text-white">{s===1?"Normal":`${s}×`}</option>)}
            </select>
            <button onClick={e=>{e.stopPropagation();toggleFs();}} className="text-white hover:text-white/80 transition-colors p-1" title="Fullscreen (F)">
              {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe for shimmer animation */}
      <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}
