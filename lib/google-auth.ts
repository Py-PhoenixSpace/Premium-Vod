import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";

const REDIRECT_FALLBACK_ERROR_CODES = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

export type GoogleSignInOutcome =
  | { kind: "popup"; credential: UserCredential }
  | { kind: "redirect" };

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGooglePopupOrRedirect(
  auth: Auth
): Promise<GoogleSignInOutcome> {
  const provider = createGoogleProvider();

  try {
    const credential = await signInWithPopup(auth, provider);
    return { kind: "popup", credential };
  } catch (error: any) {
    if (REDIRECT_FALLBACK_ERROR_CODES.has(error?.code)) {
      await signInWithRedirect(auth, provider);
      return { kind: "redirect" };
    }
    throw error;
  }
}
