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
    default: "PremiumVOD — Premium Video Content",
    template: "%s | PremiumVOD",
  },
  description:
    "Access premium video content on demand. Stream 4K cinematic videos, tutorials, and exclusive releases. Subscribe or purchase to unlock unlimited access.",
  keywords: [
    "video",
    "streaming",
    "premium content",
    "VOD",
    "video on demand",
    "4K videos",
    "PremiumVOD",
  ],
  authors: [{ name: "PremiumVOD" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PremiumVOD",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
    other: [{ rel: "manifest", url: "/manifest.json" }],
  },
  openGraph: {
    title: "PremiumVOD — Premium Video Content",
    description:
      "Stream premium video content on demand. Exclusive releases, 4K videos, and more. Subscribe or purchase today.",
    type: "website",
    url: APP_URL,
    siteName: "PremiumVOD",
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "PremiumVOD — Premium Video Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PremiumVOD — Premium Video Content",
    description:
      "Stream premium video content on demand. Exclusive releases, 4K videos, tutorials, and more.",
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
