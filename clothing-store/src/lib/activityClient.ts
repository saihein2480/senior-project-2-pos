/**
 * Report the few Activity-log events that only the browser sees: signing in,
 * signing out, and finishing a walk-in sale (the sale itself is written by
 * the browser). Everything else is logged by the server as it happens.
 *
 * The server attributes each event to the verified caller, so this sends no
 * identity of its own. It never throws and never waits long: the log must
 * not slow down or break a login, a logout or a receipt.
 */

import { authFetch } from "@/lib/authFetch";

export type ClientActivityEvent =
  | { action: "auth.signIn" }
  | { action: "auth.signOut" }
  | { action: "sale.complete"; transactionDocId: string };

export async function logActivity(
  event: ClientActivityEvent,
  timeoutMs = 4000,
): Promise<void> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    await authFetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      // Lets the sign-out report finish even as the page moves on.
      keepalive: true,
      signal: controller?.signal,
    });
  } catch {
    // Logging is best effort.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
