"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import VideoCard from "@/components/VideoCard";
import SkeletonCard from "@/components/SkeletonCard";
import type { Video, VideoCategory } from "@/types";
import {
  Search,
  SlidersHorizontal,
  Dumbbell,
  Loader2,
  Flame,
  Zap,
  Leaf,
  Apple,
  Activity,
  Filter,
  X,
  ChevronDown,
  Sparkles,
  Star,
  BookOpen,
  Gem,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const categories: {
  value: VideoCategory | "all";
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  { value: "all",         label: "All",           icon: Sparkles, color: "text-white",         bg: "bg-primary"       },
  { value: "featured",    label: "Featured",      icon: Star,     color: "text-orange-400",    bg: "bg-orange-500/15" },
  { value: "educational", label: "Educational",  icon: BookOpen, color: "text-yellow-400",    bg: "bg-yellow-500/15" },
  { value: "entertainment", label: "Entertainment", icon: Zap,  color: "text-emerald-400",   bg: "bg-emerald-500/15"},
  { value: "tutorial",    label: "Tutorial",      icon: Activity, color: "text-sky-400",       bg: "bg-sky-500/15"    },
  { value: "exclusive",   label: "Exclusive",     icon: Gem,      color: "text-rose-400",      bg: "bg-rose-500/15"   },
];

type SortOption = "newest" | "price_low" | "price_high" | "duration";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest",     label: "Newest first"       },
  { value: "price_low",  label: "Price: Low → High"  },
  { value: "price_high", label: "Price: High → Low"  },
  { value: "duration",   label: "Longest first"      },
];

export default function VideosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <VideosContent />
    </Suspense>
  );
}

function VideosContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category") as VideoCategory | null;

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | "all">(categoryParam || "all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const videosRef = collection(db, "videos");
        let q;
        if (selectedCategory !== "all") {
          q = query(
            videosRef,
            where("status", "==", "published"),
            where("category", "==", selectedCategory),
            orderBy("createdAt", "desc")
          );
        } else {
          q = query(videosRef, where("status", "==", "published"), orderBy("createdAt", "desc"));
        }
        const snapshot = await getDocs(q);
        setVideos(snapshot.docs.map((doc) => ({ videoId: doc.id, ...doc.data() } as Video)));
      } catch (error) {
        console.error("Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, [selectedCategory]);

  const filtered = videos
    .filter((v) =>
      searchTerm
        ? v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.description.toLowerCase().includes(searchTerm.toLowerCase())
        : true
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "price_low":  return a.priceINR - b.priceINR;
        case "price_high": return b.priceINR - a.priceINR;
        case "duration":   return b.durationInSeconds - a.durationInSeconds;
        default:           return 0;
      }
    });

  const activeCategoryMeta = categories.find((c) => c.value === selectedCategory)!;
  const activeSortLabel = sortOptions.find((s) => s.value === sortBy)?.label ?? "Newest first";

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 mesh-bg" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[130px] -translate-y-1/3" />
        <div className="absolute bottom-0 left-1/3 w-[300px] h-[300px] rounded-full bg-accent/6 blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary mb-5">
            <Flame className="w-3 h-3" />
            Media Catalog
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-heading)] tracking-tight mb-4">
            Find Your{" "}
            <span className="brand-gradient-text">Perfect</span>
            <br />
            Media
          </h1>
          <p className="text-muted-foreground max-w-lg leading-relaxed mb-8 text-base">
            Browse {videos.length > 0 ? videos.length + "+" : "hundreds of"} premium media items across multiple categories.
          </p>

          {/* Search bar — prominent in hero */}
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="video-search"
              placeholder="Search media, categories, content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 pr-10 h-13 bg-card/60 border-border/50 backdrop-blur-sm rounded-2xl text-sm focus:border-primary/50 focus:ring-primary/20 h-12"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ── CATEGORY CHIPS ────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0 border ${
                  isActive
                    ? "brand-gradient text-white shadow-lg shadow-primary/20 border-transparent"
                    : `${cat.bg} ${cat.color} border-transparent hover:border-border/30 hover:shadow-sm`
                }`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isActive ? "bg-white/20" : ""}`}>
                  <cat.icon className="w-3.5 h-3.5" />
                </div>
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── RESULTS TOOLBAR ───────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Result count + active filter badge */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-4 w-32 bg-muted/40 rounded-lg animate-pulse" />
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{filtered.length}</span>{" "}
                item{filtered.length !== 1 ? "s" : ""}
                {searchTerm && (
                  <span className="ml-1">matching <span className="text-primary font-medium">"{searchTerm}"</span></span>
                )}
              </p>
            )}
            {selectedCategory !== "all" && (
              <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${activeCategoryMeta.bg} ${activeCategoryMeta.color}`}>
                <activeCategoryMeta.icon className="w-3 h-3" />
                {activeCategoryMeta.label}
                <button
                  onClick={() => setSelectedCategory("all")}
                  className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors glass px-3.5 py-2 rounded-xl border border-border/30 hover:border-border/60"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{activeSortLabel}</span>
              <span className="sm:hidden">Sort</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 glass-card rounded-xl p-1.5 z-20 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${
                      sortBy === opt.value
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── VIDEO GRID ────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((video) => (
              <VideoCard key={video.videoId} video={video} />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-28 glass-card rounded-3xl flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl bg-muted/40 flex items-center justify-center mb-6 relative">
              <Dumbbell className="w-10 h-10 text-muted-foreground/50" />
              {searchTerm && (
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-destructive/80 flex items-center justify-center">
                  <Search className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <h3 className="text-xl font-bold mb-2">
              {searchTerm ? "No media found" : "Nothing here yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
              {searchTerm
                ? `No results for "${searchTerm}". Try a different term or clear the filter.`
                : "Check back soon — new content is on the way."}
            </p>
            {(searchTerm || selectedCategory !== "all") && (
              <div className="flex gap-3 mt-6">
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="text-sm text-primary font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear search
                  </button>
                )}
                {selectedCategory !== "all" && (
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className="text-sm text-primary font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Show all categories
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Close sort on click-outside */}
      {sortOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
      )}
    </main>
  );
}
