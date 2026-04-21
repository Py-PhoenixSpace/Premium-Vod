"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Flame,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Crown,
  ChevronDown,
  ShieldAlert,
  Shield,
} from "lucide-react";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { DEFAULT_SOCIAL_LINKS, type SocialLinks } from "@/lib/social-links";

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.53 3h3.31l-7.24 8.27L22 21h-6.54l-5.12-6.43L4.67 21H1.35l7.74-8.85L1 3h6.7l4.63 5.82L17.53 3zm-1.15 16h1.83L6.7 4.9H4.74z" />
  </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.04 2.33A9.9 9.9 0 0 0 2.5 16.81L1.4 21.4l4.71-1.24a9.9 9.9 0 0 0 4.72 1.2h.01c5.48 0 9.92-4.45 9.92-9.92a9.9 9.9 0 0 0-8.72-9.11zm-1.2 17.17h-.01a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-2.67.7.71-2.6-.19-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.53 3.68-8.21 8.22-8.21a8.17 8.17 0 0 1 5.81 2.41 8.15 8.15 0 0 1 2.4 5.8c0 4.54-3.68 8.22-8.21 8.22zm4.5-6.1c-.25-.12-1.45-.71-1.67-.79-.22-.08-.39-.12-.55.13-.16.25-.63.79-.78.95-.14.16-.29.18-.53.06a6.76 6.76 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.25-.02-.38.1-.5.11-.1.24-.27.37-.4.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.47-.4-.41-.55-.42-.14-.01-.3-.01-.47-.01-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.06 0 1.22.89 2.39 1.01 2.55.12.17 1.73 2.64 4.18 3.7.58.25 1.04.4 1.4.51.58.19 1.12.16 1.54.1.47-.07 1.45-.6 1.66-1.17.2-.57.2-1.07.14-1.17-.06-.11-.22-.17-.47-.3z" />
  </svg>
);

export default function Navbar() {
  const { user, initialized } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const previousPathname = useRef(pathname);
  const mobileOpenRef = useRef(mobileOpen);
  const userMenuOpenRef = useRef(userMenuOpen);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    DEFAULT_SOCIAL_LINKS
  );

  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
    userMenuOpenRef.current = userMenuOpen;
  }, [mobileOpen, userMenuOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Close open menus only when route actually changes.
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (!mobileOpenRef.current && !userMenuOpenRef.current) return;

    const timer = window.setTimeout(() => {
      setMobileOpen(false);
      setUserMenuOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let canceled = false;

    async function fetchSocialLinks() {
      try {
        const res = await fetch("/api/social-links", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        if (!canceled && data?.links) {
          setSocialLinks({
            instagram: data.links.instagram || DEFAULT_SOCIAL_LINKS.instagram,
            twitter: data.links.twitter || DEFAULT_SOCIAL_LINKS.twitter,
            whatsapp: data.links.whatsapp || DEFAULT_SOCIAL_LINKS.whatsapp,
          });
        }
      } catch {
        // Keep defaults if settings endpoint is temporarily unavailable.
      }
    }

    fetchSocialLinks();

    return () => {
      canceled = true;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/videos", label: "Media" },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "glass-strong shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-9 h-9 rounded-lg brand-gradient flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/30">
              <Flame className="w-5 h-5 text-white" />
              <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xl font-bold font-[family-name:var(--font-heading)] tracking-tight">
              <span className="brand-gradient-text">Fit</span>
              <span className="brand-gold-text">Rahul</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`relative px-4 ${
                    isActive(link.href)
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full brand-gradient" />
                  )}
                </Button>
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {/* Social Links */}
            <div className="flex items-center gap-3 mr-2">
              <Link href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-foreground transition-transform hover:scale-110">
                <InstagramIcon className="w-5 h-5 cursor-pointer" />
              </Link>
              <Link href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="X" className="text-muted-foreground hover:text-foreground transition-transform hover:scale-110">
                <XIcon className="w-5 h-5 cursor-pointer" />
              </Link>
              <Link href={socialLinks.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-muted-foreground hover:text-foreground transition-transform hover:scale-110">
                <WhatsAppIcon className="w-5 h-5 cursor-pointer" />
              </Link>
            </div>

            {/* Theme toggle — always visible */}
            <ThemeToggle />

            {initialized && user ? (
              <>
                {isSubscriptionValid(user.subscription) && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
                    <Crown className="w-3 h-3" />
                    Premium
                  </div>
                )}
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Button>
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="gap-2 text-primary hover:text-primary/80">
                      <Shield className="w-3.5 h-3.5" />
                      Admin
                    </Button>
                  </Link>
                )}
                {user.role === "super-admin" && (
                  <Link href="/super-admin">
                    <Button variant="ghost" size="sm" className="gap-2 text-accent hover:text-accent/80">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Super Admin
                    </Button>
                  </Link>
                )}

                {/* User dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 pl-3 border-l border-border/50 hover:opacity-80 transition-opacity"
                  >
                    <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-white">
                      {(user.displayName || "U")[0].toUpperCase()}
                    </div>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 glass-card rounded-xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-3 py-2 border-b border-border/30 mb-1">
                        <p className="text-sm font-medium truncate">{user.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : initialized ? (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="brand-gradient text-white font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:opacity-95 transition-all">
                    Get Started
                  </Button>
                </Link>
              </>
            ) : null}
          </div>

          {/* Mobile right controls */}
          <div className="md:hidden flex items-center gap-0.5">
            <div className="flex items-center gap-1 mr-1">
              <Link href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50">
                <InstagramIcon className="w-4 h-4 cursor-pointer" />
              </Link>
              <Link href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="X" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50">
                <XIcon className="w-4 h-4 cursor-pointer" />
              </Link>
              <Link href={socialLinks.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50">
                <WhatsAppIcon className="w-4 h-4 cursor-pointer" />
              </Link>
            </div>
            <ThemeToggle />
            <button
              className="text-foreground p-2 rounded-lg hover:bg-muted/50 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden glass-card rounded-2xl mt-2 p-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="block">
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    isActive(link.href) ? "text-primary bg-primary/10" : "text-muted-foreground"
                  }`}
                >
                  {link.label}
                </Button>
              </Link>
            ))}
            <div className="section-divider my-2" />
            {initialized && user ? (
              <>
                <Link href="/dashboard" className="block">
                  <Button variant="ghost" className="w-full justify-start gap-3">
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Button>
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="block">
                    <Button variant="ghost" className="w-full justify-start gap-3 text-primary">
                      <Shield className="w-4 h-4" />
                      Admin
                    </Button>
                  </Link>
                )}
                {user.role === "super-admin" && (
                  <Link href="/super-admin" className="block">
                    <Button variant="ghost" className="w-full justify-start gap-3 text-accent">
                      <ShieldAlert className="w-4 h-4" />
                      Super Admin
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </>
            ) : initialized ? (
              <div className="space-y-2 pt-1">
                <Link href="/login" className="block">
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link href="/register" className="block">
                  <Button className="w-full brand-gradient text-white font-semibold">Get Started</Button>
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </nav>
    </header>
  );
}