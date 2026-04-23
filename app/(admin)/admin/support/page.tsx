"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useSupportChat } from "@/lib/hooks/useSupportChat";
import type { SupportChat, ChatMessage, UserProfile } from "@/types";
import {
  MessageCircle,
  ShieldCheck,
  Send,
  Loader2,
  Users,
  ChevronLeft,
  Crown,
} from "lucide-react";

// ─── Single message bubble (admin view) ─────────────────────────────────────
function AdminMessageBubble({ msg }: { msg: ChatMessage }) {
  const isAdmin = msg.senderId === "admin";
  return (
    <div className={`flex ${isAdmin ? "justify-end" : "justify-start"} mb-3`}>
      {!isAdmin && (
        <div className="w-6 h-6 rounded-full bg-muted border border-border/40 flex items-center justify-center shrink-0 mr-2 mt-auto mb-0.5 text-[10px] font-bold text-muted-foreground uppercase">
          U
        </div>
      )}
      <div
        className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
          isAdmin
            ? "brand-gradient text-white rounded-tr-sm shadow-md shadow-primary/20"
            : "bg-muted/60 text-foreground rounded-tl-sm border border-border/30"
        }`}
      >
        <p>{msg.text}</p>
        <p className={`text-[10px] mt-1 ${isAdmin ? "text-white/60" : "text-muted-foreground"}`}>
          {msg.createdAt?.toDate
            ? msg.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : ""}
        </p>
      </div>
      {isAdmin && (
        <div className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center shrink-0 ml-2 mt-auto mb-0.5">
          <ShieldCheck className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}

// ─── Conversation thread panel ───────────────────────────────────────────────
function ConversationPanel({
  chat,
  adminUser,
  onBack,
}: {
  chat: SupportChat;
  adminUser: UserProfile;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, sendMessage } = useSupportChat({
    userId: chat.userId,
    userName: chat.userName,
    userEmail: chat.userEmail,
    senderId: "admin",
    senderName: adminUser.displayName || "Admin",
  });

  // Mark conversation as read when opened
  useEffect(() => {
    if (chat.unreadByAdmin) {
      updateDoc(doc(db, "supportChats", chat.userId), { unreadByAdmin: false }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Thread Header */}
      <div className="flex items-center gap-3 p-5 border-b border-border/20">
        <button
          onClick={onBack}
          className="md:hidden p-2 rounded-xl hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
          aria-label="Back to conversations"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
          <span className="text-base font-bold text-white uppercase">
            {(chat.userName?.[0] || chat.userEmail?.[0] || "?")}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {chat.userName || chat.userEmail || "Unknown User"}
          </p>
          <p className="text-xs text-muted-foreground truncate">{chat.userEmail}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-500">Premium</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--scrollbar-thumb)_transparent]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg) => <AdminMessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/20 flex gap-2 items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Reply to ${chat.userName || chat.userEmail || "user"}…`}
          maxLength={500}
          disabled={sending}
          className="flex-1 min-w-0 bg-muted/40 border border-border/40 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-10 h-10 shrink-0 rounded-xl brand-gradient flex items-center justify-center shadow-md shadow-primary/25 hover:-translate-y-0.5 hover:shadow-primary/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>
  );
}

// ─── Conversation list item ──────────────────────────────────────────────────
function ConversationRow({
  chat,
  isSelected,
  onClick,
}: {
  chat: SupportChat;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeStr = chat.lastMessageAt?.toDate
    ? chat.lastMessageAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all group ${
        isSelected
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-muted/30 border border-transparent"
      }`}
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shrink-0 shadow-sm shadow-primary/20 text-white font-bold uppercase text-sm">
        {chat.userName?.[0] || chat.userEmail?.[0] || "?"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate">
            {chat.userName || chat.userEmail || "Unknown User"}
          </p>
          <p className="text-[10px] text-muted-foreground shrink-0">{timeStr}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {chat.lastMessageText || "No messages"}
        </p>
      </div>

      {/* Unread badge */}
      {chat.unreadByAdmin && (
        <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 shadow-sm shadow-primary/40 animate-pulse" />
      )}
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminSupportPage() {
  const { user } = useAuthStore();
  const [chats, setChats] = useState<SupportChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedChat, setSelectedChat] = useState<SupportChat | null>(null);

  // Real-time listener on all support conversations
  useEffect(() => {
    const q = query(
      collection(db, "supportChats"),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setChats(snap.docs.map((d) => ({ ...(d.data() as SupportChat) })));
      setLoadingChats(false);
    });
    return () => unsub();
  }, []);

  const unreadCount = chats.filter((c) => c.unreadByAdmin).length;

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl brand-gradient flex items-center justify-center shadow-md shadow-primary/25">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold font-heading">
              Chat with Admin <span className="brand-gradient-text">Inbox</span>
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Direct chats from premium subscribers — reply in real-time.
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary">
              {unreadCount} unread
            </span>
          </div>
        )}
      </div>

      {/* Main chat layout */}
      <div className="glass-card rounded-2xl border border-primary/10 overflow-hidden shadow-xl shadow-primary/5 min-h-[500px] md:min-h-[600px] flex flex-col md:flex-row">
        {/* Sidebar — conversation list */}
        <div
          className={`${
            selectedChat ? "hidden md:flex" : "flex"
          } flex-col w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-border/20 shrink-0`}
        >
          {/* Sidebar header */}
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/20">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Conversations</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {chats.length} total
            </span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-[50vh] md:max-h-none [scrollbar-width:thin] [scrollbar-color:var(--scrollbar-thumb)_transparent]">
            {loadingChats ? (
              <div className="flex items-center justify-center pt-12">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/30 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Premium users can message you directly using the Chat with Admin button.
                  </p>
                </div>
              </div>
            ) : (
              chats.map((chat) => (
                <ConversationRow
                  key={chat.userId}
                  chat={chat}
                  isSelected={selectedChat?.userId === chat.userId}
                  onClick={() => setSelectedChat(chat)}
                />
              ))
            )}
          </div>
        </div>

        {/* Main panel — conversation thread */}
        <div className={`${selectedChat ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
          {selectedChat ? (
            <ConversationPanel
              chat={selectedChat}
              adminUser={user}
              onBack={() => setSelectedChat(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
              <div className="w-16 h-16 rounded-3xl brand-gradient/10 border border-primary/20 flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-primary/60" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a conversation from the list to start replying.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
