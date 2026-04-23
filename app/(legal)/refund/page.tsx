import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "FitRahul's Refund and Cancellation Policy. Understand how to request a refund for subscription or individual video purchases.",
};

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/30 bg-muted/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            ← Back to FitRahul
          </Link>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-heading)] mb-3">
            Refund &amp; Cancellation Policy
          </h1>
          <p className="text-muted-foreground">
            Last updated: April 2026 &bull; Effective immediately
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-10 text-foreground/90 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-xl font-bold mb-3">1. Overview</h2>
            <p>
              FitRahul is a digital fitness video platform. All purchases
              (subscriptions and individual videos) are for digital content
              delivered immediately upon payment. Due to the nature of digital
              goods, all sales are generally considered final.
            </p>
            <p className="mt-2">
              However, we handle refund requests on a case-by-case basis. If
              you believe you are entitled to a refund, please contact us
              directly.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold mb-3">2. Subscription Purchases</h2>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                Subscriptions grant immediate access to all published content on
                FitRahul for the selected period.
              </li>
              <li>
                Once content access has been granted, subscriptions are{" "}
                <strong>non-refundable</strong> as the service has been
                delivered.
              </li>
              <li>
                If you experience a technical issue that prevents you from
                accessing any content, please contact us within{" "}
                <strong>7 days</strong> of purchase for assistance.
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold mb-3">3. Individual Video Purchases</h2>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                Individual video purchases grant permanent streaming access to
                that specific video.
              </li>
              <li>
                Refunds for individual video purchases are only considered in
                cases of technical failure where the video cannot be accessed
                despite the payment being processed.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold mb-3">4. How to Request a Refund</h2>
            <p>
              FitRahul does not offer self-service refunds. To request a refund,
              please contact the admin directly:
            </p>
            <div className="mt-4 glass-card rounded-2xl p-5 border border-border/50">
              <p className="text-sm text-muted-foreground mb-1">Email us at:</p>
              <a
                href="mailto:dravidrahul.p@gmail.com"
                className="text-lg font-semibold text-primary hover:underline"
              >
                dravidrahul.p@gmail.com
              </a>
              <p className="text-sm text-muted-foreground mt-3">
                Please include: your registered email address, the date of
                purchase, the order/transaction ID (if available), and the
                reason for your request.
              </p>
            </div>
            <p className="mt-4">
              We aim to respond to all refund enquiries within{" "}
              <strong>3–5 business days</strong>.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold mb-3">5. Cancellations</h2>
            <p>
              FitRahul subscriptions are <strong>not auto-renewed</strong>.
              There is no recurring billing — you pay once for your chosen
              subscription period and access expires at the end of that period.
              No cancellation action is required.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold mb-3">6. Chargebacks &amp; Disputes</h2>
            <p>
              We encourage you to contact us before initiating a chargeback with
              your bank or payment provider. We will work with you to resolve
              any legitimate issues promptly. Fraudulent chargebacks may result
              in account suspension.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold mb-3">7. Contact</h2>
            <p>
              For all refund or cancellation requests:{" "}
              <a
                href="mailto:dravidrahul.p@gmail.com"
                className="text-primary hover:underline"
              >
                dravidrahul.p@gmail.com
              </a>
            </p>
          </section>

        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border/30 py-8 bg-muted/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap gap-4 text-sm text-muted-foreground justify-between">
          <span>&copy; {new Date().getFullYear()} FitRahul. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
