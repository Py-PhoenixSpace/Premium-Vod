"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import { UserCircle, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    // Check for the UI flag cookie
    const hasImpersonationCookie = document.cookie.includes("is_impersonating=true");
    setIsImpersonating(hasImpersonationCookie);
  }, [user]); // Re-run if user changes (e.g. login/logout)

  async function handleRevert() {
    setReverting(true);
    try {
      const res = await fetch("/api/super-admin/revert", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to revert");

      // 1. Sign back in into Firebase Auth Client as the Super-Admin
      const result = await signInWithCustomToken(auth, data.customToken);
      
      // 2. Overwrite the API session cookie back to the Super-Admin
      const idToken = await result.user.getIdToken();
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      // Clear the local state and cookie, redirect to super-admin dashboard
      setIsImpersonating(false);
      document.cookie = "is_impersonating=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      toast.success("Welcome back, Super-Admin");
      router.push("/super-admin");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error("Error reverting impersonation", { description: err.message });
      setReverting(false);
    }
  }

  if (!isImpersonating || !user) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] w-full bg-amber-500/10 backdrop-blur-md border-t border-amber-500/20 shadow-sm animate-in slide-in-from-bottom-2 pb-safe">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <UserCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-xs sm:text-sm font-medium text-amber-600 dark:text-amber-400 truncate">
              <span className="hidden sm:inline">You are viewing the platform as </span>
              <span className="sm:hidden">Viewing as </span>
              <strong className="text-foreground">{user.email}</strong>
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleRevert}
            disabled={reverting}
            className="h-8 text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
          >
            {reverting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
            )}
            Revert
          </Button>
        </div>
      </div>
    </div>
  );
}
