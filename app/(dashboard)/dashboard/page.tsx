"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import Navbar from "@/components/Navbar";
import VideoCard from "@/components/VideoCard";
import SkeletonCard from "@/components/SkeletonCard";
import { SubscriptionManager } from "@/components/SubscriptionManager";
import type { Video } from "@/types";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import {
  Crown,
  Play,
  TrendingUp,
  History,
  Zap,
  BookOpen,
  Flame,
  ChevronRight,
  Star,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useUIStore } from "@/lib/stores/ui-store";

type TabKey = "continue" | "purchased" | "browse";

interface VideoWithProgress extends Video {
  lastTimestamp?: number;
  progressPercent?: number;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { openPremiumModal } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabKey>("browse");
  const [videos, setVideos] = useState<VideoWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const videosRef = collection(db, "videos");

        if (activeTab === "purchased" && user?.purchasedVideos?.length) {
          const ids = user.purchasedVideos.slice(0, 30);
          const q = query(videosRef, where("__name__", "in", ids));
          const snapshot = await getDocs(q);
          setVideos(snapshot.docs.map((d) => ({ videoId: d.id, ...d.data() } as Video)));
        } else if (activeTab === "continue" && user?.uid) {
          const historyRef = collection(db, "users", user.uid, "watchHistory");
          const historySnap = await getDocs(
            query(historyRef, orderBy("updatedAt", "desc"), limit(12))
          );
          if (historySnap.empty) {
            setVideos([]);
          } else {
            const videoPromises = historySnap.docs.map(async (historyDoc) => {
              const historyData = historyDoc.data();
              const videoId = historyDoc.id;
              try {
                const videoDoc = await getDoc(doc(db, "videos", videoId));
                if (!videoDoc.exists()) return null;
                const video = {
                  videoId: videoDoc.id,
                  ...videoDoc.data(),
                  lastTimestamp: historyData.lastTimestamp || 0,
                } as VideoWithProgress;
                if (video.durationInSeconds && video.durationInSeconds > 0 && video.lastTimestamp) {
                  video.progressPercent = Math.min(
                    100,
                    Math.round((video.lastTimestamp / video.durationInSeconds) * 100)
                  );
                }
                return video;
              } catch {
                return null;
              }
            });
            const resolved = (await Promise.all(videoPromises)).filter(Boolean) as VideoWithProgress[];
            setVideos(resolved);
          }
        } else {
          const q = query(videosRef, where("status", "==", "published"), orderBy("createdAt", "desc"), limit(12));
          const snapshot = await getDocs(q);
          setVideos(snapshot.docs.map((d) => ({ videoId: d.id, ...d.data() } as Video)));
        }
      } catch (error) {
        console.error("Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, [activeTab, user]);

  const tabs: { key: TabKey; label: string; icon: React.ElementType; description: string }[] = [
    { key: "browse",    label: "Latest",     icon: TrendingUp, description: "Newest media" },
    { key: "continue",  label: "Continue",   icon: History,    description: "Pick up where you left off" },
    { key: "purchased", label: "My Library", icon: BookOpen,   description: "Items you own" },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const isPremium = isSubscriptionValid(user?.subscription);

  const statCards = [
    {
      label: "Owned",
      value: user?.purchasedVideos?.length || 0,
      icon: BookOpen,
      color: "text-primary",
      bg: "bg-primary/10",
      gradient: "from-primary/20 to-primary/5",
    },
    {
      label: "Watched",
      value: user?.watchHistory?.length || 0,
      icon: Activity,
      color: "text-accent",
      bg: "bg-accent/10",
      gradient: "from-accent/20 to-accent/5",
    }
  ];

  const emptyState: Record<TabKey, { icon: React.ElementType; title: string; text: string; action?: string; href?: string }> = {
    browse:    { icon: Flame,    title: "No media available",      text: "Check back soon for new content",                        action: "Explore",  href: "/videos" },
    continue:  { icon: Play,     title: "Nothing in progress",         text: "Start content — your progress will appear here",       action: "Browse",   href: "/videos" },
    purchased: { icon: Star,     title: "No purchased items yet",   text: "Browse the catalog to find your first purchase",          action: "Shop",     href: "/videos" },
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative pt-16 overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 mesh-bg pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/6 blur-[140px] -translate-y-1/4 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[120px] translate-y-1/4 -translate-x-1/4 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">

            {/* Left: greeting */}
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary mb-4">
                <Flame className="w-3 h-3" />
                {greeting}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] tracking-tight">
                {user?.displayName
                  ? <><span className="pr-1 brand-gradient-text">{user.displayName.split(" ")[0]}</span>,<br />let's train.</>
                  : <>Your <span className="brand-gradient-text">Premium Media</span> Hub</>
                }
              </h1>
              <p className="text-muted-foreground mt-3 max-w-md leading-relaxed">
                Pick up where you left off, discover new content, or unlock premium access.
              </p>

              {/* CTA row */}
              <div className="flex items-center gap-3 mt-6">
                <Button asChild className="brand-gradient text-white font-semibold shadow-lg shadow-primary/20 gap-2 h-11 px-5">
                  <Link href="/videos">
                    <Play className="w-4 h-4" fill="white" />
                    Browse Media
                  </Link>
                </Button>
                {!isPremium && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => openPremiumModal()}
                    className="gap-2 h-11 px-5 border-accent/30 text-accent hover:bg-accent/10"
                  >
                    <Crown className="w-4 h-4" />
                    Go Premium
                  </Button>
                )}
              </div>
            </div>

            {/* Right: stat cards */}
            <div className="flex gap-3 lg:gap-4 flex-shrink-0">
              {statCards.map((s) => (
                <div
                  key={s.label}
                  className={`glass-card rounded-2xl p-4 lg:p-5 text-center min-w-[100px] lg:min-w-[110px] bg-gradient-to-b ${s.gradient} card-hover`}
                >
                  <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-3`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* ── SUBSCRIPTION MANAGER (premium users only) ─────────── */}
      {isPremium && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <SubscriptionManager />
        </div>
      )}

      {/* ── PREMIUM BANNER (non-premium only) ─────────────────── */}
      {!isPremium && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div
            onClick={openPremiumModal}
            className="relative overflow-hidden glass-card rounded-2xl p-5 cursor-pointer group border border-accent/20 hover:border-accent/40 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent/8 via-transparent to-primary/8" />
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-accent/10 blur-3xl group-hover:bg-accent/15 transition-all" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-bold">Unlock PremiumVOD</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Unlimited access to all media, new releases, and exclusive content.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="brand-gradient-warm text-accent-foreground font-bold shrink-0 shadow-lg shadow-accent/20 group-hover:shadow-accent/30 transition-all"
              >
                Upgrade
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT TABS ──────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">

        {/* Tab header */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex gap-1 p-1 glass rounded-2xl overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? "brand-gradient text-white shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <Link href="/videos" className="shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground group"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>

        {/* Tab subtitle */}
        <p className="text-xs text-muted-foreground mb-6">
          {tabs.find((t) => t.key === activeTab)?.description}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : videos.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {videos.map((video) => (
              <div key={video.videoId} className="relative">
                <VideoCard video={video} />
                {/* Continue watching progress bar */}
                {activeTab === "continue" && video.progressPercent !== undefined && video.progressPercent > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pointer-events-none">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-white/70 font-medium">{video.progressPercent}% complete</span>
                    </div>
                    <div className="h-1.5 bg-black/50 rounded-full overflow-hidden backdrop-blur-sm">
                      <div
                        className="h-full brand-gradient rounded-full transition-all duration-500"
                        style={{ width: `${video.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Empty state */
          (() => {
            const es = emptyState[activeTab];
            return (
              <div className="text-center py-24 glass-card rounded-3xl flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
                  <es.icon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold mb-2">{es.title}</h3>
                <p className="text-muted-foreground text-sm max-w-xs">{es.text}</p>
                {es.action && es.href && (
                  <Link href={es.href} className="mt-6">
                    <Button className="brand-gradient text-white font-semibold shadow-lg shadow-primary/20 gap-2">
                      <Play className="w-4 h-4" />
                      {es.action}
                    </Button>
                  </Link>
                )}
              </div>
            );
          })()
        )}
      </section>
    </main>
  );
}