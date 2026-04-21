"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  formatINR,
  monthlyRate,
  savingsPercent,
  subscriptionPricingSchema,
  type SubscriptionPricing,
} from "@/lib/subscription-pricing";
import {
  IndianRupee,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";

interface PricingMeta {
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByRole: string | null;
  version: number;
}

type PricingForm = Record<keyof SubscriptionPricing, string>;

function toForm(pricing: SubscriptionPricing): PricingForm {
  return {
    monthly: String(pricing.monthly),
    quarterly: String(pricing.quarterly),
    halfYearly: String(pricing.halfYearly),
  };
}

function parseForm(form: PricingForm) {
  return subscriptionPricingSchema.safeParse({
    monthly: form.monthly,
    quarterly: form.quarterly,
    halfYearly: form.halfYearly,
  });
}

export default function AdminPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<PricingForm>(toForm(DEFAULT_SUBSCRIPTION_PRICING));
  const [initialForm, setInitialForm] = useState<PricingForm>(toForm(DEFAULT_SUBSCRIPTION_PRICING));
  const [meta, setMeta] = useState<PricingMeta>({
    updatedAt: null,
    updatedBy: null,
    updatedByRole: null,
    version: 0,
  });

  const parsed = useMemo(() => parseForm(form), [form]);
  const validationMessage = parsed.success ? null : parsed.error.issues[0]?.message || "Invalid values";
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const preview = parsed.success
    ? parsed.data
    : {
        monthly: Number(form.monthly) || 0,
        quarterly: Number(form.quarterly) || 0,
        halfYearly: Number(form.halfYearly) || 0,
      };

  const loadPricing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pricing", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load pricing");
      }

      const data = await res.json();
      const next = toForm(data.pricing || DEFAULT_SUBSCRIPTION_PRICING);
      setForm(next);
      setInitialForm(next);
      setMeta({
        updatedAt: data.meta?.updatedAt || null,
        updatedBy: data.meta?.updatedBy || null,
        updatedByRole: data.meta?.updatedByRole || null,
        version: Number(data.meta?.version || 0),
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  function handleInputChange(key: keyof SubscriptionPricing, value: string) {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 7);
    setForm((prev) => ({ ...prev, [key]: digitsOnly }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const parsedForm = parseForm(form);
    if (!parsedForm.success) {
      toast.error(parsedForm.error.issues[0]?.message || "Invalid pricing values");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedForm.data),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.details?.[0] || "Failed to save pricing");
      }

      const next = toForm(data.pricing || parsedForm.data);
      setForm(next);
      setInitialForm(next);
      setMeta({
        updatedAt: data.meta?.updatedAt || null,
        updatedBy: data.meta?.updatedBy || null,
        updatedByRole: data.meta?.updatedByRole || null,
        version: Number(data.meta?.version || 0),
      });

      toast.success("Pricing updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  }

  function resetToLastSaved() {
    setForm(initialForm);
  }

  function applyDefaults() {
    setForm(toForm(DEFAULT_SUBSCRIPTION_PRICING));
  }

  const monthlyRateQuarterly = monthlyRate(preview.quarterly, 3);
  const monthlyRateHalfYearly = monthlyRate(preview.halfYearly, 6);
  const saveQuarterly = savingsPercent(preview.monthly, preview.quarterly, 3);
  const saveHalfYearly = savingsPercent(preview.monthly, preview.halfYearly, 6);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">
          Subscription <span className="brand-gradient-text">Pricing</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Update pack pricing for 1-month, 3-month, and 6-month plans.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40">
        <div className="flex items-start gap-3 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div>
            <p>
              Validation rules: totals must increase with duration, and monthly effective rate must improve as pack duration grows.
            </p>
            <p className="mt-1">
              Last update: {meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "Never"}
              {meta.updatedBy ? ` | by ${meta.updatedBy}` : ""}
              {meta.updatedByRole ? ` (${meta.updatedByRole})` : ""}
              {` | v${meta.version}`}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="glass-card rounded-2xl p-5 sm:p-6 space-y-6 border border-border/40">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="monthlyPrice">1 Month Price (INR)</Label>
            <Input
              id="monthlyPrice"
              value={form.monthly}
              onChange={(e) => handleInputChange("monthly", e.target.value)}
              inputMode="numeric"
              placeholder="799"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quarterlyPrice">3 Months Price (INR)</Label>
            <Input
              id="quarterlyPrice"
              value={form.quarterly}
              onChange={(e) => handleInputChange("quarterly", e.target.value)}
              inputMode="numeric"
              placeholder="2159"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="halfYearlyPrice">6 Months Price (INR)</Label>
            <Input
              id="halfYearlyPrice"
              value={form.halfYearly}
              onChange={(e) => handleInputChange("halfYearly", e.target.value)}
              inputMode="numeric"
              placeholder="3839"
              className="h-11"
            />
          </div>
        </div>

        {validationMessage && (
          <p className="text-sm text-destructive">{validationMessage}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">1 Month</p>
            <p className="text-2xl font-bold mt-2">₹{formatINR(preview.monthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">₹{formatINR(preview.monthly)} / month</p>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">3 Months</p>
            <p className="text-2xl font-bold mt-2">₹{formatINR(preview.quarterly)}</p>
            <p className="text-xs text-muted-foreground mt-1">₹{formatINR(monthlyRateQuarterly)} / month</p>
            <p className="text-xs text-primary mt-1">Save {saveQuarterly}%</p>
          </div>

          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">6 Months</p>
            <p className="text-2xl font-bold mt-2">₹{formatINR(preview.halfYearly)}</p>
            <p className="text-xs text-muted-foreground mt-1">₹{formatINR(monthlyRateHalfYearly)} / month</p>
            <p className="text-xs text-accent mt-1">Save {saveHalfYearly}%</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !isDirty || !!validationMessage} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Pricing
          </Button>

          <Button type="button" variant="outline" onClick={resetToLastSaved} disabled={saving || !isDirty} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Reset Changes
          </Button>

          <Button type="button" variant="secondary" onClick={applyDefaults} disabled={saving} className="gap-2">
            <TrendingDown className="w-4 h-4" />
            Use Default Values
          </Button>
        </div>
      </form>

      <div className="glass-card rounded-2xl p-5 border border-border/30 text-xs text-muted-foreground flex items-start gap-2">
        <IndianRupee className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <p>
          These values are used by the homepage pricing table immediately after save. Use realistic discount steps to avoid confusing plan economics.
        </p>
      </div>
    </div>
  );
}
