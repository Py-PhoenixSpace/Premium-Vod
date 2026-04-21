"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  formatINR,
  normalizeSubscriptionPricing,
  type SubscriptionPricing,
} from "@/lib/subscription-pricing";
import { isSubscriptionValid } from "@/lib/subscription-utils";

interface SubscribeButtonProps {
  /** If true, opens the premium modal (Razorpay/Stripe choice). Default: true */
  openModal?: boolean;
  className?: string;
  label?: string;
}

export default function SubscribeButton({
  openModal = true,
  className,
  label,
}: SubscribeButtonProps) {
  const { user } = useAuthStore();
  const { openPremiumModal } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<SubscriptionPricing>(
    DEFAULT_SUBSCRIPTION_PRICING
  );

  useEffect(() => {
    let canceled = false;

    async function fetchPricing() {
      try {
        const res = await fetch("/api/pricing", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        if (!canceled) {
          setPricing(normalizeSubscriptionPricing(data?.pricing));
        }
      } catch {
        // Keep defaults when pricing API is unavailable.
      }
    }

    fetchPricing();

    return () => {
      canceled = true;
    };
  }, []);

  const resolvedLabel = label ?? `Choose Plan (from ₹${formatINR(pricing.monthly)})`;

  async function handleClick() {
    if (!user) {
      toast.error("Please sign in to subscribe.");
      return;
    }

    if (isSubscriptionValid(user.subscription)) {
      toast.info("You already have an active PremiumVOD Premium subscription.");
      return;
    }

    setError(null);

    if (openModal) {
      // Delegate to the PremiumModal which handles Razorpay + Stripe flows
      openPremiumModal();
      return;
    }

    // Fallback: direct Stripe Checkout (used when modal is disabled)
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    } catch (err: any) {
      const msg = err.message || "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        className={
          className ||
          "w-full brand-gradient-warm text-accent-foreground font-semibold shadow-lg shadow-accent/20 hover:shadow-accent/35 transition-all h-11 gap-2"
        }
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Crown className="w-4 h-4" />
            {resolvedLabel}
          </>
        )}
      </Button>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
