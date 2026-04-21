"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  Film,
  Shield,
  Loader2,
  Users,
  IndianRupee,
  Headphones,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/pricing", label: "Pricing", icon: IndianRupee },
  { href: "/admin/upload", label: "Upload", icon: Upload },
  { href: "/admin/videos", label: "Media", icon: Film },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/support", label: "Support", icon: Headphones },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, initialized } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadSupport, setUnreadSupport] = useState(0);

  // Real-time unread support count
  useEffect(() => {
    const q = query(
      collection(db, "supportChats"),
      where("unreadByAdmin", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => setUnreadSupport(snap.size));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (initialized && (!user || (user.role !== "admin" && user.role !== "super-admin"))) {
      router.push("/dashboard");
    }
  }, [user, initialized, router]);

  // Render nothing until auth is resolved — prevents flash of admin UI
  // before the role check and router.push() complete
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Auth resolved but unauthorized — render null (router.push is in flight)
  if (!user || (user.role !== "admin" && user.role !== "super-admin")) {
    return null;
  }

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-20 flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-64 min-h-[calc(100vh-5rem)] border-r border-border/20 p-5 bg-card/30">
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm">{user.role === "super-admin" ? "Super Admin" : "Admin"}</span>
              <p className="text-[10px] text-muted-foreground">Manage platform</p>
            </div>
          </div>

          <nav className="space-y-1">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === link.href
                    ? "brand-gradient text-white shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <link.icon className="w-4 h-4" />
                {link.label}
                {link.href === "/admin/support" && unreadSupport > 0 && (
                  <span className="ml-auto w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm shadow-primary/40">
                    {unreadSupport > 9 ? "9+" : unreadSupport}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile bottom bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-border/20">
          <nav className="grid grid-cols-5 gap-0.5 px-1 py-2">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium leading-tight transition-colors ${
                  pathname === link.href
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 p-6 md:p-8 pb-24 md:pb-8 relative overflow-x-hidden">
          <div className="absolute inset-0 mesh-bg opacity-20 pointer-events-none" />
          <div className="relative">{children}</div>
        </div>
      </div>
    </main>
  );
}
