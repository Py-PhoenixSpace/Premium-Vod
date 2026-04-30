"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Video } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Film,
  ImageIcon,
  Archive,
  Eye,
  Loader2,
  Clock,
  CheckCircle,
  IndianRupee,
  RotateCcw,
  HardDrive,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type FilterStatus = "all" | "published" | "processing" | "archived";

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [archiving, setArchiving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    category: "",
    priceINR: 0,
    priceUSD: 0,
    isPremium: false,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const q = query(collection(db, "videos"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setVideos(
          snapshot.docs.map((d) => ({ videoId: d.id, ...d.data() } as Video))
        );
      } catch (error) {
        console.error("Failed to fetch videos:", error);
        toast.error("Failed to load media items. Please refresh.");
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, []);

  /**
   * Routes through the server-side /api/video/archive endpoint.
   * Previously used a direct client-side Firestore write, which bypassed
   * server-side authentication — any authenticated user could archive videos.
   */
  async function toggleArchive(videoId: string, currentStatus: string) {
    setArchiving(videoId);
    try {
      const res = await fetch("/api/video/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }

      const { status: newStatus } = await res.json();
      setVideos((prev) =>
        prev.map((v) =>
          v.videoId === videoId ? { ...v, status: newStatus as any } : v
        )
      );
      toast.success(
        newStatus === "archived" ? "Item archived." : "Item restored."
      );
    } catch (error: any) {
      console.error("Archive toggle failed:", error);
      toast.error(error.message || "Failed to update item status.");
    } finally {
      setArchiving(null);
    }
  }

  async function deleteVideo(videoId: string, title: string) {
    if (
      !confirm(
        `Permanently delete "${title || "Untitled"}"? This removes it from Cloudinary and cannot be undone.`
      )
    )
      return;

    setDeleting(videoId);
    try {
      const res = await fetch("/api/video/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }

      setVideos((prev) => prev.filter((v) => v.videoId !== videoId));
      toast.success("Item permanently deleted.");
    } catch (error: any) {
      console.error("Failed to delete video:", error);
      toast.error(error.message || "Failed to delete item.");
    } finally {
      setDeleting(null);
    }
  }

  function openEditModal(video: Video) {
    setEditingVideo(video);
    setEditFormData({
      title: video.title || "",
      description: video.description || "",
      category: video.category || "educational",
      priceINR: video.priceINR || 0,
      priceUSD: video.priceUSD || 0,
      isPremium: video.isPremium || false,
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingVideo) return;
    
    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/video/edit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: editingVideo.videoId,
          ...editFormData,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update video");
      }

      const { updates } = await res.json();
      setVideos((prev) =>
        prev.map((v) =>
          v.videoId === editingVideo.videoId ? { ...v, ...updates } : v
        )
      );
      toast.success("Video metadata updated successfully.");
      setEditingVideo(null);
    } catch (error: any) {
      console.error("Edit save failed:", error);
      toast.error(error.message || "Failed to save changes.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  const filtered =
    filterStatus === "all"
      ? videos
      : videos.filter((v) => v.status === filterStatus);

  const statusStyles: Record<string, string> = {
    published: "bg-accent/10 text-accent",
    processing: "bg-yellow-500/10 text-yellow-500",
    archived: "bg-muted text-muted-foreground",
  };

  const bucketStyles: Record<string, string> = {
    "bucket-1": "bg-primary/10 text-primary",
    "bucket-2": "bg-chart-3/10 text-chart-3",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-full overflow-x-hidden">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
            Manage <span className="brand-gradient-text">Library</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {videos.length} total media items
          </p>
        </div>
        <a href="/admin/upload" className="w-full sm:w-auto">
          <Button className="brand-gradient text-white font-semibold shadow-lg shadow-primary/20 gap-2 w-full sm:w-auto">
            <Film className="w-4 h-4" />
            Upload New
          </Button>
        </a>
      </div>

      {/* Filters */}
      <div className="mb-6 overflow-x-auto pb-1">
        <div className="glass-card inline-flex min-w-full gap-1 rounded-xl p-1 sm:min-w-0">
          {(["all", "published", "processing", "archived"] as FilterStatus[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all sm:px-4 ${
                  filterStatus === status
                    ? "brand-gradient text-white shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                {status !== "all" &&
                  ` (${videos.filter((v) => v.status === status).length})`}
              </button>
            )
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20">
                {[
                  "Title",
                  "Type",
                  "Category",
                  "Status",
                  "Storage",
                  "Price",
                  "Premium",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className={`py-4 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ${
                      h === "Actions" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((video) => (
                <tr
                  key={video.videoId}
                  className="border-b border-border/10 hover:bg-muted/10 transition-colors"
                >
                  <td className="py-4 px-5">
                    <p className="font-medium truncate max-w-[220px]">
                      {video.title || "Untitled"}
                    </p>
                    {video.mediaType !== "image" && video.durationInSeconds > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {Math.floor(video.durationInSeconds / 60)} min
                      </p>
                    )}
                  </td>
                  <td className="py-4 px-5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {video.mediaType === "image" ? (
                        <>
                          <ImageIcon className="w-3.5 h-3.5" />
                          Image
                        </>
                      ) : (
                        <>
                          <Film className="w-3.5 h-3.5" />
                          Video
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-4 px-5 capitalize text-muted-foreground">
                    {video.category}
                  </td>
                  <td className="py-4 px-5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                        statusStyles[video.status] || ""
                      }`}
                    >
                      {video.status}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                        bucketStyles[video.storageBucket || "bucket-1"] ||
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      <HardDrive className="w-3 h-3" />
                      {video.storageBucket === "bucket-2" ? "B2" : "B1"}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    {video.priceINR === 0 ? (
                      <span className="text-accent text-xs font-bold">
                        Free
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 font-semibold">
                        <IndianRupee className="w-3 h-3" />
                        {video.priceINR}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-5">
                    {video.isPremium ? (
                      <CheckCircle className="w-4 h-4 text-accent" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/watch/${video.videoId}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditModal(video)}
                        title="Edit metadata"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          toggleArchive(video.videoId, video.status)
                        }
                        disabled={
                          archiving === video.videoId ||
                          video.status === "processing"
                        }
                        title={
                          video.status === "archived"
                            ? "Restore item"
                            : "Archive item"
                        }
                      >
                        {archiving === video.videoId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : video.status === "archived" ? (
                          <RotateCcw className="w-4 h-4" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteVideo(video.videoId, video.title)}
                        disabled={deleting === video.videoId}
                        title="Delete permanently"
                      >
                        {deleting === video.videoId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-14 text-center text-muted-foreground"
                  >
                    No media found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 lg:hidden">
        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center text-muted-foreground">
            No media found
          </div>
        ) : (
          filtered.map((video) => (
            <div key={video.videoId} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {video.title || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    {video.category}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                    statusStyles[video.status] || ""
                  }`}
                >
                  {video.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {video.mediaType === "image" ? (
                    <>
                      <ImageIcon className="w-3.5 h-3.5" />
                      Image
                    </>
                  ) : (
                    <>
                      <Film className="w-3.5 h-3.5" />
                      Video
                    </>
                  )}
                </span>

                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                    bucketStyles[video.storageBucket || "bucket-1"] ||
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  <HardDrive className="w-3 h-3" />
                  {video.storageBucket === "bucket-2" ? "B2" : "B1"}
                </span>

                {video.mediaType !== "image" && video.durationInSeconds > 0 && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {Math.floor(video.durationInSeconds / 60)} min
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                {video.priceINR === 0 ? (
                  <span className="text-accent text-xs font-bold">Free</span>
                ) : (
                  <span className="flex items-center gap-0.5 font-semibold">
                    <IndianRupee className="w-3 h-3" />
                    {video.priceINR}
                  </span>
                )}

                {video.isPremium ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    <CheckCircle className="w-3.5 h-3.5" /> Premium
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Standard</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/20 pt-3">
                <a href={`/watch/${video.videoId}`}>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </Button>
                </a>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => openEditModal(video)}
                  title="Edit metadata"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => toggleArchive(video.videoId, video.status)}
                  disabled={archiving === video.videoId || video.status === "processing"}
                  title={video.status === "archived" ? "Restore item" : "Archive item"}
                >
                  {archiving === video.videoId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : video.status === "archived" ? (
                    <RotateCcw className="w-3.5 h-3.5" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  {video.status === "archived" ? "Restore" : "Archive"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => deleteVideo(video.videoId, video.title)}
                  disabled={deleting === video.videoId}
                  title="Delete permanently"
                >
                  {deleting === video.videoId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal Overlay */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border/40 bg-muted/20">
              <h2 className="font-bold text-lg">Edit Media Details</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingVideo(null)}
                className="h-8 w-8 rounded-full hover:bg-muted"
                disabled={isSavingEdit}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <form id="edit-video-form" onSubmit={handleSaveEdit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={editFormData.title}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground"
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                  >
                    <option value="educational">Educational</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="featured">Featured</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="exclusive">Exclusive</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priceINR">Price (INR)</Label>
                    <Input
                      id="priceINR"
                      type="number"
                      min="0"
                      value={editFormData.priceINR}
                      onChange={(e) => setEditFormData({ ...editFormData, priceINR: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priceUSD">Price (USD)</Label>
                    <Input
                      id="priceUSD"
                      type="number"
                      min="0"
                      value={editFormData.priceUSD}
                      onChange={(e) => setEditFormData({ ...editFormData, priceUSD: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isPremium"
                    className="h-4 w-4 rounded border-input bg-transparent text-primary"
                    checked={editFormData.isPremium}
                    onChange={(e) => setEditFormData({ ...editFormData, isPremium: e.target.checked })}
                  />
                  <Label htmlFor="isPremium" className="cursor-pointer">Premium Content</Label>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border/40 bg-muted/10 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingVideo(null)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-video-form"
                disabled={isSavingEdit}
                className="brand-gradient text-white shadow-lg shadow-primary/20 gap-2"
              >
                {isSavingEdit ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
