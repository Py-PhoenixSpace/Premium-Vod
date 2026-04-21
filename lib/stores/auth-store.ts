import { create } from "zustand";
import type { UserProfile, UserSubscription } from "@/types";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  updateSubscription: (subscription: UserSubscription) => void;
  addPurchasedVideo: (videoId: string) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user, loading: false }),

  setLoading: (loading) => set({ loading }),

  setInitialized: (initialized) => set({ initialized }),

  updateSubscription: (subscription) =>
    set((state) => ({
      user: state.user ? { ...state.user, subscription } : null,
    })),

  addPurchasedVideo: (videoId) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            purchasedVideos: [...state.user.purchasedVideos, videoId],
          }
        : null,
    })),

  clearUser: () => set({ user: null, loading: false }),
}));
