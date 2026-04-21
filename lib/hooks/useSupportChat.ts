"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  orderBy,
  query,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ChatMessage } from "@/types";

interface UseSupportChatOptions {
  userId: string;
  userName: string;
  userEmail: string;
  senderId: "user" | "admin";
  senderName: string;
}

export function useSupportChat({
  userId,
  userName,
  userEmail,
  senderId,
  senderName,
}: UseSupportChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener on the messages subcollection
  useEffect(() => {
    if (!userId) return;

    const messagesRef = collection(db, "supportChats", userId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChatMessage, "id">),
      }));
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !userId) return;

      const trimmed = text.trim();

      // Sanitize: Firestore rejects `undefined` values
      const safeUserName = userName ?? "";
      const safeUserEmail = userEmail ?? "";
      const safeSenderName = senderName ?? "Support";

      // Upsert the parent conversation metadata doc
      const chatDocRef = doc(db, "supportChats", userId);
      await setDoc(
        chatDocRef,
        {
          userId,
          userName: safeUserName,
          userEmail: safeUserEmail,
          unreadByAdmin: senderId === "user",
          lastMessageAt: serverTimestamp(),
          lastMessageText: trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed,
        },
        { merge: true }
      );

      // Add the message to the subcollection
      const messagesRef = collection(db, "supportChats", userId, "messages");
      await addDoc(messagesRef, {
        text: trimmed,
        senderId,
        senderName: safeSenderName,
        createdAt: serverTimestamp(),
      });
    },
    [userId, userName, userEmail, senderId, senderName]
  );

  return { messages, loading, sendMessage };
}
