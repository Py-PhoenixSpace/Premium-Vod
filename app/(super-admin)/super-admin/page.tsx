"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  Users,
  Crown,
  Shield,
  ShieldAlert,
  IndianRupee,
  DollarSign,
  Loader2,
  ArrowRight,
  HardDrive,
  Database,
  RefreshCw,
  Info,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Stats {
  totalRevenueINR?: number;
  totalRevenueUSD?: number;
  activePremiumSubscribers?: number;
  totalRegisteredUsers?: number;
}

export default function SuperAdminPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [admins, setAdmins] = useState<any[]>([]);
  const [buckets, setBuckets] = useState<any[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Stats
        const statsDoc = await getDoc(doc(db, "platformStats", "totals"));
        if (statsDoc.exists()) setStats(statsDoc.data() as Stats);

        // Get all admins
        const usersSnap = await getDocs(
          query(collection(db, "users"), orderBy("createdAt", "desc"))
        );
        const adminList = usersSnap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u: any) => u.role === "admin" || u.role === "super-admin");
        setAdmins(adminList);
        // Storage pool
        const storageRes = await fetch("/api/admin/storage");
        if (storageRes.ok) {
          const storageData = await storageRes.json();
          setBuckets(storageData.buckets || []);
          setLastFetched(new Date());
        }
      } catch (err) {
        console.error("Failed to load super-admin data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function refreshStorage() {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/admin/storage");
      if (res.ok) {
        const data = await res.json();
        setBuckets(data.buckets || []);
        setLastFetched(new Date());
      }
    } finally {
      setStorageLoading(false);
    }
  }

  function getBarColor(percent: number) {
    if (percent >= 85) return "from-red-500 to-red-400";
    if (percent >= 60) return "from-yellow-500 to-yellow-400";
    return "from-primary to-accent";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: "Revenue (INR)", value: `₹${(stats?.totalRevenueINR || 0).toLocaleString()}`, icon: IndianRupee, color: "text-primary", bg: "bg-primary/10" },
    { label: "Revenue (USD)", value: `$${(stats?.totalRevenueUSD || 0).toLocaleString()}`, icon: DollarSign, color: "text-accent", bg: "bg-accent/10" },
    { label: "Subscribers", value: stats?.activePremiumSubscribers || 0, icon: Crown, color: "text-accent", bg: "bg-accent/10" },
    { label: "Total Users", value: stats?.totalRegisteredUsers || 0, icon: Users, color: "text-chart-3", bg: "bg-chart-3/10" },
  ];

  const roleStyles: Record<string, string> = {
    "super-admin": "bg-accent/20 text-accent border border-accent/30",
    admin: "bg-primary/10 text-primary border border-primary/20",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
          <ShieldAlert className="w-5 h-5 text-accent-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
            Super <span className="brand-gold-text">Admin</span> Panel
          </h1>
          <p className="text-muted-foreground text-sm">Full platform control — {user?.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-5 card-hover">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider leading-tight">{stat.label}</span>
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/super-admin/users">
          <div className="glass-card rounded-2xl p-6 card-hover flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Manage All Users</p>
                <p className="text-xs text-muted-foreground mt-0.5">View, promote, demote any user</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
        <Link href="/admin">
          <div className="glass-card rounded-2xl p-6 card-hover flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="font-semibold">Admin Panel</p>
                <p className="text-xs text-muted-foreground mt-0.5">Videos, uploads, revenue</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
      </div>

      {/* Storage Pool */}
      {buckets.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-bold">Storage Pool</h2>
            <div className="ml-auto flex items-center gap-3">
              {lastFetched && (
                <span className="text-[10px] text-muted-foreground">
                  Fetched {lastFetched.toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={refreshStorage}
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
              Cloudinary usage stats update <strong>once per 24 hours</strong>. Recently deleted assets may still appear until the next daily cycle.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {buckets.map((bucket: any) => (
              <div key={bucket.id} className="glass-card rounded-2xl p-5 card-hover">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">{bucket.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
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
                      className={`h-full rounded-full bg-gradient-to-r ${getBarColor(bucket.percent)} transition-all duration-700`}
                      style={{ width: `${Math.min(bucket.percent, 100)}%` }}
                    />
                  </div>
                </div>
                {bucket.error && <p className="text-[10px] text-destructive mt-2">{bucket.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admins List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6 pb-4 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Admin Accounts ({admins.length})
          </h2>
          <Link href="/super-admin/users">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20">
                {["User", "Role", "Email"].map((h) => (
                  <th key={h} className="py-3 px-6 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">No admins yet</td></tr>
              ) : (
                admins.map((admin: any) => (
                  <tr key={admin.uid} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(admin.displayName || admin.email || "A")[0].toUpperCase()}
                        </div>
                        <span className="font-medium truncate max-w-[200px]">{admin.displayName || "—"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${roleStyles[admin.role] || ""}`}>
                        {admin.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-muted-foreground text-xs">{admin.email}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
