"use client";

import { useEffect, useState, useCallback } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { X, Crown, CheckCircle2, Loader2, Sparkles, CreditCard, Lock, IndianRupee } from "lucide-react";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  formatINR,
  getPlanMonths,
  getPlanPrice,
  monthlyRate,
  normalizeSubscriptionPricing,
  savingsPercent,
  SUBSCRIPTION_PLAN_META,
  type SubscriptionPlanKey,
  type SubscriptionPricing,
} from "@/lib/subscription-pricing";

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => Promise<void>;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  method?: {
    upi?: boolean;
    card?: boolean;
    netbanking?: boolean;
    wallet?: boolean;
    emi?: boolean;
  };
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
    backdrop_color?: string;
  };
  config?: {
    display?: {
      hide_topbar?: boolean;
      blocks?: {
        banks?: { name: string; instruments: { method: string }[] };
      };
      sequence?: string[];
      preferences?: { show_default_blocks?: boolean };
    };
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
}

type RazorpayConstructor = new (
  options: RazorpayCheckoutOptions
) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
  }
}

/**
 * Detect if user is likely from India based on timezone and locale.
 */
function detectIsIndianUser(): boolean {

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return true;

    const locale = navigator.language || "";
    if (locale.startsWith("hi") || locale.startsWith("en-IN")) return true;

    return false;
  } catch {
    return false;
  }
}

