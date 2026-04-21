"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Crown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Sparkles,
  AlertCircle,
  UserCircle,
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

export default function SuperAdminUsersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load users");
      }
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      setFetchError(err.message || "Failed to load users. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function performAction(userId: string, action: string) {
    setActionLoading(`${userId}-${action}`);
    try {
      const res = await fetch("/api/super-admin/users", {
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

  const router = useRouter();

  async function handleImpersonate(targetUid: string) {
    setActionLoading(`${targetUid}-impersonate`);
    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impersonation failed");

      // 1. Sign in Firebase Auth Client as the target user
      const result = await signInWithCustomToken(auth, data.customToken);
      
      // 2. Overwrite the API session cookie with the target user
      const idToken = await result.user.getIdToken();
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      toast.success("Impersonation active");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Network error");
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
  const isLoading = (userId: string, action: string) =>
    actionLoading === `${userId}-${action}`;

  const roleStyles: Record<string, string> = {
    "super-admin": "bg-accent/20 text-accent border border-accent/30",
    admin: "bg-primary/10 text-primary border border-primary/20",
    user: "bg-muted/40 text-muted-foreground border border-border/30",
  };

  const subStyles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    past_due:
      "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    canceled:
      "bg-destructive/10 text-destructive border border-destructive/20",
    none: "bg-muted/30 text-muted-foreground border border-border/20",
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
            All <span className="brand-gold-text">Users</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} total users — full role control
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-border/40"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-10 px-4 border-border/40"
          >
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground"
              onClick={() => {
                setSearch("");
                setSearchInput("");
                setPage(1);
              }}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </form>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-3 border border-destructive/20 bg-destructive/5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{fetchError}</p>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            Retry
          </Button>
        </div>
      )}

      {/* Desktop Table */}
      <div className="glass-card rounded-2xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20">
                {["User", "Role", "Subscription", "Joined", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`py-4 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ${
                        h === "Actions" ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 && !fetchError ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-14 text-center text-muted-foreground"
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.uid}
                    className="border-b border-border/10 hover:bg-muted/10 transition-colors"
                  >
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(u.displayName || u.email || "U")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-[180px]">
                            {u.displayName || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          roleStyles[u.role] || roleStyles.user
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          subStyles[u.subscriptionStatus] || subStyles.none
                        }`}
                      >
                        {u.subscriptionStatus === "active"
                          ? "Premium"
                          : u.subscriptionStatus}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-xs text-muted-foreground">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString("en", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {u.uid !== currentUser?.uid && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 px-3 gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            onClick={() => handleImpersonate(u.uid)}
                            disabled={!!actionLoading}
                          >
                            {isLoading(u.uid, "impersonate") ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserCircle className="w-3 h-3" />
                            )}
                            Impersonate
                          </Button>
                        )}
                        {u.role === "user" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 px-3 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => performAction(u.uid, "make_admin")}
                            disabled={!!actionLoading}
                          >
                            {isLoading(u.uid, "make_admin") ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            Make Admin
                          </Button>
                        )}
                        {u.role === "admin" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 px-3 gap-1.5 border-accent/30 text-accent hover:bg-accent/10"
                              onClick={() =>
                                performAction(u.uid, "make_super_admin")
                              }
                              disabled={!!actionLoading}
                            >
                              {isLoading(u.uid, "make_super_admin") ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ShieldAlert className="w-3 h-3" />
                              )}
                              Make Super-Admin
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 px-3 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                              onClick={() => performAction(u.uid, "make_user")}
                              disabled={!!actionLoading}
                            >
                              {isLoading(u.uid, "make_user") ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ShieldOff className="w-3 h-3" />
                              )}
                              Demote
                            </Button>
                          </>
                        )}
                        {u.role === "super-admin" &&
                          u.uid !== currentUser?.uid && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 px-3 gap-1.5 border-muted text-muted-foreground hover:bg-muted/30"
                              onClick={() =>
                                performAction(u.uid, "make_admin")
                              }
                              disabled={!!actionLoading}
                            >
                              {isLoading(u.uid, "make_admin") ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3 h-3" />
                              )}
                              Downgrade to Admin
                            </Button>
                          )}
                        {u.subscriptionStatus !== "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 px-3 gap-1.5 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                            onClick={() =>
                              performAction(u.uid, "grant_premium")
                            }
                            disabled={!!actionLoading}
                          >
                            {isLoading(u.uid, "grant_premium") ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            Grant Premium
                          </Button>
                        )}
                        {u.subscriptionStatus === "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 px-3 gap-1.5 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                            onClick={() =>
                              performAction(u.uid, "revoke_premium")
                            }
                            disabled={!!actionLoading}
                          >
                            {isLoading(u.uid, "revoke_premium") ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Crown className="w-3 h-3" />
                            )}
                            Revoke Premium
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        ) : (
          users.map((u) => (
            <div key={u.uid} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full brand-gradient flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {(u.displayName || u.email || "U")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {u.displayName || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.email}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${
                    roleStyles[u.role] || roleStyles.user
                  }`}
                >
                  {u.role}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap border-t border-border/20 pt-3">
                {u.uid !== currentUser?.uid && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    onClick={() => handleImpersonate(u.uid)}
                    disabled={!!actionLoading}
                  >
                    {isLoading(u.uid, "impersonate") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserCircle className="w-3 h-3" />
                    )}
                    Impersonate
                  </Button>
                )}
                {u.role === "user" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 border-primary/30 text-primary"
                    onClick={() => performAction(u.uid, "make_admin")}
                    disabled={!!actionLoading}
                  >
                    <ShieldCheck className="w-3 h-3" /> Make Admin
                  </Button>
                )}
                {u.role === "admin" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1.5 border-accent/30 text-accent"
                      onClick={() => performAction(u.uid, "make_super_admin")}
                      disabled={!!actionLoading}
                    >
                      <ShieldAlert className="w-3 h-3" /> Super-Admin
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1.5 border-destructive/30 text-destructive"
                      onClick={() => performAction(u.uid, "make_user")}
                      disabled={!!actionLoading}
                    >
                      <ShieldOff className="w-3 h-3" /> Demote
                    </Button>
                  </>
                )}
                {u.role === "super-admin" && u.uid !== currentUser?.uid && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 border-muted text-muted-foreground"
                    onClick={() => performAction(u.uid, "make_admin")}
                    disabled={!!actionLoading}
                  >
                    {isLoading(u.uid, "make_admin") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3 h-3" />
                    )}
                    Downgrade to Admin
                  </Button>
                )}
                {u.subscriptionStatus !== "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 border-emerald-500/30 text-emerald-500"
                    onClick={() => performAction(u.uid, "grant_premium")}
                    disabled={!!actionLoading}
                  >
                    {isLoading(u.uid, "grant_premium") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Grant Premium
                  </Button>
                )}
                {u.subscriptionStatus === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 border-yellow-500/30 text-yellow-500"
                    onClick={() => performAction(u.uid, "revoke_premium")}
                    disabled={!!actionLoading}
                  >
                    <Crown className="w-3 h-3" /> Revoke Premium
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
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
