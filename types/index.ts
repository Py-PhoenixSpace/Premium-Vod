import { Timestamp } from "firebase/firestore";

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "super-admin";

export type SubscriptionStatus = "active" | "canceling" | "past_due" | "canceled" | "none";

export type VideoCategory =
  | "featured"
  | "educational"
  | "entertainment"
  | "tutorial"
  | "exclusive";

export type VideoStatus = "processing" | "published" | "archived";

export type MediaType = "video" | "image";

export type PaymentGateway = "razorpay" | "stripe";

export type TransactionType = "single_purchase" | "subscription_cycle";

export type TransactionStatus = "pending" | "success" | "failed" | "refunded";

// ─── Firestore Document Types ─────────────────────────────────────────────────

export interface UserSubscription {
  status: SubscriptionStatus;
  currentPeriodEnd: Timestamp | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  // Razorpay-specific
  razorpaySubscriptionId?: string;
  razorpayPaymentId?: string;
  // Common
  gateway?: "stripe" | "razorpay";
  canceledAt?: Timestamp | Date | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  purchasedVideos: string[];
  watchHistory?: WatchHistoryEntry[];
  subscription: UserSubscription;
  createdAt: Timestamp;
}

export interface WatchHistoryEntry {
  videoId: string;
  lastTimestamp: number; // seconds
  isCompleted: boolean;
  updatedAt: Timestamp;
}

export interface VideoSegment {
  index: number;
  publicId: string;
  duration: number;        // seconds
  storageBucket: string;
}

export interface Video {
  videoId: string;
  title: string;
  description: string;
  category: VideoCategory;
  mediaType?: MediaType; // defaults to "video" for legacy docs
  priceINR: number; // 0 = free preview
  priceUSD: number;
  isPremium: boolean;
  cloudinaryPublicId: string;
  secureUrl?: string;
  thumbnailUrl: string;
  durationInSeconds: number;
  status: VideoStatus;
  storageBucket?: string; // which Cloudinary bucket stores this video
  // Segmented video fields (present only when isSegmented === true)
  isSegmented?: boolean;
  segments?: VideoSegment[];
  totalDuration?: number;  // sum of all segment durations
  createdAt: Timestamp;
}

export interface Transaction {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  type: TransactionType;
  status: TransactionStatus;
  createdAt: Timestamp;
}

export interface PlatformStats {
  totalRevenueINR: number;
  totalRevenueUSD: number;
  activePremiumSubscribers: number;
  totalRegisteredUsers: number;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface StreamResponse {
  url: string;
  expiresAt: number;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  videoId: string;
}

export interface StripeCheckoutResponse {
  sessionUrl: string;
}

// ─── Support Chat Types ───────────────────────────────────────────────────────

export type ChatSender = "user" | "admin";

export interface ChatMessage {
  id: string;
  text: string;
  senderId: ChatSender;
  senderName: string;
  createdAt: Timestamp;
}

export interface SupportChat {
  userId: string;
  userName: string;
  userEmail: string;
  unreadByAdmin: boolean;
  lastMessageAt: Timestamp | null;
  lastMessageText: string;
}
