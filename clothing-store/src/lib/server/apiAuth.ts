/**
 * Server-side authorisation for POS API routes.
 *
 * Every route that reads or writes business data calls `requireRole` first:
 *
 *   const auth = await requireRole(request, OWNER_ONLY);
 *   if ("response" in auth) return auth.response;
 *   // auth.caller.uid / auth.caller.role are now trusted
 *
 * The caller proves who they are with `Authorization: Bearer <Firebase ID
 * token>` (see src/lib/authFetch.ts); their role is read from users/{uid}
 * with the Admin SDK, so nothing the browser sends about its own role counts.
 */

import { NextResponse } from "next/server";
import {
  adminDb,
  authoriseRole,
  isAuthorisationFailure,
  type AuthorisedCaller,
} from "@/lib/firebase-admin";
import type { UserRole } from "@/types/auth";
import { isApiError } from "@/server/errors";

export type RequireRoleResult =
  | { caller: AuthorisedCaller }
  | { response: NextResponse };

/** `{ success: false, error }` with the given status. */
export function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/**
 * Verify the caller's ID token and that their role is one of `roles`.
 *
 * Fails with 503 when the Admin SDK is not configured, 401 without a valid
 * token, 403 for a wrong role or a deactivated account.
 */
export async function requireRole(
  request: Request,
  roles: UserRole[],
): Promise<RequireRoleResult> {
  const result = await authoriseRole(request, roles);
  if (isAuthorisationFailure(result)) {
    return { response: jsonError(result.status, result.error) };
  }
  return { caller: result };
}

/**
 * For public handlers (no token needed) that still read through the Admin
 * SDK: a 503 response when it is not configured, otherwise null.
 */
export function requireAdminConfigured(): NextResponse | null {
  if (adminDb) return null;
  return jsonError(
    503,
    "Server database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY.",
  );
}

/**
 * Turn an error thrown by a handler into a response.
 *
 * `ApiError`s carry a message meant for the caller and keep their status.
 * Anything else is logged in full and answered with `fallbackMessage`, so
 * internal details (Firestore paths, SDK messages) never reach the client.
 */
export function handleRouteError(
  error: unknown,
  context: string,
  fallbackMessage: string,
): NextResponse {
  if (isApiError(error)) {
    if (error.status >= 500) console.error(`Error in ${context}:`, error);
    return jsonError(error.status, error.message);
  }
  console.error(`Error in ${context}:`, error);
  return jsonError(500, fallbackMessage);
}