export function PremiumModal() {
  const { isPremiumModalOpen, closePremiumModal } = useUIStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [isIndian, setIsIndian] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanKey>("monthly");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<SubscriptionPricing>(
    DEFAULT_SUBSCRIPTION_PRICING
  );

  // Detect country on mount
  useEffect(() => {
    setIsIndian(detectIsIndianUser());
  }, []);

  // Keep subscription display in sync with central pricing settings.
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

  // Load Razorpay SDK dynamically when needed
  useEffect(() => {
    if (!isPremiumModalOpen || !isIndian || razorpayLoaded) return;
    if (document.getElementById("razorpay-sdk")) {
      setRazorpayLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    document.body.appendChild(script);
  }, [isPremiumModalOpen, isIndian, razorpayLoaded]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePremiumModal();
    };
    if (isPremiumModalOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isPremiumModalOpen, closePremiumModal]);

  // Prevent scroll when open
  useEffect(() => {
    if (isPremiumModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isPremiumModalOpen]);

  // Stripe checkout
  const handleStripeCheckout = useCallback(async () => {
    setCheckoutError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create checkout");
      if (data.sessionUrl) window.location.href = data.sessionUrl;
    } catch (error) {
      console.error("Stripe checkout failed:", error);
      setCheckoutError(
        error instanceof Error ? error.message : "Failed to create checkout"
      );
      setLoading(false);
    }
  }, [selectedPlan]);

  // Razorpay checkout
  const handleRazorpayCheckout = useCallback(async () => {
    setCheckoutError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/razorpay/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "PremiumVOD Pro",
        description: `Premium Subscription — ${getPlanMonths(selectedPlan)} Month${getPlanMonths(selectedPlan) > 1 ? "s" : ""}`,
        order_id: data.orderId,
        // Pre-fill user details so Razorpay skips the contact info form
        prefill: {
          name: user?.name ?? "",
          email: user?.email ?? "",
          contact: "",
        },
        handler: async function (response: RazorpayPaymentResponse) {
          // Verify payment on server
          try {
            const verifyRes = await fetch("/api/razorpay/verify-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: selectedPlan,
              }),
            });
            if (verifyRes.ok) {
              closePremiumModal();
              window.location.href = "/dashboard?subscription=success";
            }
          } catch (err) {
            console.error("Payment verification failed:", err);
          }
        },
        // Explicitly enable all payment methods including UPI ID entry
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
        theme: {
          color: "#7C3AED",
          backdrop_color: "rgba(0,0,0,0.7)",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Razorpay checkout failed:", error);
      setCheckoutError(
        error instanceof Error ? error.message : "Razorpay checkout failed"
      );
    } finally {
      setLoading(false);
    }
  }, [closePremiumModal, selectedPlan]);

  if (!isPremiumModalOpen) return null;

  const benefits = [
    "Unlimited access to all 500+ premium videos",
    "Stunning cinematic 4K video resolution",
    "Zero buffering with premium edge delivery",
    "Advanced video analytics & viewing streak tracking",
    "Cancel anytime. No hidden fees.",
  ];

  const planOrder: SubscriptionPlanKey[] = ["monthly", "quarterly", "halfYearly"];
  const selectedPlanPrice = getPlanPrice(pricing, selectedPlan);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={closePremiumModal}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-md glass-card rounded-[2rem] border border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Header Ribbon */}
        <div className="absolute top-0 inset-x-0 h-1 brand-gradient" />

        {/* Close Button */}
        <button
          onClick={closePremiumModal}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-5 sm:p-6">
          {/* Hero Icon */}
          <div className="flex justify-center mb-4">
            <div className="relative w-16 h-16 rounded-3xl brand-gradient flex items-center justify-center brand-glow">
              <Crown className="w-8 h-8 text-white" />
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-lg transform rotate-12">
                <Sparkles className="w-3 h-3 text-accent-foreground" />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold font-heading mb-1">
              Transform with <span className="brand-gradient-text">Pro</span>
            </h2>
            <p className="text-muted-foreground text-sm">
              Unlock your ultimate viewing experience with premium, unrestricted access.
            </p>
          </div>

          {/* Pricing Box */}
          <div className="border border-white/10 bg-white/5 rounded-2xl p-4 mb-4 text-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-linear-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Choose Your Plan
              </p>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {planOrder.map((plan) => {
                  const months = getPlanMonths(plan);
                  const total = getPlanPrice(pricing, plan);
                  const unit = monthlyRate(total, months);
                  const savings = plan === "monthly" ? 0 : savingsPercent(pricing.monthly, total, months);
                  const isSelected = selectedPlan === plan;

                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => {
                        setSelectedPlan(plan);
                        setCheckoutError(null);
                      }}
                      className={`rounded-xl border px-2 py-2 text-left transition-all ${
                        isSelected
                          ? "border-primary/60 bg-primary/10"
                          : "border-white/10 bg-white/5 hover:border-primary/30"
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {SUBSCRIPTION_PLAN_META[plan].title}
                      </p>
                      <p className="text-sm font-bold mt-1">₹{formatINR(total)}</p>
                      <p className="text-[10px] text-muted-foreground">₹{formatINR(unit)}/mo</p>
                      {savings > 0 && <p className="text-[10px] text-primary mt-1">Save {savings}%</p>}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-center mt-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/10">
                  {isIndian ? (
                    <><IndianRupee className="w-3 h-3" />Powered by Razorpay</>
                  ) : (
                    <><CreditCard className="w-3 h-3" />Powered by Stripe</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Benefits List */}
          <div className="space-y-2.5 mb-5">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm font-medium text-foreground/85">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5 drop-shadow-[0_0_8px_oklch(0.62_0.26_295/0.5)]" />
                <span className="leading-snug">{b}</span>
              </div>
            ))}
          </div>

          {/* Payment Button */}
          <div className="space-y-3">
            <Button
              onClick={isIndian ? handleRazorpayCheckout : handleStripeCheckout}
              disabled={loading || (isIndian && !razorpayLoaded)}
              className="w-full h-14 rounded-xl brand-gradient text-white font-bold text-lg shadow-[0_8px_30px_-8px_oklch(0.55_0.28_295/0.8)] hover:shadow-[0_8px_40px_-8px_oklch(0.55_0.28_295/1)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isIndian ? (
                <>
                  <IndianRupee className="w-5 h-5" />
                  Pay ₹{formatINR(selectedPlanPrice)} with Razorpay
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Checkout {SUBSCRIPTION_PLAN_META[selectedPlan].title} with Stripe
                </>
              )}
            </Button>
            {checkoutError && (
              <p className="text-center text-xs text-destructive">{checkoutError}</p>
            )}
            <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-4 opacity-70">
              <Lock className="w-3 h-3" /> Secure, 256-bit encrypted checkout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
