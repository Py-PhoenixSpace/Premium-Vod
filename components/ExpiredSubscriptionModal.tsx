"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExpiredSubscriptionModal() {
  const { user, initialized } = useAuthStore();
  const { openPremiumModal } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!initialized || !user) return;

    const sub = user.subscription;
    
    // Check if the user had a subscription that is now expired/invalid
    if (sub && sub.status !== "none") {
      const isValid = isSubscriptionValid(sub);
      
      if (!isValid) {
        // Prevent spam: only show once per browser session
        const hasSeen = sessionStorage.getItem("hasSeenExpirationModal");
        if (!hasSeen) {
          setIsOpen(true);
          sessionStorage.setItem("hasSeenExpirationModal", "true");
        }
      }
    }
  }, [user, initialized]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md p-6 overflow-hidden bg-background/95 backdrop-blur-2xl border-border/30">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-background to-background pointer-events-none" />
        
        <DialogHeader className="relative text-center sm:text-center pt-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 ring-8 ring-amber-500/5">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight">Subscription Ended</DialogTitle>
          <DialogDescription className="text-center pt-3 text-base">
            Your premium subscription has ended. You can renew it right here to regain unlimited access to all exclusive content.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex flex-col gap-3 mt-6">
          <Button 
            className="w-full h-12 text-base brand-gradient-warm text-accent-foreground font-bold shadow-lg shadow-accent/20"
            onClick={() => {
              setIsOpen(false);
              // Slight delay so the expired modal visually fades out first
              setTimeout(() => openPremiumModal(), 150);
            }}
          >
            <Crown className="w-5 h-5 mr-2" />
            Renew Premium
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => setIsOpen(false)}
          >
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
