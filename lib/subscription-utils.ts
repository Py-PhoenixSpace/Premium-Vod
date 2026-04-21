import { UserSubscription } from "@/types";

/**
 * Checks if a user's subscription is currently active AND has not expired.
 * This is crucial because while recurring gateway subscriptions (Stripe) auto-update their status via webhooks,
 * fixed-duration gateway payments (like default Razorpay setups) may retain an "active" status even after their currentPeriodEnd has passed.
 *
 * @param subscription The user's subscription object
 * @returns boolean True if the subscription is active and within the valid period.
 */
export function isSubscriptionValid(subscription: UserSubscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "canceling") return false;

  // If there's no currentPeriodEnd set, we treat it as valid (e.g. lifetime access or legacy)
  // However, normally all active/canceling subs should have a currentPeriodEnd.
  if (!subscription.currentPeriodEnd) {
    return true; 
  }

  try {
    // Check if the currentPeriodEnd timestamp has passed
    const endDate =
      typeof subscription.currentPeriodEnd.toDate === "function"
        ? subscription.currentPeriodEnd.toDate()
        : new Date(subscription.currentPeriodEnd as unknown as string | number | Date);

    return endDate.getTime() > Date.now();
  } catch (error) {
    console.error("Failed to parse subscription currentPeriodEnd:", error);
    // Fail safe to prevent unintended access if timestamp format is corrupted
    return false;
  }
}
