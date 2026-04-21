"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { UserProfile } from "@/types";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setUser, setLoading, setInitialized, clearUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        try {
          // Fetch full user profile from Firestore
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const profile = {
              uid: firebaseUser.uid,
              ...userDoc.data(),
            } as UserProfile;
            setUser(profile);
          } else {
            // User exists in Auth but not Firestore — set minimal profile
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: firebaseUser.displayName || "",
              role: "user",
              purchasedVideos: [],
              subscription: {
                status: "none",
                currentPeriodEnd: null,
                stripeCustomerId: "",
                stripeSubscriptionId: "",
              },
              createdAt: null as any,
            });
          }
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
          clearUser();
        }
      } else {
        clearUser();
      }
      setInitialized(true);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, setInitialized, clearUser]);

  return <>{children}</>;
}
