"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  getRedirectResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInWithGooglePopupOrRedirect } from "@/lib/google-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Mail, Lock, User, Loader2, Eye, EyeOff, ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const { user, initialized } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [authReady, setAuthReady] = useState(false);

  async function setupAccount(idToken: string, displayName: string) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, displayName }),
    });

    if (!res.ok) {
      throw new Error("Failed to set up account");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function finalizeRedirectRegister() {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;

        const idToken = await result.user.getIdToken();
        await setupAccount(idToken, result.user.displayName || "User");

        if (!cancelled) {
          router.replace("/dashboard");
        }
      } catch (err: any) {
        if (!cancelled && err?.code !== "auth/no-auth-event") {
          console.error("Google redirect auth error:", err);
          setError("Google sign-up could not be completed. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    finalizeRedirectRegister();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (authReady && initialized && user) {
      router.replace("/dashboard");
    }
  }, [authReady, initialized, user, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      const idToken = await result.user.getIdToken();

      // Setup account (Firestore + session) in background, route immediately
      setupAccount(idToken, name).catch((err) => {
        console.error("Account setup error:", err);
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err.code === "auth/email-already-in-use"
          ? "Email already registered. Try signing in."
          : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleRegister() {
    setGoogleLoading(true);
    setError("");
    try {
      const outcome = await signInWithGooglePopupOrRedirect(auth);
      if (outcome.kind === "redirect") {
        return;
      }

      const idToken = await outcome.credential.user.getIdToken();

      // Setup account (Firestore + session) in background, route immediately
      setupAccount(idToken, outcome.credential.user.displayName || "User").catch(
        (err) => {
          console.error("Account setup error:", err);
        }
      );
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google sign-up failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  const benefits = [
    "Access to free video library",
    "Track your progress & streaks",
    "Personalized recommendations",
    "Join 10K+ active members",
  ];

  return (
    <main className="min-h-screen flex">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[120px] float" />
        <div className="absolute bottom-1/3 left-1/3 w-[350px] h-[350px] rounded-full bg-primary/12 blur-[100px] float-delayed" />
        
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12 text-center">
          <div className="w-20 h-20 rounded-2xl brand-gradient-warm flex items-center justify-center mb-8 brand-glow-warm">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-bold font-[family-name:var(--font-heading)] mb-4">
            Begin your<br />
            <span className="brand-gold-text">transformation.</span>
          </h2>
          <p className="text-muted-foreground max-w-sm leading-relaxed mb-10">
            Create your free account and start watching premium video content today.
          </p>
          
          <div className="space-y-4 text-left w-full max-w-xs">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-3 glass-card rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm text-foreground/80">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute inset-0 mesh-bg opacity-30" />
        
        <div className="relative w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">
              Create <span className="brand-gold-text">account</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Start your content journey in seconds
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 mb-6 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="pl-10 h-12 bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-12 bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-12 bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 brand-gradient text-white font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/35 transition-all"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="relative my-8">
            <div className="section-divider" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 text-xs text-muted-foreground">
              or continue with
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full h-12 border-border/50 bg-muted/20 hover:bg-muted/40 font-medium"
            onClick={handleGoogleRegister}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}