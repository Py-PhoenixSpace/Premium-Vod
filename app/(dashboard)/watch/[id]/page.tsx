"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import Navbar from "@/components/Navbar";
import VideoPlayer from "@/components/VideoPlayer";
import PurchaseButton from "@/components/PurchaseButton";
import SubscribeButton from "@/components/SubscribeButton";
import type { Video } from "@/types";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import {
  Clock,
  Dumbbell,
  Crown,
  Loader2,
  ArrowLeft,
  Lock,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

const categoryLabels: Record<string, string> = {
  featured: "Featured Content",
  educational: "Educational Content",
  entertainment: "Entertainment",
  tutorial: "Tutorials & How-to",
  exclusive: "Exclusive Content",
};

export default function WatchPage() {
  const params = useParams();
  const videoId = params.id as string;
  const { user } = useAuthStore();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    async function fetchVideo() {
      try {
        const videoDoc = await getDoc(doc(db, "videos", videoId));
        if (videoDoc.exists()) {
          const v = { videoId: videoDoc.id, ...videoDoc.data() } as Video;
          setVideo(v);
          const isFree = v.priceINR === 0 && !v.isPremium;
          const hasPurchased = user?.purchasedVideos?.includes(videoId) || false;
          const isAdmin = user?.role === "admin" || user?.role === "super-admin";
          const hasSubscription = isSubscriptionValid(user?.subscription);
          setHasAccess(isFree || hasPurchased || hasSubscription || isAdmin);
        }
      } catch (error) {
        console.error("Failed to fetch video:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchVideo();
  }, [videoId, user]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </main>
    );
  }

  if (!video) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <div className="pt-24 text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Content not found</h2>
          <p className="text-muted-foreground mb-6">
            This item may have been removed or doesn&apos;t exist.
          </p>
          <Link href="/videos" className="inline-flex items-center gap-2 brand-gradient text-white font-semibold px-6 py-3 rounded-xl">
            Browse Library
          </Link>
        </div>
      </main>
    );
  }

  const durationMins = Math.floor(video.durationInSeconds / 60);
  const mediaType = video.mediaType === "image" ? "image" : "video";

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 pb-12 relative">
        <div className="absolute inset-0 mesh-bg opacity-40" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Link
            href="/videos"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 sm:mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </Link>

          <div className="grid lg:grid-cols-3 gap-5 sm:gap-8">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Player */}
              <VideoPlayer videoId={videoId} />

              {/* Video Info */}
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h1 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-heading)]">
                    {video.title}
                  </h1>
                  {video.isPremium && (
                    <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-3 py-1.5 rounded-full border border-accent/20">
                      <Crown className="w-3 h-3" />
                      Premium
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
                  {mediaType === "video" ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {durationMins} min
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Dumbbell className="w-4 h-4" />
                      Image Content
                    </span>
                  )}
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                  <span className="flex items-center gap-1.5">
                    <Dumbbell className="w-4 h-4" />
                    {categoryLabels[video.category] || video.category}
                  </span>
                </div>

                <div className="section-divider mb-5" />

                <p className="text-foreground/75 leading-relaxed">
                  {video.description}
                </p>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Access / purchase card */}
              {!hasAccess && (
                <div className="glass-card rounded-2xl gradient-border p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold">Unlock This Content</h3>
                      <p className="text-xs text-foreground/80">Get access and start viewing</p>
                    </div>
                  </div>

                  {video.priceINR > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/80 mb-2">
                        Buy this item
                      </p>
                      <PurchaseButton
                        videoId={videoId}
                        priceINR={video.priceINR}
                        videoTitle={video.title}
                        onPurchaseComplete={() => setHasAccess(true)}
                      />
                    </div>
                  )}

                  {video.isPremium && (
                    <div className="border-t border-border/20 pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/80 mb-2">
                        Or get unlimited access
                      </p>
                      <SubscribeButton />
                    </div>
                  )}
                </div>
              )}

              {/* Details card */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="font-bold mb-4">Content Details</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: "Category", value: video.category, capitalize: true },
                    {
                      label: "Type",
                      value: mediaType === "image" ? "Image" : "Video",
                    },
                    {
                      label: "Duration",
                      value: mediaType === "image" ? "N/A" : `${durationMins} min`,
                    },
                    {
                      label: "Price",
                      value: video.priceINR === 0 ? "Free" : `₹${video.priceINR}`,
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between py-1.5 border-b border-border/10 last:border-0">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={`font-medium ${item.capitalize ? "capitalize" : ""}`}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Access</span>
                    <span className="font-medium flex items-center gap-1">
                      {hasAccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                          <span className="text-accent">Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Locked</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}