import { z } from "zod";

export const PRICING_SETTINGS_COLLECTION = "platformSettings";
export const PRICING_SETTINGS_DOC_ID = "subscriptionPricing";

export interface SubscriptionPricing {
  monthly: number;
  quarterly: number;
  halfYearly: number;
  monthlyUSD: number;
  quarterlyUSD: number;
  halfYearlyUSD: number;
}

export type SubscriptionPlanKey = "monthly" | "quarterly" | "halfYearly";

export const SUBSCRIPTION_PLAN_META: Record<
  SubscriptionPlanKey,
  { title: string; months: number }
> = {
  monthly: { title: "1 Month", months: 1 },
  quarterly: { title: "3 Months", months: 3 },
  halfYearly: { title: "6 Months", months: 6 },
};

/** Approximate INR → USD conversion rate used for auto-deriving USD prices. */
const INR_TO_USD_RATE = 84;

/** Round an INR amount to a clean USD price (nearest whole dollar, minimum $1). */
function inrToUsd(inr: number): number {
  return Math.max(1, Math.round(inr / INR_TO_USD_RATE));
}

export const DEFAULT_SUBSCRIPTION_PRICING: SubscriptionPricing = {
  monthly: 799,
  quarterly: 2159,
  halfYearly: 3839,
  monthlyUSD: inrToUsd(799),     // ~$10
  quarterlyUSD: inrToUsd(2159),  // ~$26
  halfYearlyUSD: inrToUsd(3839), // ~$46
};

const priceNumber = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return Number.NaN;
      return Number(trimmed);
    }
    return value;
  },
  z
    .number({ message: "Price is required" })
    .int("Prices must be whole numbers")
    .min(1, "Prices must be at least 1")
    .max(1000000, "Prices are too large")
);

const usdPriceNumber = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return 0;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      return Number(trimmed);
    }
    return value;
  },
  z
    .number({ message: "Price is required" })
    .int("Prices must be whole numbers")
    .min(0, "Prices must be at least 0")
    .max(100000, "Prices are too large")
);

export const subscriptionPricingSchema = z
  .object({
    monthly: priceNumber,
    quarterly: priceNumber,
    halfYearly: priceNumber,
    monthlyUSD: usdPriceNumber.catch(10),
    quarterlyUSD: usdPriceNumber.catch(25),
    halfYearlyUSD: usdPriceNumber.catch(45),
  })
  .superRefine((value, ctx) => {
    if (!(value.monthly < value.quarterly && value.quarterly < value.halfYearly)) {
      ctx.addIssue({
        code: "custom",
        path: ["halfYearly"],
        message: "Pack totals must increase with duration (1M < 3M < 6M)",
      });
    }

    const monthlyRate = value.monthly;
    const quarterlyRate = value.quarterly / 3;
    const halfYearlyRate = value.halfYearly / 6;

    if (quarterlyRate > monthlyRate) {
      ctx.addIssue({
        code: "custom",
        path: ["quarterly"],
        message: "3-month monthly rate should be <= 1-month monthly rate",
      });
    }

    if (halfYearlyRate > quarterlyRate) {
      ctx.addIssue({
        code: "custom",
        path: ["halfYearly"],
        message: "6-month monthly rate should be <= 3-month monthly rate",
      });
    }
  });

export function normalizeSubscriptionPricing(input: unknown): SubscriptionPricing {
  const parsed = subscriptionPricingSchema.safeParse(input);
  if (!parsed.success) return DEFAULT_SUBSCRIPTION_PRICING;

  const data = parsed.data;

  // If USD prices were never saved (old Firestore doc), derive them from INR.
  return {
    ...data,
    monthlyUSD: data.monthlyUSD > 0 ? data.monthlyUSD : inrToUsd(data.monthly),
    quarterlyUSD: data.quarterlyUSD > 0 ? data.quarterlyUSD : inrToUsd(data.quarterly),
    halfYearlyUSD: data.halfYearlyUSD > 0 ? data.halfYearlyUSD : inrToUsd(data.halfYearly),
  };
}

export function parseSubscriptionPlan(
  value: unknown,
  fallback: SubscriptionPlanKey = "monthly"
): SubscriptionPlanKey {
  if (typeof value !== "string") return fallback;
  if (value === "monthly" || value === "quarterly" || value === "halfYearly") {
    return value;
  }
  return fallback;
}

export function getPlanMonths(plan: SubscriptionPlanKey): number {
  return SUBSCRIPTION_PLAN_META[plan].months;
}

export function getPlanPrice(
  pricing: SubscriptionPricing,
  plan: SubscriptionPlanKey,
  currency: "INR" | "USD" = "INR"
): number {
  if (currency === "USD") {
    switch (plan) {
      case "monthly":
        return pricing.monthlyUSD;
      case "quarterly":
        return pricing.quarterlyUSD;
      case "halfYearly":
        return pricing.halfYearlyUSD;
    }
  }
  return pricing[plan];
}

export function formatINR(value: number): string {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

export function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).replace("$", ""); // return just the number part if we add $ manually, or let it include $. Let's just use string format.
}

export function monthlyRate(totalPrice: number, months: number): number {
  if (months <= 0) return 0;
  return totalPrice / months;
}

export function savingsPercent(monthlyPrice: number, packPrice: number, months: number): number {
  if (monthlyPrice <= 0 || months <= 0) return 0;
  const baseline = monthlyPrice * months;
  const savings = ((baseline - packPrice) / baseline) * 100;
  return Math.max(0, Math.round(savings));
}
