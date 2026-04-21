"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Shield,
  ShieldAlert,
  Loader2,
} from "lucide-react";

const superAdminLinks = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "All Users", icon: Users },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialized && (!user || user.role !== "super-admin")) {
      router.push("/dashboard");
    }
  }, [user, initialized, router]);

  // Show spinner only while auth is still resolving
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  // Auth resolved but not super-admin — render nothing while redirect fires
  if (!user || user.role !== "super-admin") {
    return null;
  }

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-64 min-h-[calc(100vh-5rem)] border-r border-border/20 p-5 bg-card/30">
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-accent-foreground" />
            </div>
            <div>
              <span className="font-bold text-sm brand-gold-text">Super Admin</span>
              <p className="text-[10px] text-muted-foreground">Full platform control</p>
            </div>
          </div>

          <nav className="space-y-1">
            {superAdminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === link.href
                    ? "brand-gradient-warm text-accent-foreground shadow-lg shadow-accent/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <link.icon className="w-4 h-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Admin Panel access — Upload and Videos live there */}
          <div className="mt-auto">
            <div className="border-t border-border/20 pt-4 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
                Content Management
              </p>
              <Link
                href="/admin"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname?.startsWith("/admin")
                    ? "brand-gradient text-white shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <Shield className="w-4 h-4" />
                Admin Panel
              </Link>
            </div>
          </div>
        </aside>

        {/* Mobile bottom bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-border/20">
          <nav className="flex justify-around py-2.5">
            {superAdminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium transition-colors ${
                  pathname === link.href ? "text-accent" : "text-muted-foreground"
                }`}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
            <Link
              href="/admin"
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium transition-colors ${
                pathname?.startsWith("/admin") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Shield className="w-5 h-5" />
              Admin
            </Link>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 relative">
          <div className="absolute inset-0 mesh-bg opacity-20 pointer-events-none" />
          <div className="relative">{children}</div>
        </div>
      </div>
    </main>
  );
}
