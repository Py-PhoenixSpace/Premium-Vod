# PremiumVOD — Premium Video Content Platform

PremiumVOD is a high-end, premium Video-on-Demand (VOD) platform tailored for content creators. Built with a stunning "Midnight Violet & Gold" aesthetic, the platform securely delivers 4K cinematic premium video content, manages automated subscriptions, and features a comprehensive role-based access system.

## 🚀 Features

- **Premium VOD Streaming:** Next-generation, buffer-free HLS streaming powered by Cloudinary and video.js.
- **Role-Based Access Control:** Highly secure `User`, `Admin`, and `Super-Admin` roles enforced at the Edge (`proxy.ts`), API, and UI layers via Firebase Admin.
- **Dynamic Monetization:** 
  - Dual Gateway Support: **Stripe** (International / USD) and **Razorpay** (India / INR).
  - Single-purchase unlocks or site-wide recurring premium subscriptions.
- **Super-Admin Governance:** Dedicated dashboard for platform-wide analytics, holistic storage pool monitoring, and user role management.
- **Responsive "Glassmorphic" UI:** Built with Tailwind CSS and Framer Motion, utilizing mesh backgrounds, gradient borders, and sleek, glass-like cards.

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + custom glassmorphic utility rules
- **Auth & Database:** Firebase Auth + Firestore
- **Backend Admin:** Firebase Admin SDK
- **Video Infrastructure:** Cloudinary
- **Payments:** Stripe & Razorpay

## 📦 Getting Started

### 1. Requirements
- Node.js 18+
- [Firebase account](https://firebase.google.com/) (Web app + Service Account)
- [Cloudinary account](https://cloudinary.com/)
- [Stripe](https://stripe.com/) and [Razorpay](https://razorpay.com/) accounts

### 2. Environment Variables
Create a `.env.local` file at the root of the project with the following structure:

```env
# Next.js Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."

# Firebase Admin
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'

# Cloudinary Storage
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_CLOUD_NAME_1="..."
CLOUDINARY_API_KEY_1="..."
CLOUDINARY_API_SECRET_1="..."

# Payment Gateways
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID="price_..." # Ensure this is a PRICE ID, not a Product ID

NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_..."
RAZORPAY_KEY_SECRET="..."
```

### 3. Installation
```bash
npm install
# or
yarn install
```

### 4. Run Locally
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application. 

## 🛡️ Super-Admin Initialization
To access the Super-Admin panel after creating your first account, you must manually grant yourself permissions through Firestore:
1. Open your Firebase Console.
2. Navigate to **Firestore Database** -> `users` collection.
3. Find your document using your UID.
4. Add or update the `role` field (string) with the value: `"super-admin"`.

## 🚢 Deployment Guidelines

### Preparing for Vercel
1. Sync all `env` variables into the Vercel Dashboard.
2. Change `NEXT_PUBLIC_APP_URL` to your live Vercel domain.
3. Ensure Razorpay keys are moved out of "Test Mode" to live keys.
4. Register your Stripe webhook (`/api/stripe/webhook`) in the Stripe Dashboard to generate the live `STRIPE_WEBHOOK_SECRET` and update Vercel.

*Note: The platform is configured to safely bypass `any` typescript linting errors originating from generic payment gateway webhooks during the Vercel build step to ensure reliable CI/CD delivery.*
