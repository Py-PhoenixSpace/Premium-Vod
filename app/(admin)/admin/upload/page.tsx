"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Loader2,
  CheckCircle,
  Film,
  ImageIcon,
  AlertCircle,
  Sparkles,
  HardDrive,
  Database,
} from "lucide-react";
import type { MediaType, VideoCategory } from "@/types";

interface BucketUsage {
  id: string;
  label: string;
  cloudName: string;
  usedGB: number;
  limitGB: number;
  percent: number;
  error?: string;
}

export default function AdminUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<VideoCategory>("featured");
  const [priceINR, setPriceINR] = useState("");
  const [priceUSD, setPriceUSD] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [storageBucket, setStorageBucket] = useState("bucket-1");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Storage usage
  const [buckets, setBuckets] = useState<BucketUsage[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(true);

  useEffect(() => {
    async function fetchBuckets() {
      try {
        const res = await fetch("/api/admin/storage");
        if (res.ok) {
          const data = await res.json();
          setBuckets(data.buckets || []);
          if (data.buckets?.length > 0) {
            setStorageBucket(data.buckets[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load storage buckets:", err);
      } finally {
        setBucketsLoading(false);
      }
    }
    fetchBuckets();
  }, []);

  // Duplicate title check — debounced 600ms after user stops typing
  const checkDuplicate = useCallback(async (titleValue: string) => {
    if (!titleValue.trim() || titleValue.length < 3) {
      setDuplicateWarning(false);
      return;
    }
    setCheckingDuplicate(true);
    try {
      const res = await fetch(`/api/admin/check-title?title=${encodeURIComponent(titleValue.trim())}`);
      if (res.ok) {
        const { exists } = await res.json();
        setDuplicateWarning(exists);
      }
    } catch {
      // silent — non-blocking
    } finally {
      setCheckingDuplicate(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => checkDuplicate(title), 600);
    return () => clearTimeout(timer);
  }, [title, checkDuplicate]);

  useEffect(() => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [mediaType]);

  function getBarColor(percent: number) {
    if (percent >= 85) return "from-red-500 to-red-400";
    if (percent >= 60) return "from-yellow-500 to-amber-400";
    return "from-primary to-violet-400";
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(`Please select a ${mediaType} file`);
      return;
    }
    setUploading(true);
    setError("");
    setProgress(0);
    try {
      const signRes = await fetch("/api/video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          mediaType,
          priceINR: Number(priceINR) || 0,
          priceUSD: Number(priceUSD) || 0,
          isPremium,
          storageBucket,
        }),
      });
      if (!signRes.ok) throw new Error("Failed to get upload signature");
      const signData = await signRes.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signData.apiKey);
      formData.append("timestamp", signData.timestamp.toString());
      formData.append("signature", signData.signature);
      formData.append("folder", signData.folder);
      formData.append("public_id", signData.publicId);
      formData.append("overwrite", "false");
      formData.append("invalidate", "false");
      if (signData.eager) formData.append("eager", signData.eager);
      if (signData.eagerAsync) formData.append("eager_async", signData.eagerAsync);
      if (signData.notificationUrl) formData.append("eager_notification_url", signData.notificationUrl);

      const xhr = new XMLHttpRequest();
      const cloudinaryResourceType = signData.mediaType || mediaType;
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${signData.cloudName}/${cloudinaryResourceType}/upload`);
      xhr.timeout = 120000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };

      const cloudinaryResponse: any = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve({});
            }
          } else {
            reject(new Error("Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
        xhr.send(formData);
      });

      setProgress(100);

      // Finalize the video in Firestore using Cloudinary's response data
      const finalizedPublicId = cloudinaryResponse.public_id || `${signData.folder}/${signData.publicId}`;
      const finalizeRes = await fetch("/api/video/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: signData.videoId,
          publicId: finalizedPublicId,
          duration: cloudinaryResponse.duration || 0,
          secureUrl: cloudinaryResponse.secure_url || "",
          title,
          description,
          category,
          mediaType,
          priceINR: Number(priceINR) || 0,
          priceUSD: Number(priceUSD) || 0,
          isPremium,
          storageBucket: signData.storageBucket || storageBucket,
        }),
      });
      if (!finalizeRes.ok) {
        throw new Error("Upload succeeded, but metadata save failed. Please retry.");
      }

      setSuccess(true);
      setTitle(""); setDescription(""); setPriceINR(""); setPriceUSD(""); setIsPremium(false); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
          Upload <span className="brand-gold-text">Media</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload videos or images to Cloudinary with secure delivery
        </p>
      </div>

      {success && (
        <div className="bg-accent/10 border border-accent/20 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Uploaded successfully!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mediaType === "image"
                ? "Image has been saved and is now available in the catalog."
                : "Video has been saved and will be stream-ready shortly."}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl px-5 py-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6">
        <form onSubmit={handleUpload} className="space-y-6">
          {/* Media Type Selector */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Media Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "video", label: "Video", icon: Film },
                { value: "image", label: "Image", icon: ImageIcon },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMediaType(item.value)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                    mediaType === item.value
                      ? "border-primary/50 bg-primary/5 text-foreground"
                      : "border-border/20 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Storage Bucket Selector */}
          <div>
            <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Storage Destination
            </Label>
            {bucketsLoading ? (
              <div className="flex items-center gap-2 p-4 border border-border/20 rounded-xl">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Loading storage buckets...</span>
              </div>
            ) : buckets.length > 0 ? (
              <div className="grid gap-3">
                {buckets.map((bucket) => (
                  <label
                    key={bucket.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      storageBucket === bucket.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/20 hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="storageBucket"
                      value={bucket.id}
                      checked={storageBucket === bucket.id}
                      onChange={() => setStorageBucket(bucket.id)}
                      className="w-4 h-4 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold">{bucket.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{bucket.cloudName}</span>
                        </div>
                        <span className={`text-xs font-bold ${
                          bucket.percent >= 85 ? "text-red-400" : 
                          bucket.percent >= 60 ? "text-yellow-400" : "text-primary"
                        }`}>
                          {bucket.percent}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${getBarColor(bucket.percent)} transition-all duration-500`}
                          style={{ width: `${Math.min(bucket.percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {bucket.usedGB.toFixed(2)} GB / {bucket.limitGB} GB used
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4 border border-border/20 rounded-xl">
                Using default storage. Configure buckets in environment variables.
              </p>
            )}
          </div>

          {/* File dropzone */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              {mediaType === "image" ? "Image File" : "Video File"}
            </Label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                file ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    {mediaType === "image" ? (
                      <ImageIcon className="w-6 h-6 text-primary" />
                    ) : (
                      <Film className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    {mediaType === "image" ? (
                      <ImageIcon className="w-7 h-7 text-muted-foreground" />
                    ) : (
                      <Upload className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {mediaType === "image" ? "Click to select image file" : "Click to select video file"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {mediaType === "image"
                      ? "JPG, PNG, or WebP"
                      : "MP4, MOV, or WebM"}
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={mediaType === "image" ? "image/*" : "video/*"}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Title with duplicate check */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <div className="relative">
              <Input
                id="title"
                placeholder="e.g., 30-Minute Premium Video Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={`h-11 bg-muted/30 pr-8 ${
                  duplicateWarning ? "border-amber-500/60" : "border-border/40"
                }`}
              />
              {checkingDuplicate && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {duplicateWarning && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                A video with this title already exists. Consider making the title unique.
              </p>
            )}
          </div>

          {/* Description with char count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <span className={`text-xs tabular-nums ${
                description.length > 450 ? "text-amber-500" : "text-muted-foreground"
              }`}>
                {description.length} / 500
              </span>
            </div>
            <textarea
              id="description"
              placeholder="Describe the video, content type, key highlights..."
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={3}
              className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value as VideoCategory)}
              className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm outline-none h-11">
              <option value="featured">Featured</option>
              <option value="educational">Educational</option>
              <option value="entertainment">Entertainment</option>
              <option value="tutorial">Tutorial</option>
              <option value="exclusive">Exclusive</option>
            </select>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceINR">Price (INR)</Label>
              <Input id="priceINR" type="number" placeholder="0 = free" value={priceINR} onChange={(e) => setPriceINR(e.target.value)} className="h-11 bg-muted/30 border-border/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceUSD">Price (USD)</Label>
              <Input id="priceUSD" type="number" placeholder="0 = free" value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} className="h-11 bg-muted/30 border-border/40" />
            </div>
          </div>

          {/* Premium toggle */}
          <label htmlFor="isPremium" className="flex items-center gap-3 cursor-pointer glass rounded-xl px-4 py-3">
            <input id="isPremium" type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Include in PremiumVOD Premium</span>
            </div>
          </label>

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Uploading {mediaType} to {buckets.find(b => b.id === storageBucket)?.label || "Cloudinary"}...
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full brand-gradient rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <Button type="submit" disabled={uploading} className="w-full h-12 brand-gradient text-white font-semibold shadow-lg shadow-primary/20">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? `Uploading (${progress}%)` : `Upload ${mediaType === "image" ? "Image" : "Video"}`}
          </Button>
        </form>
      </div>
    </div>
  );
}