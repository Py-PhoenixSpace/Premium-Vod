import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read FitRahul's Terms of Service. Understand what your subscription or purchase covers, cancellation terms, and your rights as a user.",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-muted-foreground">
            Last updated: April 2026 &bull; Effective immediately
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-invert max-w-none">
        <div className="space-y-10 text-foreground/90 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-xl font-bold mb-3">1. About FitRahul</h2>
            <p>
              FitRahul is a fitness video-on-demand (VOD) platform operated by
              Rahul (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). We
              provide on-demand access to premium gym, workout, and fitness
              training videos through subscription plans and individual video
              purchases. By accessing or using the FitRahul website or services,
              you agree to these Terms of Service.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years of age to use this platform. By
              creating an account, you confirm that you meet this age requirement
              and that the information you provide is accurate and complete.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold mb-3">3. Subscriptions</h2>
            <p>
              FitRahul offers time-based subscription plans (1-month, 3-month,
              and 6-month). A subscription grants you unlimited streaming access
              to all published videos on the platform for the duration of your
              active subscription period.
            </p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                Subscriptions are <strong>non-transferable</strong> and tied to
                the account used at purchase.
              </li>
              <li>
                Access to content expires at the end of the subscription period
                unless renewed.
              </li>
              <li>
                Subscriptions are <strong>not auto-renewed</strong> unless
                explicitly stated at the time of purchase.
              </li>
              <li>
                New content is added to the platform on a regular basis; however,
                we do not guarantee a specific upload schedule.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold mb-3">4. Individual Video Purchases</h2>
            <p>
              Certain videos may be available for one-time purchase. A purchased
              video grants you permanent streaming access to that specific video
              from your account, as long as the video remains published on the
              platform.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold mb-3">5. Payments</h2>
            <p>
              All payments are processed securely via Razorpay. By making a
              purchase, you authorise us to charge the stated amount to your
              selected payment method. All prices are listed in Indian Rupees
              (INR) and are inclusive of applicable taxes unless otherwise
              stated.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold mb-3">6. Cancellations &amp; Refunds</h2>
            <p>
              Please refer to our{" "}
              <Link href="/refund" className="text-primary hover:underline">
                Refund &amp; Cancellation Policy
              </Link>{" "}
              for full details. In summary:
            </p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                Refunds are not processed automatically. To request a refund,
                contact us at{" "}
                <a
                  href="mailto:dravidrahul.p@gmail.com"
                  className="text-primary hover:underline"
                >
                  dravidrahul.p@gmail.com
                </a>
                .
              </li>
              <li>
                Refund eligibility is assessed on a case-by-case basis at our
                discretion.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold mb-3">7. Content &amp; Intellectual Property</h2>
            <p>
              All videos, images, and content published on FitRahul are the
              intellectual property of FitRahul / Rahul. You may not download,
              redistribute, reproduce, or share any content from this platform
              without explicit written permission.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-bold mb-3">8. Prohibited Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>Share your account credentials with others.</li>
              <li>Use any automated tool to scrape or download content.</li>
              <li>
                Attempt to bypass any access controls, paywalls, or
                authentication measures.
              </li>
              <li>
                Use the platform for any unlawful or fraudulent purpose.
              </li>
            </ul>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-bold mb-3">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any
              time if you violate these Terms. Upon termination, your access to
              purchased content or subscription benefits will cease.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-xl font-bold mb-3">10. Limitation of Liability</h2>
            <p>
              FitRahul is provided &quot;as is&quot; without warranties of any
              kind. We are not liable for any indirect, incidental, or
              consequential damages arising from your use of the platform.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-xl font-bold mb-3">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of India. Any disputes shall
              be subject to the exclusive jurisdiction of the courts of India.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-xl font-bold mb-3">12. Contact</h2>
            <p>
              For any questions regarding these Terms, please contact us at:{" "}
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
