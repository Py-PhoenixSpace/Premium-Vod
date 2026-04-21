export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

type InvoiceWithCompatFields = Stripe.Invoice & {
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription;
    };
  };
  subscription?: string | Stripe.Subscription | null;
};

/**
 * Extracts subscription ID from an invoice, handling Stripe v21 structure.
 * In v21, invoice.subscription was removed in favour of
 * invoice.parent.subscription_details.subscription.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const compatInvoice = invoice as InvoiceWithCompatFields;
  const parent = compatInvoice.parent;
  if (parent?.subscription_details?.subscription) {
    const sub = parent.subscription_details.subscription;
    return typeof sub === "string" ? sub : sub.id;
  }
  // Fallback for older API versions
  if (compatInvoice.subscription) {
    const sub = compatInvoice.subscription;
    return typeof sub === "string" ? sub : sub?.id ?? null;
  }
  return null;
}

function isActiveLikeStatus(status: unknown): boolean {
  return status === "active" || status === "canceling";
}

function getCurrentPeriodEndUnix(
  subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>
): number | null {
  const compatSubscription = subscription as unknown as {
    current_period_end?: unknown;
  };
  const periodEnd = compatSubscription.current_period_end;
  return typeof periodEnd === "number" && periodEnd > 0 ? periodEnd : null;
}

/**
 * Retrieves the actual current_period_end from Stripe for a given subscription.
 * Falls back to now + 30 days only if the API call fails.
 */
async function getRealPeriodEnd(subscriptionId: string): Promise<Date> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // current_period_end is a Unix timestamp in seconds
    const periodEnd = getCurrentPeriodEndUnix(sub);
    if (periodEnd) {
      return new Date(periodEnd * 1000);
    }
  } catch (err: unknown) {
    console.warn(
      `Could not retrieve subscription ${subscriptionId} for period_end:`,
      err
    );
  }
  // Safe fallback
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 30);
  return fallback;
}

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 * Signature-verified for security.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown webhook signature error";
    console.error("Webhook signature verification failed:", message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Subscription activated (new checkout completed) ──────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const firebaseUid = session.metadata?.firebaseUid;

        if (firebaseUid && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;

          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;

          const periodEnd = await getRealPeriodEnd(subscriptionId);

          const userRef = adminDb.collection("users").doc(firebaseUid);
          const statsRef = adminDb.collection("platformStats").doc("totals");

          await adminDb.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const previousStatus = userSnap.get("subscription.status");

            const subscriptionPatch: Record<string, unknown> = {
              status: "active",
              gateway: "stripe",
              stripeSubscriptionId: subscriptionId,
              currentPeriodEnd: periodEnd,
              canceledAt: null,
            };

            if (customerId) {
              subscriptionPatch.stripeCustomerId = customerId;
            }

            tx.set(
              userRef,
              {
                subscription: subscriptionPatch,
              },
              { merge: true }
            );

            if (!isActiveLikeStatus(previousStatus)) {
              tx.set(
                statsRef,
                { activePremiumSubscribers: FieldValue.increment(1) },
                { merge: true }
              );
            }
          });
        }
        break;
      }

      // ── Successful renewal payment ───────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);
        const isSubscriptionInvoice =
          invoice.billing_reason === "subscription_cycle" ||
          invoice.billing_reason === "subscription_create";

        if (subscriptionId && isSubscriptionInvoice) {
          const usersSnapshot = await adminDb
            .collection("users")
            .where("subscription.stripeSubscriptionId", "==", subscriptionId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            // Use the actual period end from Stripe, not a hardcoded +30 days
            const periodEnd = await getRealPeriodEnd(subscriptionId);

            await userDoc.ref.set(
              {
                subscription: {
                  status: "active",
                  gateway: "stripe",
                  currentPeriodEnd: periodEnd,
                },
              },
              { merge: true }
            );

            const amountUSD = (invoice.amount_paid || 0) / 100;
            const invoiceCurrency = (invoice.currency || "usd").toUpperCase();
            const transactionRef = adminDb
              .collection("transactions")
              .doc(`stripe_invoice_${invoice.id}`);
            const statsRef = adminDb.collection("platformStats").doc("totals");

            await adminDb.runTransaction(async (tx) => {
              const txSnap = await tx.get(transactionRef);
              if (txSnap.exists) {
                return;
              }

              tx.create(transactionRef, {
                userId: userDoc.id,
                amount: amountUSD,
                currency: invoiceCurrency,
                gateway: "stripe",
                type: "subscription_cycle",
                status: "success",
                stripeInvoiceId: invoice.id,
                stripeSubscriptionId: subscriptionId,
                createdAt: new Date(),
              });

              if (invoiceCurrency === "USD" && amountUSD > 0) {
                tx.set(
                  statsRef,
                  { totalRevenueUSD: FieldValue.increment(amountUSD) },
                  { merge: true }
                );
              }
            });
          }
        }
        break;
      }

      // ── Subscription state updates (cancel-at-period-end, resume, dunning) ─
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const usersSnapshot = await adminDb
          .collection("users")
          .where("subscription.stripeSubscriptionId", "==", subscription.id)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const subPeriodEnd = getCurrentPeriodEndUnix(subscription);
          const periodEnd =
            typeof subPeriodEnd === "number" && subPeriodEnd > 0
              ? new Date(subPeriodEnd * 1000)
              : null;

          if (subscription.status === "active") {
            await usersSnapshot.docs[0].ref.set(
              {
                subscription: {
                  status: subscription.cancel_at_period_end ? "canceling" : "active",
                  gateway: "stripe",
                  ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
                },
              },
              { merge: true }
            );
          } else if (subscription.status === "past_due") {
            await usersSnapshot.docs[0].ref.set(
              {
                subscription: {
                  status: "past_due",
                  gateway: "stripe",
                  ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
                },
              },
              { merge: true }
            );
          }
        }
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const usersSnapshot = await adminDb
          .collection("users")
          .where("subscription.stripeSubscriptionId", "==", subscription.id)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userRef = usersSnapshot.docs[0].ref;
          const statsRef = adminDb.collection("platformStats").doc("totals");

          await adminDb.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const previousStatus = userSnap.get("subscription.status");

            tx.set(
              userRef,
              {
                subscription: {
                  status: "canceled",
                  gateway: "stripe",
                  canceledAt: new Date(),
                },
              },
              { merge: true }
            );

            if (isActiveLikeStatus(previousStatus)) {
              tx.set(
                statsRef,
                { activePremiumSubscribers: FieldValue.increment(-1) },
                { merge: true }
              );
            }
          });
        }
        break;
      }

      // ── Payment failed (dunning) ─────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        if (subscriptionId) {
          const usersSnapshot = await adminDb
            .collection("users")
            .where("subscription.stripeSubscriptionId", "==", subscriptionId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            await usersSnapshot.docs[0].ref.update({
              "subscription.status": "past_due",
            });
          }
        }
        break;
      }

      // Unhandled event — log and continue
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error: unknown) {
    console.error("Stripe webhook handler error:", error);
    return Response.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}