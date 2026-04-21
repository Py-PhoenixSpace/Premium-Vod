"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingCart, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface PurchaseButtonProps {
  videoId: string;
  priceINR: number;
  videoTitle: string;
  onPurchaseComplete?: () => void;
}

export default function PurchaseButton({
  videoId,
  priceINR,
  videoTitle,
  onPurchaseComplete,
}: PurchaseButtonProps) {
  const { user, addPurchasedVideo } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Create Razorpay order
      const res = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create order");
      }

      const { orderId, keyId } = await res.json();

      // Load Razorpay script dynamically if not already loaded
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Failed to load Razorpay SDK"));
          document.body.appendChild(script);
        });
      }

      const options = {
        key: keyId,
        amount: priceINR * 100,
        currency: "INR",
        name: "PremiumVOD",
        description: videoTitle,
        order_id: orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                videoId,
              }),
            });

            if (verifyRes.ok) {
              // Update local store so VideoCard access check resolves immediately
              addPurchasedVideo(videoId);
              toast.success("Purchase successful! Enjoy your content.");
              // Signal parent to update hasAccess state — no page reload needed
              onPurchaseComplete?.();
            } else {
              const data = await verifyRes.json().catch(() => ({}));
              const msg =
                data.error || "Payment verification failed. Contact support.";
              setError(msg);
              toast.error(msg);
            }
          } catch {
            const msg = "Verification failed. Please refresh and try again.";
            setError(msg);
            toast.error(msg);
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        prefill: {
          name: user.displayName || "",
          email: user.email || "",
        },
        theme: {
          color: "#7C3AED",
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err: any) {
      console.error("Purchase failed:", err);
      const msg = err.message || "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full brand-gradient text-white font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/35 transition-all h-11 gap-2"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <ShoppingCart className="w-4 h-4" />
            Buy for ₹{priceINR}
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
