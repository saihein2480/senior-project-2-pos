/**
 * `fetch` for the POS's own API routes, with the caller's Firebase ID token.
 *
 * Every /api route checks `Authorization: Bearer <idToken>` server-side (see
 * src/lib/server/apiAuth.ts), so browser code calls this instead of `fetch`.
 *
 * - Existing headers are kept; Content-Type is never set here, so FormData
 *   bodies still get their multipart boundary from the browser.
 * - Waits for Firebase Auth to restore the session first, so a request fired
 *   on page load does not go out unauthenticated by accident.
 * - With no signed-in user the request is still sent, just without the
 *   header (public routes such as GET /api/shops keep working).
 */

import { auth } from "@/lib/firebase";

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (auth && !headers.has("Authorization")) {
    try {
      await auth.authStateReady();
      const token = await auth.currentUser?.getIdToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch (error) {
      console.error("Could not get an ID token for the API call:", error);
    }
  }

  return fetch(input, { ...init, headers });
}
