"use client";

import Link from "next/link";
import Image from "next/image";
import type { Video } from "@/types";
import { Clock, Crown, Play, Lock, Zap, ImageIcon } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { useState } from "react";

interface VideoCardProps {
  video: Video;
}

const categoryColors: Record<string, string> = {
  featured:      "bg-orange-500/80",
  educational:   "bg-yellow-500/80",
  entertainment: "bg-emerald-500/80",
  tutorial:      "bg-sky-500/80",
  exclusive:     "bg-rose-500/80",
};

export default function VideoCard({ video }: VideoCardProps) {
  const { user } = useAuthStore();

  const mediaType = video.mediaType === "image" ? "image" : "video";
  const durationMins = Math.floor(video.durationInSeconds / 60);
  const durationSecs = video.durationInSeconds % 60;
  const isFree = video.priceINR === 0 && !video.isPremium;
  const isAdmin = user?.role === "admin" || user?.role === "super-admin";
  const isPremiumUser = isAdmin || isSubscriptionValid(user?.subscription);
  const hasPurchased = user?.purchasedVideos?.includes(video.videoId) ?? false;
  const hasAccess = isFree || isPremiumUser || hasPurchased;
  const isLocked = !hasAccess && (video.isPremium || video.priceINR > 0);

  const catColor = categoryColors[video.category ?? ""] ?? "bg-primary/80";

  // Auto-generate thumbnail from cloudinaryPublicId for videos missing thumbnailUrl
  // (covers uploads that existed before the finalize-route thumbnail fix).
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const autoThumb = (!video.thumbnailUrl && video.cloudinaryPublicId && cloudName && video.mediaType !== "image")
    ? `https://res.cloudinary.com/${cloudName}/video/upload/so_0,f_jpg,q_auto,w_640/${video.cloudinaryPublicId}`
    : null;

  const [imgError, setImgError] = useState(false);
  const effectiveThumb = (!imgError && (video.thumbnailUrl || autoThumb)) || null;

  return (
    <Link href={`/watch/${video.videoId}`} className="block group" tabIndex={0}>
      <div className="glass-card rounded-2xl overflow-hidden card-hover bg-card/50 flex flex-col h-full">

        {/* ── Thumbnail ─────────────────────────────────────────── */}
        <div className="relative aspect-video overflow-hidden bg-muted/30 flex-shrink-0">
          {effectiveThumb ? (
            <Image
              src={effectiveThumb}
              alt={video.title}
              fill
              className={`object-cover transition-all duration-500 group-hover:scale-105 ${
                isLocked ? "blur-sm scale-105 brightness-50" : "brightness-95 group-hover:brightness-100"
              }`}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              onError={() => setImgError(true)}
              unoptimized
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br from-primary/20 via-muted to-accent/10 flex items-center justify-center ${isLocked ? "brightness-50" : ""}`}>
              {mediaType === "image" ? (
                <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
              ) : (
                <Play className="w-10 h-10 text-muted-foreground/30" />
              )}
            </div>
          )}

          {/* Gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

          {/* Lock overlay */}
          {isLocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-black/60 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20 shadow-xl">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                {video.isPremium ? "Premium" : `₹${video.priceINR}`}
              </span>
            </div>
          ) : (
            /* Play hover overlay */
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300 shadow-2xl border border-white/30">
                {mediaType === "image" ? (
                  <ImageIcon className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                )}
              </div>
            </div>
          )}

          {/* Duration badge — bottom right */}
          {mediaType === "video" && video.durationInSeconds > 0 && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] font-semibold bg-black/65 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg">
              <Clock className="w-2.5 h-2.5" />
              {durationMins}:{durationSecs.toString().padStart(2, "0")}
            </span>
          )}

          {mediaType === "image" && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] font-semibold bg-black/65 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg">
              <ImageIcon className="w-2.5 h-2.5" />
              Image
            </span>
          )}

          {/* Category pill — bottom left */}
          {video.category && (
            <span className={`absolute bottom-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-lg ${catColor} backdrop-blur-sm`}>
              {video.category}
            </span>
          )}

          {/* Premium badge — top left */}
          {video.isPremium && (
            <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent/90 text-accent-foreground px-2.5 py-1 rounded-lg shadow-lg">
              <Crown className="w-2.5 h-2.5" />
              Premium
            </span>
          )}

          {/* Free badge */}
          {isFree && (
            <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/90 text-white px-2.5 py-1 rounded-lg">
              <Zap className="w-2.5 h-2.5" />
              Free
            </span>
          )}
        </div>

        {/* ── Info ──────────────────────────────────────────────── */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-semibold text-sm line-clamp-2 leading-snug mb-1.5 group-hover:text-primary transition-colors duration-200">
            {video.title || "Untitled Item"}
          </h3>
          {video.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3 flex-1">
              {video.description}
            </p>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-auto">
            <span className="text-[11px] font-medium text-muted-foreground">
              {mediaType === "video" && durationMins > 0 ? `${durationMins} min` : mediaType === "image" ? "Image" : "—"}
            </span>
            <span
              className={`text-xs font-bold flex items-center gap-1 ${
                hasAccess && !isFree
                  ? "text-emerald-500"
                  : isFree
                  ? "text-sky-500"
                  : "brand-gradient-text"
              }`}
            >
              {hasAccess && !isFree ? (
                <>✓ Unlocked</>
              ) : isFree ? (
                "Free"
              ) : (
                `₹${video.priceINR}`
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}