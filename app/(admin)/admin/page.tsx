"use client";

import { useEffect, useState, useRef } from "react";
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlatformStats, Transaction } from "@/types";
import { toast } from "sonner";
import {
  DEFAULT_SOCIAL_LINKS,
  socialLinksSchema,
  type SocialLinks,
} from "@/lib/social-links";
import {
  IndianRupee,
  DollarSign,
  Users,
  Crown,
  TrendingUp,
  Loader2,
  HardDrive,
  Database,
  RefreshCw,
  Info,
  Save,
  ImageIcon,
  Upload,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface BucketUsage {
  id: string;
  label: string;
  cloudName: string;
  usedGB: number;
  limitGB: number;
  percent: number;
  plan?: string;
  error?: string;
}

interface SocialLinksMeta {
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByRole: string | null;
  version: number;
}

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17.53 3h3.31l-7.24 8.27L22 21h-6.54l-5.12-6.43L4.67 21H1.35l7.74-8.85L1 3h6.7l4.63 5.82L17.53 3zm-1.15 16h1.83L6.7 4.9H4.74z" />
  </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M12.04 2.33A9.9 9.9 0 0 0 2.5 16.81L1.4 21.4l4.71-1.24a9.9 9.9 0 0 0 4.72 1.2h.01c5.48 0 9.92-4.45 9.92-9.92a9.9 9.9 0 0 0-8.72-9.11zm-1.2 17.17h-.01a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-2.67.7.71-2.6-.19-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.53 3.68-8.21 8.22-8.21a8.17 8.17 0 0 1 5.81 2.41 8.15 8.15 0 0 1 2.4 5.8c0 4.54-3.68 8.22-8.21 8.22zm4.5-6.1c-.25-.12-1.45-.71-1.67-.79-.22-.08-.39-.12-.55.13-.16.25-.63.79-.78.95-.14.16-.29.18-.53.06a6.76 6.76 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.25-.02-.38.1-.5.11-.1.24-.27.37-.4.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.47-.4-.41-.55-.42-.14-.01-.3-.01-.47-.01-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.06 0 1.22.89 2.39 1.01 2.55.12.17 1.73 2.64 4.18 3.7.58.25 1.04.4 1.4.51.58.19 1.12.16 1.54.1.47-.07 1.45-.6 1.66-1.17.2-.57.2-1.07.14-1.17-.06-.11-.22-.17-.47-.3z" />
  </svg>
);

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<BucketUsage[]>([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    DEFAULT_SOCIAL_LINKS
  );
  const [initialSocialLinks, setInitialSocialLinks] = useState<SocialLinks>(
    DEFAULT_SOCIAL_LINKS
  );
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialSaving, setSocialSaving] = useState(false);
  const [socialMeta, setSocialMeta] = useState<SocialLinksMeta>({
    updatedAt: null,
    updatedBy: null,
    updatedByRole: null,
    version: 0,
  });

  // Dashboard UI
  const [dashboardImageUrl, setDashboardImageUrl] = useState<string | null>(null);
  const [dashboardImageFile, setDashboardImageFile] = useState<File | null>(null);
  const [uiLoading, setUiLoading] = useState(true);
  const [uiSaving, setUiSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const statsDoc = await getDoc(doc(db, "platformStats", "totals"));
        if (statsDoc.exists()) setStats(statsDoc.data() as PlatformStats);

        const txRef = collection(db, "transactions");
        const txQuery = query(txRef, orderBy("createdAt", "desc"), limit(20));
        const txSnapshot = await getDocs(txQuery);
        setTransactions(
          txSnapshot.docs.map((d) => ({ transactionId: d.id, ...d.data() } as Transaction))
        );
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch storage usage
  async function fetchStorage() {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/admin/storage");
      if (res.ok) {
        const data = await res.json();
        setBuckets(data.buckets || []);
        setLastFetched(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch storage:", error);
    } finally {
      setStorageLoading(false);
    }
  }
  useEffect(() => { fetchStorage(); }, []);

  useEffect(() => {
    async function loadSocialLinks() {
      setSocialLoading(true);
      try {
        const res = await fetch("/api/admin/social-links", { cache: "no-store" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load social links");
        }

        const data = await res.json();
        const links = data.links || DEFAULT_SOCIAL_LINKS;
        const next: SocialLinks = {
          instagram: links.instagram || DEFAULT_SOCIAL_LINKS.instagram,
          twitter: links.twitter || DEFAULT_SOCIAL_LINKS.twitter,
          whatsapp: links.whatsapp || DEFAULT_SOCIAL_LINKS.whatsapp,
        };

        setSocialLinks(next);
        setInitialSocialLinks(next);
        setSocialMeta({
          updatedAt: data.meta?.updatedAt || null,
          updatedBy: data.meta?.updatedBy || null,
          updatedByRole: data.meta?.updatedByRole || null,
          version: Number(data.meta?.version || 0),
        });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load social links settings"));
      } finally {
        setSocialLoading(false);
      }
    }

    loadSocialLinks();
  }, []);

  useEffect(() => {
    async function loadDashboardUI() {
      setUiLoading(true);
      try {
        const res = await fetch("/api/admin/dashboard-ui", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setDashboardImageUrl(data.imageUrl || null);
        }
      } catch (error) {
        console.error("Failed to load dashboard UI settings:", error);
      } finally {
        setUiLoading(false);
      }
    }
    loadDashboardUI();
  }, []);

  function handleDashboardImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setDashboardImageFile(file);
    }
  }

  async function handleSaveDashboardUI() {
    if (!dashboardImageFile && !dashboardImageUrl) return;
    setUiSaving(true);
    setUploadProgress(0);

    try {
      let finalUrl = dashboardImageUrl;

      if (dashboardImageFile) {
        // Upload to Cloudinary
        const signRes = await fetch("/api/video/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaType: "image", storageBucket: "default" }),
        });
        
        if (!signRes.ok) throw new Error("Failed to get upload signature");
        const signData = await signRes.json();

        const formData = new FormData();
        formData.append("file", dashboardImageFile);
        formData.append("api_key", signData.apiKey);
        formData.append("timestamp", signData.timestamp.toString());
        formData.append("signature", signData.signature);
        formData.append("folder", signData.folder);
        formData.append("public_id", signData.publicId);
        formData.append("overwrite", "false");
        formData.append("invalidate", "false");
        
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        const cloudinaryResponse: any = await new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error("Upload failed"));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(formData);
        });

        finalUrl = cloudinaryResponse.secure_url;
      }

      // Save URL to Firestore via our new API
      const saveRes = await fetch("/api/admin/dashboard-ui", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: finalUrl }),
      });

      if (!saveRes.ok) throw new Error("Failed to save UI settings");

      setDashboardImageUrl(finalUrl);
      setDashboardImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      toast.success("Dashboard UI updated successfully");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update Dashboard UI"));
    } finally {
      setUiSaving(false);
      setUploadProgress(0);
    }
  }

  async function handleRemoveDashboardImage() {
    setDashboardImageUrl(null);
    setDashboardImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    
    // Auto-save the removal
    setUiSaving(true);
    try {
      const saveRes = await fetch("/api/admin/dashboard-ui", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: null }),
      });
      if (!saveRes.ok) throw new Error("Failed to save UI settings");
      toast.success("Dashboard Image removed");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to remove Dashboard Image"));
    } finally {
      setUiSaving(false);
    }
  }

  function handleSocialLinkChange(key: keyof SocialLinks, value: string) {
    setSocialLinks((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveSocialLinks(e: React.FormEvent) {
    e.preventDefault();

    const parsed = socialLinksSchema.safeParse(socialLinks);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Invalid social links");
      return;
    }

    setSocialSaving(true);
    try {
      const res = await fetch("/api/admin/social-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.details?.[0] || "Failed to save social links");
      }

      const next: SocialLinks = {
        instagram: data.links?.instagram || parsed.data.instagram,
        twitter: data.links?.twitter || parsed.data.twitter,
        whatsapp: data.links?.whatsapp || parsed.data.whatsapp,
      };

      setSocialLinks(next);
      setInitialSocialLinks(next);
      setSocialMeta({
        updatedAt: data.meta?.updatedAt || null,
        updatedBy: data.meta?.updatedBy || null,
        updatedByRole: data.meta?.updatedByRole || null,
        version: Number(data.meta?.version || 1),
      });

      toast.success("Social links updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save social links"));
    } finally {
      setSocialSaving(false);
    }
  }

  const chartData = (() => {
    const days: Record<string, { date: string; INR: number; USD: number }> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days[key] = {
        date: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
        INR: 0,
        USD: 0,
      };
    }
    transactions.forEach((tx) => {
      if (tx.status !== "success") return;
      const txDate = tx.createdAt
        ? tx.createdAt.toDate().toISOString().split("T")[0]
        : null;
      if (txDate && days[txDate]) {
        if (tx.currency === "INR") days[txDate].INR += tx.amount;
        else if (tx.currency === "USD") days[txDate].USD += tx.amount;
      }
    });
    return Object.values(days);
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Revenue (INR)",
      value: `₹${(stats?.totalRevenueINR || 0).toLocaleString()}`,
      icon: IndianRupee,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Revenue (USD)",
      value: `$${(stats?.totalRevenueUSD || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Subscribers",
      value: stats?.activePremiumSubscribers || 0,
      icon: Crown,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Total Users",
      value: stats?.totalRegisteredUsers || 0,
      icon: Users,
      color: "text-chart-3",
      bg: "bg-chart-3/10",
    },
  ];

  function getBarColor(percent: number) {
    if (percent >= 85) return "from-red-500 to-red-400";
    if (percent >= 60) return "from-yellow-500 to-amber-400";
    return "from-primary to-violet-400";
  }

  const socialLinksDirty =
    JSON.stringify(socialLinks) !== JSON.stringify(initialSocialLinks);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
          Creator <span className="brand-gradient-text">Dashboard</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Platform analytics and performance overview
        </p>
      </div>

      {/* Social Links Settings */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold">Social Links</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Update Instagram, Twitter, and WhatsApp links shown in the public navbar.
            </p>
          </div>
          {socialMeta.updatedAt && (
            <p className="text-[10px] text-muted-foreground text-left wrap-break-word sm:text-right">
              Updated {new Date(socialMeta.updatedAt).toLocaleString()}
              {socialMeta.updatedBy ? ` | ${socialMeta.updatedBy}` : ""}
              {socialMeta.updatedByRole ? ` (${socialMeta.updatedByRole})` : ""}
              {` | v${socialMeta.version}`}
            </p>
          )}
        </div>

        {socialLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Loading social links...
          </div>
        ) : (
          <form onSubmit={handleSaveSocialLinks} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="instagramLink" className="inline-flex items-center gap-2">
                  <InstagramIcon className="w-4 h-4 text-muted-foreground" />
                  Instagram URL
                </Label>
                <Input
                  id="instagramLink"
                  value={socialLinks.instagram}
                  onChange={(e) => handleSocialLinkChange("instagram", e.target.value)}
                  placeholder="https://instagram.com/yourprofile"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitterLink" className="inline-flex items-center gap-2">
                  <XIcon className="w-4 h-4 text-muted-foreground" />
                  X URL
                </Label>
                <Input
                  id="twitterLink"
                  value={socialLinks.twitter}
                  onChange={(e) => handleSocialLinkChange("twitter", e.target.value)}
                  placeholder="https://x.com/yourprofile"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsappLink" className="inline-flex items-center gap-2">
                  <WhatsAppIcon className="w-4 h-4 text-muted-foreground" />
                  WhatsApp URL
                </Label>
                <Input
                  id="whatsappLink"
                  value={socialLinks.whatsapp}
                  onChange={(e) => handleSocialLinkChange("whatsapp", e.target.value)}
                  placeholder="https://wa.me/1234567890"
                  className="h-11"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={socialSaving || !socialLinksDirty} className="gap-2">
                {socialSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Links
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={socialSaving || !socialLinksDirty}
                onClick={() => setSocialLinks(initialSocialLinks)}
              >
                Reset
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Dashboard UI Settings */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold">Dashboard UI Settings</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Upload an image to display on the user dashboard screen.
            </p>
          </div>
        </div>

        {uiLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Loading dashboard UI settings...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Preview */}
              <div className="shrink-0">
                <p className="text-sm font-medium mb-3">Current Image</p>
                {dashboardImageFile ? (
                  <div className="w-32 h-32 rounded-2xl border border-border/40 overflow-hidden relative group">
                    <img
                      src={URL.createObjectURL(dashboardImageFile)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">Pending Save</span>
                    </div>
                  </div>
                ) : dashboardImageUrl ? (
                  <div className="w-32 h-32 rounded-2xl border border-border/40 overflow-hidden">
                    <img
                      src={dashboardImageUrl}
                      alt="Dashboard"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-2xl border border-dashed border-border/40 bg-muted/20 flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">No Image</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex-1 space-y-4 w-full">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Upload New Image</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uiSaving}
                      className="gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Select Image
                    </Button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleDashboardImageChange}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Recommended: Square image (1:1 ratio), up to 2MB.
                  </p>
                </div>

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="space-y-1.5 max-w-xs">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div className="h-full brand-gradient rounded-full" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={handleSaveDashboardUI}
                    disabled={uiSaving || !dashboardImageFile}
                    className="gap-2 brand-gradient text-white shadow-lg shadow-primary/20"
                  >
                    {uiSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Image
                  </Button>
                  
                  {dashboardImageUrl && (
                    <Button
                      variant="destructive"
                      onClick={handleRemoveDashboardImage}
                      disabled={uiSaving}
                    >
                      Remove
                    </Button>
                  )}
                  
                  {dashboardImageFile && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDashboardImageFile(null);
                        if (imageInputRef.current) imageInputRef.current.value = "";
                      }}
                      disabled={uiSaving}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Storage Overview */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold">Storage Pool</h2>
          <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
            {lastFetched && (
              <span className="text-[10px] text-muted-foreground">
                Fetched {lastFetched.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchStorage}
              disabled={storageLoading}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${storageLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Cloudinary usage stats update <strong>once per 24 hours</strong> on their servers. Recently deleted assets may still appear in these numbers until the next daily cycle.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {storageLoading ? (
            <div className="glass-card rounded-2xl p-6 flex items-center justify-center col-span-full">
              <Loader2 className="w-5 h-5 text-primary animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading storage usage...</span>
            </div>
          ) : buckets.length > 0 ? (
            buckets.map((bucket) => (
              <div key={bucket.id} className="glass-card rounded-2xl p-5 card-hover">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">{bucket.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all">
                      {bucket.cloudName}
                      {bucket.plan && <span className="ml-2 text-primary/70">• {bucket.plan}</span>}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HardDrive className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {bucket.usedGB.toFixed(2)} GB / {bucket.limitGB} GB
                    </span>
                    <span className={`font-bold ${
                      bucket.percent >= 85 ? "text-red-400" : 
                      bucket.percent >= 60 ? "text-yellow-400" : "text-primary"
                    }`}>
                      {bucket.percent}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getBarColor(bucket.percent)} transition-all duration-700 ease-out`}
                      style={{ width: `${Math.min(bucket.percent, 100)}%` }}
                    />
                  </div>
                </div>
                {bucket.error && (
                  <p className="text-[10px] text-destructive mt-2">{bucket.error}</p>
                )}
              </div>
            ))
          ) : (
            <div className="glass-card rounded-2xl p-6 col-span-full text-center">
              <p className="text-sm text-muted-foreground">No storage buckets configured</p>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-5 card-hover">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                {stat.label}
              </span>
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold wrap-break-word">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold">Revenue — Last 30 Days</h2>
        </div>
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="inrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.62 0.26 295)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.62 0.26 295)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="usdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.16 85)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.78 0.16 85)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  color: "var(--popover-foreground)",
                  backdropFilter: "blur(12px)",
                }}
              />
              <Area type="monotone" dataKey="INR" stroke="oklch(0.62 0.26 295)" fill="url(#inrGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="USD" stroke="oklch(0.78 0.16 85)" fill="url(#usdGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transactions */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6 pb-4">
          <h2 className="font-bold">Recent Transactions</h2>
        </div>
        {transactions.length > 0 ? (
          <>
          <div className="space-y-2 px-4 pb-4 md:hidden">
            {transactions.map((tx) => (
              <div key={tx.transactionId} className="rounded-xl border border-border/20 bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {tx.userId?.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">{tx.gateway}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    tx.status === "success" ? "bg-accent/10 text-accent" :
                    tx.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                    "bg-destructive/10 text-destructive"
                  }`}>
                    {tx.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                    {tx.type === "single_purchase" ? "Purchase" : "Sub"}
                  </span>
                  <span className="font-semibold">
                    {tx.currency === "INR" ? "₹" : "$"}{tx.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/20">
                  <th className="text-left py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User</th>
                  <th className="text-left py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="text-left py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gateway</th>
                  <th className="text-left py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.transactionId} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-xs text-muted-foreground">{tx.userId?.slice(0, 12)}...</td>
                    <td className="py-3.5 px-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        {tx.type === "single_purchase" ? "Purchase" : "Sub"}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-semibold">
                      {tx.currency === "INR" ? "₹" : "$"}{tx.amount}
                    </td>
                    <td className="py-3.5 px-6 capitalize text-muted-foreground">{tx.gateway}</td>
                    <td className="py-3.5 px-6">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        tx.status === "success" ? "bg-accent/10 text-accent" :
                        tx.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                        "bg-destructive/10 text-destructive"
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">No transactions yet</p>
        )}
      </div>
    </div>
  );
}