import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "FitRahul's Privacy Policy. Learn how we collect, use, and protect your personal information when you use our fitness video platform.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/30 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            ← Back to FitRahul
          </Link>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-heading)] mb-3">
            Privacy Policy
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
            <h2 className="text-xl font-bold mb-3">1. Who We Are</h2>
            <p>
              FitRahul is a fitness video-on-demand platform operated by Rahul.
              This Privacy Policy explains how we collect, use, and safeguard
              your personal information when you visit or use our website and
              services.
            </p>
            <p className="mt-2">
              Contact:{" "}
              <a
                href="mailto:dravidrahul.p@gmail.com"
                className="text-primary hover:underline"
              >
                dravidrahul.p@gmail.com
              </a>
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold mb-3">2. Information We Collect</h2>
            <p>We collect the following information when you use FitRahul:</p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                <strong>Account information:</strong> Your name and email
                address when you register.
              </li>
              <li>
                <strong>Payment information:</strong> Payment transactions are
                processed by Razorpay. We do not store your card details or
                banking credentials on our servers.
              </li>
              <li>
                <strong>Usage data:</strong> Videos you watch, your watch
                progress, and content you have purchased or subscribed to.
              </li>
              <li>
                <strong>Device &amp; browser information:</strong> Basic
                technical data such as browser type and device type for
                platform optimisation.
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>Create and manage your account.</li>
              <li>Process payments and grant content access.</li>
              <li>Save your watch history and progress.</li>
              <li>Send important account and service notifications.</li>
              <li>Improve and maintain the FitRahul platform.</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell or rent your personal information
              to third parties.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold mb-3">4. Third-Party Services</h2>
            <p>
              FitRahul uses the following trusted third-party services to
              operate the platform:
            </p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>
                <strong>Firebase (Google):</strong> User authentication and
                database storage.
              </li>
              <li>
                <strong>Cloudinary:</strong> Video and image hosting and
                delivery.
              </li>
              <li>
                <strong>Razorpay:</strong> Secure payment processing. Razorpay
                is PCI-DSS compliant and handles all payment data directly.
              </li>
            </ul>
            <p className="mt-3">
              Each of these services operates under their own privacy policies
              and data protection standards.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold mb-3">5. Cookies</h2>
            <p>
              FitRahul uses minimal session cookies required for authentication
              and to keep you logged in. We do not use advertising or tracking
              cookies.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold mb-3">6. Data Security</h2>
            <p>
              We take reasonable measures to protect your information. Your
              account is secured by Firebase Authentication. Payment data is
              handled exclusively by Razorpay and is never stored on FitRahul
              servers.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              <li>Request access to the personal data we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your account and associated data.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:dravidrahul.p@gmail.com"
                className="text-primary hover:underline"
              >
                dravidrahul.p@gmail.com
              </a>
              .
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-bold mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do,
              we will update the &quot;Last updated&quot; date at the top of
              this page. Continued use of FitRahul after changes constitutes
              your acceptance of the updated policy.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-bold mb-3">9. Contact</h2>
            <p>
              For privacy-related questions or data requests, please contact:{" "}
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
            <Link href="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
