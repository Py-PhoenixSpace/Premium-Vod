"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Users,
  Search,
  Crown,
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  XCircle,
} from "lucide-react";

interface UserRow {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  subscriptionStatus: string;
  purchasedVideosCount: number;
  createdAt: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function performAction(userId: string, action: string) {
    setActionLoading(`${userId}-${action}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) {
        await fetchUsers();
        toast.success("User updated successfully.");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Action failed");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const totalPages = Math.ceil(total / pageSize);

  const roleStyles: Record<string, string> = {
    "super-admin": "bg-accent/20 text-accent border border-accent/30",
    admin: "bg-primary/10 text-primary border border-primary/20",
    user: "bg-muted/40 text-muted-foreground border border-border/30",
  };

  const subStyles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    past_due: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    canceled: "bg-destructive/10 text-destructive border border-destructive/20",
    none: "bg-muted/30 text-muted-foreground border border-border/20",
  };

  return (
    <div className="max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
            Manage <span className="brand-gradient-text">Users</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} registered users
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-border/40"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-10 shrink-0 px-4 border-border/40">
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 shrink-0 text-muted-foreground"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </form>
      </div>

      {/* Desktop Table */}
      <div className="glass-card rounded-2xl overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20">
                {["User", "Role", "Subscription", "Purchases", "Joined", "Actions"].map((h) => (
                  <th key={h} className={`py-4 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ${h === "Actions" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-muted-foreground">No users found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(u.displayName || u.email || "U")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-[160px]">{u.displayName || "—"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${roleStyles[u.role] || roleStyles.user}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${subStyles[u.subscriptionStatus] || subStyles.none}`}>
                        {u.subscriptionStatus === "active" ? "Premium" : u.subscriptionStatus}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-muted-foreground">{u.purchasedVideosCount}</td>
                    <td className="py-4 px-5 text-xs text-muted-foreground">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <UserActions user={u} onAction={performAction} actionLoading={actionLoading} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-muted-foreground py-14">No users found</p>
        ) : (
          users.map((u) => (
            <div key={u.uid} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full brand-gradient flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {(u.displayName || u.email || "U")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{u.displayName || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${roleStyles[u.role] || roleStyles.user}`}>
                  {u.role}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${subStyles[u.subscriptionStatus] || subStyles.none}`}>
                  {u.subscriptionStatus === "active" ? "Premium" : u.subscriptionStatus}
                </span>
                <span className="text-xs text-muted-foreground">{u.purchasedVideosCount} purchases</span>
                {u.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    Joined {new Date(u.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap border-t border-border/20 pt-3">
                <UserActions user={u} onAction={performAction} actionLoading={actionLoading} mobile />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border-border/40 gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border-border/40 gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function UserActions({
  user,
  onAction,
  actionLoading,
  mobile = false,
}: {
  user: UserRow;
  onAction: (userId: string, action: string) => void;
  actionLoading: string | null;
  mobile?: boolean;
}) {
  const isLoading = (action: string) => actionLoading === `${user.uid}-${action}`;
  const btnClass = mobile
    ? "text-xs h-8 px-3 gap-1.5"
    : "text-xs h-8 px-3 gap-1.5";

  return (
    <div className={`flex gap-1.5 ${mobile ? "flex-wrap" : "justify-end items-center"}`}>
      {user.role === "admin" && (
        <Button
          variant="outline"
          size="sm"
          className={`${btnClass} border-destructive/30 text-destructive hover:bg-destructive/10`}
          onClick={() => onAction(user.uid, "demote_admin")}
          disabled={!!actionLoading}
        >
          {isLoading("demote_admin") ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
          Revoke Admin
        </Button>
      )}
    </div>
  );
}
