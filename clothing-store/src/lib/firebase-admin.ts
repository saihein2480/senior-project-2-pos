import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { UserRole } from "@/types/auth";

// Initialize Firebase Admin SDK
const apps = getApps();
let adminApp: App | undefined;

if (!apps.length) {
  try {
    // Check if running in server environment
    if (typeof window === "undefined") {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      if (serviceAccount) {
        adminApp = initializeApp({
          credential: cert(JSON.parse(serviceAccount)),
        });
      } else {
        console.warn(
          "Firebase Admin SDK: Service account key not found. User deletion from Auth will not work."
        );
      }
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
  }
} else {
  adminApp = apps[0];
}

export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const isAdminInitialized = !!adminApp;

/**
 * Admin Firestore handle.
 *
 * Needed where a route must read a document the caller itself is not allowed to
 * read — checking somebody's role in `users/{uid}` is the main case, since
 * firestore.rules only lets a user read their own record.
 */
export const adminDb = adminApp ? getFirestore(adminApp) : null;

/**
 * Resolve the caller's uid from an `Authorization: Bearer <idToken>` header.
 * Returns null when the header is missing or the token cannot be trusted.
 */
export async function getUidFromAuthHeader(
  authorizationHeader: string | null,
): Promise<string | null> {
  if (!adminAuth || !authorizationHeader) return null;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch (error) {
    console.error("Failed to verify ID token:", error);
    return null;
  }
}

export type AuthorisedCaller = { uid: string; role: UserRole };

export type AuthorisationFailure = { status: number; error: string };

/**
 * Verify the caller holds one of `allowedRoles`.
 *
 * The POS enforces its permission matrix in React, which is fine for shaping
 * the UI but is not a security boundary (see the note at the top of
 * firestore.rules). Routes that can reach customers directly — sending mail,
 * messaging Telegram — do the check server-side instead of trusting the client.
 */
export async function authoriseRole(
  request: Request,
  allowedRoles: UserRole[],
): Promise<AuthorisedCaller | AuthorisationFailure> {
  if (!adminAuth || !adminDb) {
    return {
      status: 503,
      error:
        "Server auth is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY to enable this endpoint.",
    };
  }

  const uid = await getUidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) {
    return { status: 401, error: "Not authenticated" };
  }

  try {
    const snapshot = await adminDb.collection("users").doc(uid).get();
    const role = snapshot.exists
      ? ((snapshot.data()?.role as UserRole) ?? null)
      : null;

    if (!role || !allowedRoles.includes(role)) {
      return {
        status: 403,
        error: "You do not have permission to perform this action",
      };
    }

    return { uid, role };
  } catch (error) {
    console.error("Failed to resolve caller role:", error);
    return { status: 500, error: "Failed to verify permissions" };
  }
}

export function isAuthorisationFailure(
  result: AuthorisedCaller | AuthorisationFailure,
): result is AuthorisationFailure {
  return (result as AuthorisationFailure).error !== undefined;
}
