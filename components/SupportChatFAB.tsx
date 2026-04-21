"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isSubscriptionValid } from "@/lib/subscription-utils";
import { useSupportChat } from "@/lib/hooks/useSupportChat";
import { auth } from "@/lib/firebase";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Headphones,
  Crown,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { ChatMessage } from "@/types";

// ─── Single message bubble ───────────────────────────────────────────────────
function MessageBubble({ msg, fullscreen }: { msg: ChatMessage; fullscreen: boolean }) {
  const isAdmin = msg.senderId === "admin";

  return (
    <div className={`flex ${isAdmin ? "justify-start" : "justify-end"} mb-3`}>
      {isAdmin && (
        <div className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center shrink-0 mr-2 mt-auto mb-0.5">
          <Headphones className="w-3 h-3 text-white" />
        </div>
      )}
      <div
        className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          fullscreen ? "max-w-[60%]" : "max-w-[78%]"
        } ${
          isAdmin
            ? "bg-muted/60 text-foreground rounded-tl-sm border border-border/30"
            : "brand-gradient text-white rounded-tr-sm shadow-md shadow-primary/20"
        }`}
      >
        <p className={fullscreen ? "text-[15px]" : "text-sm"}>{msg.text}</p>
        <p
          className={`text-[10px] mt-1 ${
            isAdmin ? "text-muted-foreground" : "text-white/60"
          }`}
        >
          {msg.createdAt?.toDate
            ? msg.createdAt
                .toDate()
                .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────
function ChatPanel({
  user,
  onClose,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore>["user"]>;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, loading, sendMessage } = useSupportChat({
    userId: user.uid,
    // Priority: Firebase Auth currentUser (has Google name) → Firestore displayName → email
    userName:
      auth.currentUser?.displayName ||
      user.displayName ||
      user.email ||
      "",
    userEmail: user.email || "",
    senderId: "user",
    senderName:
      auth.currentUser?.displayName ||
      user.displayName ||
      user.email ||
      "User",
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [fullscreen, onClose]);

  // Lock body scroll in fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(input);
      setInput("");
    } finally {
      setSending(false);
    }
  }, [input, sending, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Fullscreen layout ───────────────────────────────────────────────────
  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-background animate-in fade-in duration-200"
        role="dialog"
        aria-label="Support chat fullscreen"
      >
        {/* Ambient background */}
        <div className="absolute inset-0 mesh-bg opacity-30 pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center gap-3 px-4 sm:px-6 py-4 brand-gradient shrink-0 overflow-hidden">
          <div className="absolute inset-0 shimmer opacity-20 pointer-events-none" />
          <div className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight">Premium Support</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <p className="text-white/75 text-xs">Typically online · End‑to‑end encrypted</p>
            </div>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => setFullscreen(false)}
              className="p-2 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all"
              aria-label="Exit fullscreen"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-16 lg:px-32 xl:px-48 py-6 [scrollbar-width:thin] [scrollbar-color:var(--scrollbar-thumb)_transparent]"
          aria-live="polite"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl brand-gradient/10 border border-primary/20 flex items-center justify-center">
                <Crown className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Premium Support</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Send a message and our team will get back to you as soon as possible.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} fullscreen={true} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Divider */}
        <div className="section-divider mx-4 sm:mx-8" />

        {/* Input */}
        <div className="relative px-4 sm:px-8 md:px-16 lg:px-32 xl:px-48 py-4 shrink-0">
          <div className="flex gap-3 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message support team…"
              maxLength={500}
              disabled={sending}
              className="flex-1 min-w-0 bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50"
              aria-label="Message input"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-12 h-12 shrink-0 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground/40 mt-3">
            Premium exclusive · End‑to‑end encrypted
          </p>
        </div>
      </div>
    );
  }

  // ─── Floating panel layout (compact + mobile) ─────────────────────────────
  return (
    <div
      className={`
        fixed z-[201] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300
        /* Mobile: full-width bottom sheet */
        bottom-0 left-0 right-0
        /* SM+: floating panel anchored to bottom-right */
        sm:bottom-24 sm:left-auto sm:right-5 sm:w-[380px]
      `}
      role="dialog"
      aria-label="Support chat"
    >
      {/* Backdrop for mobile bottom-sheet feel */}
      <div className="sm:hidden absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />

      {/* Glass card */}
      <div className="
        glass-card border border-primary/20 shadow-2xl shadow-primary/15 overflow-hidden flex flex-col
        /* Mobile: rounded only at top */
        rounded-t-[1.5rem]
        /* SM+: fully rounded */
        sm:rounded-[1.5rem]
      ">
        {/* Pull-handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <div className="relative flex items-center gap-3 px-4 py-3.5 brand-gradient overflow-hidden">
          <div className="absolute inset-0 shimmer opacity-30 pointer-events-none" />

          <div className="relative w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Support Chat</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <p className="text-white/75 text-[11px]">Premium support · Typically online</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => setFullscreen(true)}
              className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all"
              aria-label="Expand to fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all"
              aria-label="Close chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top ribbon */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-1 min-h-[260px] max-h-[50vh] sm:max-h-[380px] [scrollbar-width:thin] [scrollbar-color:var(--scrollbar-thumb)_transparent]"
          aria-live="polite"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full pt-12">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pt-8 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Premium Support</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  Send a message and our team will get back to you as soon as possible.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} fullscreen={false} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Divider */}
        <div className="section-divider mx-4" />

        {/* Input area */}
        <div className="p-3 flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message support team…"
            maxLength={500}
            disabled={sending}
            className="flex-1 min-w-0 bg-muted/40 border border-border/40 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50"
            aria-label="Message input"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-9 h-9 shrink-0 rounded-xl brand-gradient flex items-center justify-center shadow-md shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>

        {/* Brand note */}
        <p className="text-center text-[10px] text-muted-foreground/50 pb-3 px-4">
          Premium exclusive · End‑to‑end encrypted
        </p>
      </div>
    </div>
  );
}

// ─── Main FAB Component ──────────────────────────────────────────────────────
export function SupportChatFAB() {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Hydration guard — portals need the DOM
  useEffect(() => {
    setMounted(true);
  }, []);

  // Gate: only render for valid premium subscribers
  const isPremium = isSubscriptionValid(user?.subscription ?? null);
  if (!user || !isPremium) return null;
  if (!mounted) return null;

  return createPortal(
    <>
      {/* Chat Panel */}
      {isOpen && (
        <ChatPanel
          user={user}
          onClose={() => setIsOpen(false)}
        />
      )}

      {/* Mobile overlay backdrop when chat is open */}
      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 z-[200] bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Tooltip (desktop only) */}
      {showTooltip && !isOpen && (
        <div className="hidden sm:block fixed bottom-[5.5rem] right-5 z-[202] pointer-events-none animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="glass-card rounded-xl px-3 py-1.5 border border-primary/20 shadow-lg">
            <p className="text-xs font-medium text-foreground whitespace-nowrap">Premium Support</p>
          </div>
          <div className="absolute right-4 -bottom-1.5 w-3 h-3 rotate-45 glass-card border-r border-b border-border/20" />
        </div>
      )}

      {/* FAB Button */}
      <button
        id="support-chat-fab"
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={isOpen ? "Close support chat" : "Open premium support chat"}
        className={`
          fixed z-[202] w-14 h-14 rounded-full brand-gradient shadow-xl shadow-primary/30
          flex items-center justify-center
          hover:-translate-y-1 hover:shadow-primary/50 active:scale-95
          transition-all duration-200 group
          /* On mobile when chat is open, shift down so it's below the bottom sheet */
          ${isOpen ? "bottom-[calc(50vh+1rem)] sm:bottom-5" : "bottom-5"}
          right-5
        `}
      >
        {/* Pulsing outer ring */}
        <span className="absolute inset-0 rounded-full brand-gradient opacity-40 pulse-glow" />

        {/* Icon swap */}
        <span className="relative z-10 transition-all duration-200">
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <MessageCircle className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          )}
        </span>

        {/* Premium badge pip */}
        {!isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent border-2 border-background flex items-center justify-center">
            <Crown className="w-2 h-2 text-accent-foreground" />
          </span>
        )}
      </button>
    </>,
    document.body
  );
}
