import { create } from "zustand";

interface UIState {
  isPremiumModalOpen: boolean;
  openPremiumModal: () => void;
  closePremiumModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPremiumModalOpen: false,
  openPremiumModal: () => set({ isPremiumModalOpen: true }),
  closePremiumModal: () => set({ isPremiumModalOpen: false }),
}));
