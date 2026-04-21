"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Crown, Sparkles, CheckCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Confetti from "react-confetti";

function WelcomeModalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Only capture dimensions when open to avoid resize event listener overhead
    if (isOpen) {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchParams.get("subscription") === "success") {
      setIsOpen(true);
      // Clean up the URL to prevent showing this again on reload
      const url = new URL(window.location.href);
      url.searchParams.delete("subscription");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md p-0 overflow-visible bg-background/95 backdrop-blur-3xl border border-primary/20 shadow-2xl shadow-primary/20">
        
        {/* Confetti Celebration overlay */}
        <div className="fixed inset-0 pointer-events-none z-50">
          <Confetti
            width={dimensions.width}
            height={dimensions.height}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
            colors={['#7c3aed', '#f59e0b', '#10b981', '#3b82f6', '#ec4899']}
          />
        </div>

        {/* Ambient background glows */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 pointer-events-none rounded-lg" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/30 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/30 blur-[80px] rounded-full pointer-events-none" />

        <div className="p-8 flex flex-col items-center text-center relative z-10">
          
          {/* Central Hero Icon */}
          <div className="relative w-24 h-24 rounded-[2rem] brand-gradient flex items-center justify-center mb-8 ring-[10px] ring-primary/10 shadow-2xl shadow-primary/30 animate-in zoom-in duration-500 delay-100">
            <Crown className="w-12 h-12 text-white drop-shadow-md" />
            
            {/* Sparkles decoration */}
            <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg transform rotate-12 animate-in zoom-in duration-500 delay-300">
              <Sparkles className="w-5 h-5 text-accent-foreground" />
            </div>
            
            {/* Success check decoration */}
            <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg animate-in zoom-in duration-500 delay-500">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </div>

          <DialogHeader className="mb-8 space-y-3">
            <DialogTitle className="text-3xl sm:text-4xl font-bold font-[family-name:var(--font-heading)] leading-tight">
              Welcome to <span className="brand-gradient-text">Premium</span>
            </DialogTitle>
            <DialogDescription className="text-base text-foreground/80 leading-relaxed max-w-[90%] mx-auto">
              Your subscription is officially active! You now have unrestricted, unlimited access to our entire catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="w-full space-y-3 mt-2">
            <Button asChild className="w-full h-14 text-lg brand-gradient text-white font-bold shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all text-shadow-sm group">
              <Link href="/videos" onClick={() => setIsOpen(false)}>
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" fill="white" />
                Start Watching Now
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setIsOpen(false)} className="w-full h-12 text-muted-foreground hover:text-foreground font-medium">
              Go to Dashboard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WelcomePremiumModal() {
  return (
    <Suspense fallback={null}>
      <WelcomeModalInner />
    </Suspense>
  );
}
