import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.warn(
      "⚠️ FIREBASE_SERVICE_ACCOUNT_KEY not set. Server-side Firebase features will be unavailable."
    );
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    // Validate required fields
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
      console.warn(
        "⚠️ FIREBASE_SERVICE_ACCOUNT_KEY is incomplete. Download the full key from Firebase Console → Project Settings → Service Accounts."
      );
      return null;
    }
    return parsed as ServiceAccount;
  } catch {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON.");
    return null;
  }
}

let adminApp: ReturnType<typeof initializeApp> | null = null;

function getAdminApp() {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    // Return a dummy app for build-time — routes will fail gracefully at runtime
    return null;
  }

  adminApp = initializeApp({ credential: cert(serviceAccount) });
  return adminApp;
}

/** Firebase Admin Auth — used for verifying ID tokens in API routes & proxy */
export const adminAuth = (() => {
  const app = getAdminApp();
  if (!app) {
    // Return a proxy that throws helpful errors when used without configuration
    return new Proxy({} as ReturnType<typeof getAuth>, {
      get(_, prop) {
        return () => {
          throw new Error(
            `Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local to use ${String(prop)}().`
          );
        };
      },
    });
  }
  return getAuth(app);
})();

/** Firebase Admin Firestore — server-side database access */
export const adminDb = (() => {
  const app = getAdminApp();
  if (!app) {
    return new Proxy({} as ReturnType<typeof getFirestore>, {
      get(_, prop) {
        return () => {
          throw new Error(
            `Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local to use ${String(prop)}().`
          );
        };
      },
    });
  }
  return getFirestore(app);
})();