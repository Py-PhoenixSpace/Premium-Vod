import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import AuthProvider from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-heading",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://premiumvod.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "FitRahul — Premium Fitness Video Content",
    template: "%s | FitRahul",
  },
  description:
    "FitRahul — Premium fitness videos on demand by Rahul. Subscribe for unlimited access to workout videos, gym training programs, and exclusive fitness content. Subscribe monthly or purchase individual videos.",
  keywords: [
    "fitness videos",
    "workout videos online",
    "gym training videos",
    "premium fitness content",
    "video on demand",
    "FitRahul",
    "Rahul fitness",
    "online workout subscription",
  ],
  authors: [{ name: "FitRahul" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FitRahul",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
    other: [{ rel: "manifest", url: "/manifest.json" }],
  },
  openGraph: {
    title: "FitRahul — Premium Fitness Video Content",
    description:
      "Access Rahul's premium gym and workout videos on demand. Subscribe for unlimited access or purchase individual videos. New content added every week.",
    type: "website",
    url: APP_URL,
    siteName: "FitRahul",
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "FitRahul — Premium Fitness Video Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FitRahul — Premium Fitness Video Content",
    description:
      "Access Rahul's premium gym and workout videos on demand. Subscribe for unlimited access or buy individual videos.",
    images: ["/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

import { PremiumModal } from "@/components/PremiumModal";
import { ExpiredSubscriptionModal } from "@/components/ExpiredSubscriptionModal";
import { WelcomePremiumModal } from "@/components/WelcomePremiumModal";
import { SupportChatFAB } from "@/components/SupportChatFAB";
import { UploadProgressFAB } from "@/components/UploadProgressFAB";
import { Toaster } from "sonner";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        inter.variable,
        outfit.variable
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <AuthProvider>
            <ImpersonationBanner />
            {children}
            <PremiumModal />
            <ExpiredSubscriptionModal />
            <WelcomePremiumModal />
            <SupportChatFAB />
            <UploadProgressFAB />
            <Toaster
              position="bottom-right"
              theme="system"
              richColors
              closeButton
            />
          </AuthProvider>

        </ThemeProvider>
      </body>
    </html>
  );
}
