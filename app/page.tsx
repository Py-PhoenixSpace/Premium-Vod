"use client";

import Navbar from "@/components/Navbar";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import {
  Flame,
  ArrowRight,
  Play,
  Crown,
  Zap,
  Shield,
  CheckCircle2,
  Users,
  Activity,
  LineChart,
  Lock,
  Clock,
  ImageIcon,
} from "lucide-react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  formatINR,
  monthlyRate,
  normalizeSubscriptionPricing,
  savingsPercent,
  type SubscriptionPricing,
} from "@/lib/subscription-pricing";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import type { Video } from "@/types";

function formatDuration(seconds: number) {
  const mins = Math.floor((seconds || 0) / 60);
  const secs = Math.floor((seconds || 0) % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatCreatedLabel(createdAt: unknown) {
  if (!createdAt) return "Recently added";

  try {
    const maybeTimestamp = createdAt as { toDate?: () => Date };
    const date =
      typeof maybeTimestamp.toDate === "function"
        ? maybeTimestamp.toDate()
        : new Date(createdAt as string | number | Date);

    if (Number.isNaN(date.getTime())) return "Recently added";

    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "Recently added";
  }
}

function buildMixedUpcomingFeed(
  videos: Video[],
  maxItems: number,
  prioritizePremium: boolean
) {
  const premium = videos.filter((video) => video.isPremium);
  const paid = videos.filter((video) => !video.isPremium && video.priceINR > 0);
  const free = videos.filter(
    (video) => !video.isPremium && (video.priceINR || 0) === 0
  );

  const buckets = prioritizePremium
    ? [premium, paid, free]
    : [free, paid, premium];

  const mixed: Video[] = [];
  let cursor = 0;

  while (mixed.length < maxItems && buckets.some((bucket) => bucket.length > 0)) {
    const bucket = buckets[cursor % buckets.length];
    if (bucket.length > 0) {
      const next = bucket.shift();
      if (next) mixed.push(next);
    }
    cursor += 1;
  }

  return mixed;
}

export default function HomePage() {
  const { user, initialized } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [latestVideos, setLatestVideos] = useState<Video[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [previewingVideoId, setPreviewingVideoId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<SubscriptionPricing>(
    DEFAULT_SUBSCRIPTION_PRICING
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let canceled = false;

    async function fetchPricing() {
      try {
        const res = await fetch("/api/pricing", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        if (!canceled) {
          setPricing(normalizeSubscriptionPricing(data?.pricing));
        }
      } catch {
        // Keep defaults when pricing API is unavailable.
      }
    }

    fetchPricing();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    async function fetchLatestVideos() {
      setVideosLoading(true);
      try {
        const videosRef = collection(db, "videos");
        const latestQuery = query(
          videosRef,
          where("status", "==", "published"),
          orderBy("createdAt", "desc"),
          limit(7)
        );
        const snapshot = await getDocs(latestQuery);

        if (!canceled) {
          setLatestVideos(
            snapshot.docs.map((doc) => ({
              videoId: doc.id,
              ...doc.data(),
            })) as Video[]
          );
        }
      } catch {
        if (!canceled) {
          setLatestVideos([]);
        }
      } finally {
        if (!canceled) {
          setVideosLoading(false);
        }
      }
    }

    fetchLatestVideos();

    return () => {
      canceled = true;
    };
  }, []);

  if (!mounted) return null;

  const quarterlyRate = monthlyRate(pricing.quarterly, 3);
  const halfYearlyRate = monthlyRate(pricing.halfYearly, 6);
  const quarterlySavings = savingsPercent(pricing.monthly, pricing.quarterly, 3);
  const halfYearlySavings = savingsPercent(pricing.monthly, pricing.halfYearly, 6);
  const isAdmin = user?.role === "admin" || user?.role === "super-admin";
  const hasPremiumAccess = isAdmin || isSubscriptionValid(user?.subscription);
  const latestVideo = latestVideos[0];
  const upcomingVideos = buildMixedUpcomingFeed(
    latestVideos.slice(1),
    4,
    hasPremiumAccess
  );

  function hasVideoAccess(video: Video) {
    const isFree = video.priceINR === 0 && !video.isPremium;
    const hasPurchased = user?.purchasedVideos?.includes(video.videoId) ?? false;
    return isFree || hasPremiumAccess || hasPurchased;
  }

  const premiumVideoCount = latestVideos.filter((video) => video.isPremium).length;
  const lockedPreviewCount = latestVideos.filter(
    (video) => !hasVideoAccess(video)
  ).length;

  return (
    <main className="min-h-screen bg-background selection:bg-primary/30 selection:text-primary">
      <Navbar />

      {/* ── SaaS Hero Section ──────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        {/* Animated Mesh Grid Background */}
        <div className="absolute inset-0 mesh-bg opacity-40 dark:opacity-100 transition-opacity duration-1000" />
        
        {/* Glow Spheres */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[400px] md:w-[600px] h-[400px] md:h-[600px] rounded-full bg-primary/10 dark:bg-primary/15 blur-[120px] mix-blend-screen animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[300px] md:w-[500px] h-[300px] md:h-[500px] rounded-full bg-accent/10 dark:bg-accent/15 blur-[100px] mix-blend-screen float-delayed" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full flex flex-col items-center text-center">
          
          {/* Release Badge */}
          <div className="inline-flex items-center gap-2 glass-card rounded-full px-4 py-2 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-sm border border-border/50">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
            </span>
            <span className="text-xs font-semibold text-foreground tracking-wide">
              Introducing PremiumVOD v2.0 <span className="opacity-50 mx-2">|</span> <span className="text-accent">Premium SaaS Update</span>
            </span>
          </div>

          {/* SaaS Headline */}
          <h1 className="text-3xl sm:text-6xl lg:text-8xl font-bold leading-[1.1] tracking-tight font-[family-name:var(--font-heading)] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 max-w-5xl px-1 sm:px-0">
            The intelligent way to
            <br className="hidden md:block" />
            <span className="brand-gradient-text px-2">stream</span> premium stories.
          </h1>

          <p className="mt-5 sm:mt-6 text-sm sm:text-xl text-muted-foreground max-w-2xl leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 px-3 sm:px-0">
              Enterprise-grade video platform. Cinematic 4K premium content, real-time analytics, and advanced streaming — engineered for content excellence.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-10 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
            <Link href="/register">
              <Button
                size="lg"
                className="brand-gradient text-white font-bold tracking-wide px-8 py-7 rounded-2xl text-base shadow-[0_10px_40px_-10px_oklch(0.55_0.28_295/0.8)] hover:shadow-[0_10px_50px_-10px_oklch(0.55_0.28_295/1)] hover:-translate-y-1 transition-all duration-300 group"
              >
                Buy Premium
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <div className="flex items-center gap-4 px-6 text-sm font-medium text-muted-foreground">
              <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full border-2 border-background z-30 brand-gradient flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  JD
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-background z-20 bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground shadow-sm">
                  AK
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-background z-10 bg-chart-4 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  SR
                </div>
              </div>
              <div className="text-left leading-tight">
                <span className="text-foreground font-bold">10,000+</span><br/>
                Active Members
              </div>
            </div>
          </div>

          {/* Dynamic Latest + Up Next Section */}
          <div className="relative w-full max-w-6xl mt-24 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500">
            <div className="relative rounded-3xl overflow-hidden glass-strong border border-border/50 shadow-2xl shadow-primary/10 z-20 mx-auto p-2 sm:p-5">
              {videosLoading ? (
                <div className="space-y-4">
                  <div className="aspect-video rounded-2xl glass border border-border/40 animate-pulse" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="rounded-2xl glass border border-border/40 p-2.5 animate-pulse">
                        <div className="aspect-video rounded-xl bg-muted/40" />
                        <div className="h-3 bg-muted/40 rounded mt-3" />
                        <div className="h-3 bg-muted/30 rounded mt-2 w-3/4" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : latestVideo ? (
                <div className="space-y-4">
                  {(() => {
                    const featuredLocked = !hasVideoAccess(latestVideo);
                    const featuredType =
                      latestVideo.mediaType === "image" ? "image" : "video";

                    return (
                      <Link href={`/watch/${latestVideo.videoId}`} className="block group">
                        <div className="relative aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden border border-border/40 bg-muted/30">
                          {latestVideo.thumbnailUrl ? (
                            <Image
                              src={latestVideo.thumbnailUrl}
                              alt={latestVideo.title || "Latest upload"}
                              fill
                              className={`object-cover transition-all duration-500 group-hover:scale-105 ${
                                featuredLocked
                                  ? "blur-sm scale-105 brightness-50"
                                  : "brightness-90 group-hover:brightness-100"
                              }`}
                              sizes="(max-width: 1024px) 100vw, 80vw"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10">
                              {featuredType === "image" ? (
                                <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                              ) : (
                                <Play className="w-12 h-12 text-muted-foreground/40" />
                              )}
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                          {featuredLocked ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex flex-col items-center gap-2.5">
                                <div className="w-14 h-14 rounded-2xl bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-2xl">
                                  <Lock className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-widest text-white/95 bg-black/55 px-3 py-1 rounded-full">
                                  {latestVideo.priceINR === 0 && !latestVideo.isPremium
                                    ? "Free Preview"
                                    : `Unlock for ₹${formatINR(latestVideo.priceINR)}`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                {featuredType === "image" ? (
                                  <ImageIcon className="w-7 h-7 text-white" />
                                ) : (
                                  <Play
                                    className="w-7 h-7 text-white ml-0.5"
                                    fill="currentColor"
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="absolute top-3 left-3 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-primary/90 px-2.5 py-1 rounded-lg">
                              Latest Upload
                            </span>
                            {latestVideo.isPremium && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-accent/90 text-accent-foreground px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5" />
                                Premium
                              </span>
                            )}
                          </div>

                          {!hasPremiumAccess && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 px-2.5 py-1 rounded-lg border border-white/20">
                              {latestVideo.priceINR === 0 && !latestVideo.isPremium
                                ? "Free"
                                : `₹${formatINR(latestVideo.priceINR)}`}
                            </span>
                          )}

                          <div className="absolute bottom-0 inset-x-0 p-3.5 sm:p-6 text-left">
                            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-white/80 mb-1.5 sm:mb-2">
                              <span>{formatCreatedLabel(latestVideo.createdAt)}</span>
                              <span className="w-1 h-1 rounded-full bg-white/60" />
                              <span className="capitalize">{latestVideo.category}</span>
                              {featuredType === "video" && latestVideo.durationInSeconds > 0 && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-white/60" />
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(latestVideo.durationInSeconds)}
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="text-lg sm:text-2xl font-bold text-white leading-tight">
                              {latestVideo.title || "Untitled content"}
                            </h3>
                            <p className="text-xs sm:text-base text-white/80 mt-1.5 sm:mt-2 line-clamp-2 max-w-3xl">
                              {latestVideo.description ||
                                "Fresh content is now live in your PremiumVOD library."}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })()}

                  {upcomingVideos.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          Up Next Mix
                        </p>
                        <Link
                          href="/videos"
                          className="text-xs font-semibold text-primary hover:text-accent transition-colors"
                        >
                          View full catalog
                        </Link>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {upcomingVideos.map((video) => {
                          const locked = !hasVideoAccess(video);
                          const mediaType =
                            video.mediaType === "image" ? "image" : "video";

                          return (
                            <Link
                              key={video.videoId}
                              href={`/watch/${video.videoId}`}
                              className="block group"
                            >
                              <article
                                className="h-full rounded-2xl glass border border-border/40 p-2.5 transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10"
                                onMouseEnter={() => {
                                  if (!locked && mediaType === "video" && video.secureUrl) {
                                    setPreviewingVideoId(video.videoId);
                                  }
                                }}
                                onMouseLeave={() => setPreviewingVideoId(null)}
                              >
                                <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/30 border border-border/30">
                                  {!locked &&
                                  mediaType === "video" &&
                                  video.secureUrl &&
                                  previewingVideoId === video.videoId ? (
                                    <video
                                      src={video.secureUrl}
                                      poster={video.thumbnailUrl || undefined}
                                      className="absolute inset-0 h-full w-full object-cover"
                                      autoPlay
                                      muted
                                      loop
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : video.thumbnailUrl ? (
                                    <Image
                                      src={video.thumbnailUrl}
                                      alt={video.title || "Video thumbnail"}
                                      fill
                                      className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
                                        locked
                                          ? "blur-sm scale-105 brightness-50"
                                          : "brightness-90 group-hover:brightness-100"
                                      }`}
                                      sizes="(max-width: 768px) 100vw, 25vw"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/10">
                                      {mediaType === "image" ? (
                                        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                                      ) : (
                                        <Play className="w-8 h-8 text-muted-foreground/40" />
                                      )}
                                    </div>
                                  )}

                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                                  {locked && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-9 h-9 rounded-xl bg-black/60 border border-white/20 flex items-center justify-center">
                                        <Lock className="w-4 h-4 text-white" />
                                      </div>
                                    </div>
                                  )}

                                  {!hasPremiumAccess && (
                                    <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider text-white bg-black/65 px-2 py-1 rounded-md border border-white/20">
                                      {video.priceINR === 0 && !video.isPremium
                                        ? "Free"
                                        : `₹${formatINR(video.priceINR)}`}
                                    </span>
                                  )}

                                  <span className="absolute bottom-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white bg-primary/80 px-2 py-0.5 rounded-md">
                                    {mediaType === "image" ? "Image" : "Video"}
                                  </span>
                                </div>

                                <div className="px-1 pt-2.5 text-left">
                                  <h4 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                                    {video.title || "Untitled content"}
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                                    {video.description ||
                                      "Newly added premium content ready to explore."}
                                  </p>
                                  <div className="mt-2 flex items-center justify-between text-[11px]">
                                    <span className="text-muted-foreground capitalize">
                                      {video.category}
                                    </span>
                                    <span className="text-foreground/80">
                                      {mediaType === "video" &&
                                      video.durationInSeconds > 0
                                        ? formatDuration(video.durationInSeconds)
                                        : "Preview"}
                                    </span>
                                  </div>
                                </div>
                              </article>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl glass border border-border/40 p-10 sm:p-14 text-center">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <Play className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Fresh uploads coming soon</h3>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed mb-6">
                    We are preparing your latest PremiumVOD content feed. Check the full
                    catalog or return shortly for new drops.
                  </p>
                  <Link href="/videos">
                    <Button className="brand-gradient text-white font-semibold px-6">
                      Explore Catalog
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="absolute -left-4 md:-left-10 top-1/4 z-30 glass-strong border border-border/50 rounded-2xl p-4 shadow-xl shadow-black/5 float hidden sm:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Latest Drop
                  </p>
                  <p className="text-lg font-bold font-mono text-foreground leading-none mt-1">
                    {latestVideo ? formatCreatedLabel(latestVideo.createdAt) : "Updating"}
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute -right-4 md:-right-8 bottom-1/4 z-30 glass-strong border border-border/50 rounded-2xl p-4 shadow-xl shadow-black/5 float-delayed hidden sm:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Premium Titles
                  </p>
                  <p className="text-lg font-bold font-mono text-foreground leading-none mt-1">
                    {premiumVideoCount} <span className="text-xs text-muted-foreground font-sans">in latest feed</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute top-[-30px] right-[10%] z-30 glass-strong border border-border/50 rounded-full px-4 py-2 shadow-xl shadow-black/5 float hidden md:flex items-center gap-2">
              <Crown className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground">
                {lockedPreviewCount > 0 ? `${lockedPreviewCount} locked previews` : "All latest unlocked"}
              </span>
            </div>

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-10 bg-black/30 blur-2xl rounded-full z-10 dark:block hidden" />
          </div>
        </div>

        {/* Bottom edge gradient blend */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent z-40" />
      </section>

      {/* ── Brand Logos / Social Proof ──────────────────────────────── */}
      <section className="py-10 border-b border-border/30 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4">
           <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6">Trusted by athletes worldwide</p>
           <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             {/* Abstract fake logos for corporate SaaS feel */}
             {["TechFit", "AlphaGear", "Pulse", "Velocity", "Aura"].map((logo) => (
                <div key={logo} className="text-xl font-bold font-mono flex items-center gap-2">
                  <Flame className="w-5 h-5" /> {logo}
                </div>
             ))}
           </div>
        </div>
      </section>

      {/* ── Bento Box Features (SaaS layout) ────────────────────────── */}
      <section className="py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-heading)]">
              Engineered for <span className="brand-gradient-text">Excellence.</span>
            </h2>
            <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
              We ditched the generic offerings. Everything here is built like a precision machine to optimize your viewing and content experience.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 auto-rows-auto md:auto-rows-[300px]">
            {/* Box 1 (Wide) */}
            <div className="md:col-span-2 glass-card rounded-3xl p-8 relative overflow-hidden group card-hover border border-border/50">
              <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-primary/10 to-transparent transition-opacity group-hover:opacity-50" />
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <LineChart className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Advanced Analytics</h3>
                  <p className="text-muted-foreground max-w-sm leading-relaxed">
                    Track every rep, set, and session. Our dashboard turns your sweat into quantifiable data so you never hit a plateau.
                  </p>
                </div>
                <Link href="/register" className="inline-flex items-center text-primary font-semibold group-hover:text-accent transition-colors mt-4">
                  Explore dashboard <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            </div>

            {/* Box 2 (Tall) */}
            <div className="md:row-span-2 glass-card rounded-3xl p-8 relative overflow-hidden group card-hover border border-border/50 brand-glow-soft">
              <div className="absolute inset-0 bg-gradient-to-t from-accent/10 to-transparent transition-opacity opacity-0 group-hover:opacity-100" />
              <div className="relative z-10 h-full flex flex-col">
                <div className="w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center mb-6 shadow-lg shadow-primary/30">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Cinematic 4K</h3>
                <p className="text-muted-foreground leading-relaxed flex-1">
                  Immersive premium videos shot on RED cameras. Experience video content that looks and feels like a blockbuster movie right in your living room.
                </p>
                <div className="w-full h-48 rounded-2xl bg-muted/30 border border-border/40 overflow-hidden relative mt-8">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'2\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.2\'/%3E%3C/svg%3E')] opacity-30 mix-blend-overlay" />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
                </div>
              </div>
            </div>

            {/* Box 3 */}
            <div className="glass-card rounded-3xl p-8 relative overflow-hidden group card-hover border border-border/50">
               <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
                 <Shield className="w-6 h-6 text-accent" />
               </div>
               <h3 className="text-xl font-bold mb-2">Zero Buffering</h3>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 Powered by global edge networks. Your videos start instantly, every single time.
               </p>
            </div>

            {/* Box 4 */}
            <div className="glass-card rounded-3xl p-8 relative overflow-hidden group card-hover border border-border/50">
               <div className="w-12 h-12 rounded-2xl bg-chart-4/10 flex items-center justify-center mb-6">
                 <Users className="w-6 h-6 text-chart-4" />
               </div>
               <h3 className="text-xl font-bold mb-2">Elite Community</h3>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 Join dedicated athletes pushing limits. Iron sharpens iron.
               </p>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider max-w-7xl mx-auto" />

      {/* ── Pricing SaaS Tier Table ─────────────────────────────────── */}
      <section className="py-24 md:py-32 relative bg-muted/5 sm:bg-transparent">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
             <h2 className="text-3xl sm:text-5xl font-bold font-[family-name:var(--font-heading)]">
              Transparent <span className="brand-gold-text">Plans.</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Simple, straightforward tiers. Start building your foundation today.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* 1-Month Plan */}
            <div className="glass-card rounded-[2rem] p-8 sm:p-10 card-hover border border-border/60 bg-card/60 relative">
              <h3 className="text-2xl font-bold mb-2">1 Month</h3>
              <p className="text-sm text-muted-foreground mb-8 h-10">Perfect for exploring our complete library.</p>
              
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-5xl font-bold font-mono">₹{formatINR(pricing.monthly)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-8">
                <span className="font-semibold text-foreground">₹{formatINR(pricing.monthly)}</span>/month billed monthly
              </p>
              
              <ul className="space-y-4 mb-10">
                {[
                  "Unlimited video access",
                  "New content every week",
                  "Standard quality streaming",
                  "Community support",
                  "Chat with Admin 24/7",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium text-foreground/80">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
              
              <Link href="/register" className="block w-full">
                <Button className="w-full h-14 rounded-xl font-bold text-base bg-muted text-foreground hover:bg-muted/80 border border-border/50 transition-all">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* 3-Month Plan (The Highlight) */}
            <div className="glass-strong rounded-[2rem] p-8 sm:p-10 card-hover border border-primary/20 bg-card/80 relative shadow-2xl shadow-primary/10 md:scale-105 md:z-10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-primary to-accent text-white px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20">
                Best Value
              </div>

              <h3 className="text-2xl font-bold mb-2 brand-gradient-text">3 Months</h3>
              <p className="text-sm text-muted-foreground mb-8 h-10">
                {quarterlySavings > 0
                  ? `Our most popular choice. Save ${quarterlySavings}% vs monthly.`
                  : "Our most popular choice with balanced pricing."}
              </p>

              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-5xl font-bold font-mono brand-gradient-text">₹{formatINR(pricing.quarterly)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-8">
                <span className="font-semibold text-primary">₹{formatINR(quarterlyRate)}</span>/month billed quarterly
              </p>

              <ul className="space-y-4 mb-10">
                {[
                  "Unlimited access to 500+ videos",
                  "New drops every week",
                  "4K premium quality streaming",
                  "Advanced analytics & tracking",
                  "Chat with Admin 24/7",
                  "Priority support",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-bold text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary drop-shadow-[0_0_8px_oklch(0.62_0.26_295/0.5)]" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/register" className="block w-full">
                <Button className="w-full h-14 rounded-xl font-bold text-base brand-gradient text-white hover:shadow-[0_10px_40px_-10px_oklch(0.55_0.28_295/0.8)] transition-all">
                  Buy Premium
                </Button>
              </Link>
            </div>

            {/* 6-Month Plan */}
            <div className="glass-card rounded-[2rem] p-8 sm:p-10 card-hover border border-border/60 bg-card/60 relative">
              <div className="absolute top-6 right-6 bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                {halfYearlySavings > 0 ? `Save ${halfYearlySavings}%` : "Steady Plan"}
              </div>
              
              <h3 className="text-2xl font-bold mb-2">6 Months</h3>
              <p className="text-sm text-muted-foreground mb-8 h-10">Maximum savings with a 6-month commitment.</p>
              
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-5xl font-bold font-mono">₹{formatINR(pricing.halfYearly)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-8">
                <span className="font-semibold text-foreground">₹{formatINR(halfYearlyRate)}</span>/month billed every 6 months
              </p>
              
              <ul className="space-y-4 mb-10">
                {[
                  "Unlimited video access",
                  "New content every week",
                  "4K premium quality",
                  "Advanced analytics",
                  "Chat with Admin 24/7",
                  "VIP priority support",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium text-foreground/80">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
              
              <Link href="/register" className="block w-full">
                <Button className="w-full h-14 rounded-xl font-bold text-base bg-muted text-foreground hover:bg-muted/80 border border-border/50 transition-all">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final SaaS CTA ──────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden border-t border-border/30 bg-muted/5">
        <div className="absolute inset-0 mesh-bg opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[100px]" />

        <div className="relative max-w-4xl mx-auto px-4 text-center z-10">
          <h2 className="text-4xl sm:text-6xl font-bold font-[family-name:var(--font-heading)] mb-6 tracking-tight">
             Ready to elevate your <br/>
             <span className="brand-gradient-text">performance?</span>
          </h2>
          <p className="text-xl text-muted-foreground mx-auto mb-10 max-w-2xl leading-relaxed">
            Join thousands of users who have elevated their experience with our enterprise-grade premium video platform. 
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link href="/register">
              <Button size="lg" className="brand-gradient text-white font-bold px-12 py-7 rounded-2xl text-lg shadow-xl shadow-primary/20 hover:-translate-y-1 transition-all">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border/30 py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl brand-gradient flex items-center justify-center shadow-lg">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold">
                <span className="brand-gradient-text">Fit</span>
                <span className="brand-gold-text">Rahul</span>
              </span>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm font-medium text-muted-foreground">
              <Link href="/videos" className="hover:text-foreground transition-colors">Catalog</Link>
              {(!initialized || !user) ? (
                <>
                  <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
                  <Link href="/register" className="hover:text-foreground transition-colors">Create Account</Link>
                </>
              ) : (
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              )}
            </div>
            
            <p className="text-sm font-medium text-muted-foreground/60">
              &copy; {new Date().getFullYear()} PremiumVOD. All systems operational.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
