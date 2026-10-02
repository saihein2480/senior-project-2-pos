/**
 * Typed access to the Admin SDK handles for server-only data modules.
 *
 * `adminDb` / `adminAuth` are null when FIREBASE_SERVICE_ACCOUNT_KEY is not
 * set. Throwing a 503 ApiError here lets every route report that cleanly
 * instead of crashing on a null dereference.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { ApiError } from "./errors";

const NOT_CONFIGURED =
  "Server database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY.";

export function getAdminDb(): Firestore {
  if (!adminDb) throw new ApiError(503, NOT_CONFIGURED);
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) throw new ApiError(503, NOT_CONFIGURED);
  return adminAuth;
}
