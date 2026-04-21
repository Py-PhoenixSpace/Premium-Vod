"use client";

import { useState } from "react";
import { Crown, Calendar, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { toast } from "sonner";

export function SubscriptionManager() {
  const { user, updateSubscription } = useAuthStore();
  const [canceling, setCanceling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const sub = user?.subscription;
  const isActive = isSubscriptionValid(sub);
  const isCanceling = sub?.status === "canceling";
  const gateway = sub?.gateway as "stripe" | "razorpay" | undefined;

  const periodEnd = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd?.toDate?.() ?? sub.currentPeriodEnd)
    : null;

  const formattedEnd = periodEnd
    ? periodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  async function handleCancel() {
    if (!gateway) return;
    setCanceling(true);
    try {
      const endpoint =
        gateway === "stripe"
          ? "/api/stripe/cancel-subscription"
          : "/api/razorpay/cancel-subscription";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      toast.success("Subscription cancelled", {
        description: `Your access continues until ${formattedEnd ?? "end of billing period"}.`,
      });
      setShowConfirm(false);

      // Optimistically update local store — no page reload needed
      if (user?.subscription) {
        updateSubscription({ ...user.subscription, status: "canceling" });
      }
    } catch (err: any) {
      toast.error("Cancellation failed", { description: err.message });
    } finally {
      setCanceling(false);
    }
  }

  if (!sub || sub.status === "none") return null;

  return (
    <div className="glass-card rounded-2xl p-5 border border-border/30">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive || isCanceling ? "bg-accent/10" : "bg-muted/40"}`}>
            <Crown className={`w-5 h-5 ${isActive || isCanceling ? "text-accent" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="font-bold text-sm">PremiumVOD Premium</p>
            <p className="text-xs text-muted-foreground capitalize">
              via {gateway ?? "unknown"} ·{" "}
              {isActive && <span className="text-emerald-500 font-semibold">Active</span>}
              {isCanceling && <span className="text-amber-500 font-semibold">Cancels at period end</span>}
              {!isActive && !isCanceling && <span className="text-muted-foreground font-semibold capitalize">{sub.status}</span>}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent px-2.5 py-1 rounded-full border border-accent/20">
            Premium
          </span>
        )}
      </div>

      {formattedEnd && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 bg-muted/30 rounded-xl px-3 py-2.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isCanceling
              ? `Access until ${formattedEnd}`
              : `Renews on ${formattedEnd}`}
          </span>
        </div>
      )}

      {/* Cancel button — temporarily hidden to prevent immediate cancellation */}
      {false && isActive && !isCanceling && (
        <>
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
            >
              Cancel subscription
            </button>
          ) : (
            <div className="bg-destructive/8 border border-destructive/20 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  Your premium access will continue until <span className="font-bold">{formattedEnd}</span>,
                  then your account reverts to free.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 h-8 text-xs border-border/40"
                >
                  <X className="w-3 h-3 mr-1" />
                  Keep Premium
                </Button>
                <Button
                  size="sm"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="flex-1 h-8 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30"
                >
                  {canceling ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : null}
                  Confirm Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {isCanceling && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          Cancellation confirmed. Enjoy premium until {formattedEnd}.
        </div>
      )}
    </div>
  );
}
