/**
 * Server-side client for the storefront's customer notification service.
 *
 * Customer email (nodemailer/Gmail) and the Telegram bot both live in the
 * `pos-clothing-store-web` app, which owns the customer relationship. Rather
 * than duplicating an SMTP transport and a second bot token in the POS app,
 * the POS posts events to that app over HTTP — the mirror image of the
 * storefront reading POS settings through `NEXT_PUBLIC_SETTINGS_API_URL`.
 *
 * Server-only: `NOTIFY_API_SECRET` must never reach the browser, so this module
 * must only be imported from API routes.
 */

/** Base URL of the storefront app that owns email + Telegram delivery. */
function notifyBaseUrl(): string {
  return (
    process.env.CUSTOMER_NOTIFY_BASE_URL ||
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
}

export const isCustomerNotifyConfigured = !!process.env.NOTIFY_API_SECRET;

export interface NotifyOutcome<T = unknown> {
  /** True when the storefront accepted and processed the event. */
  ok: boolean;
  result?: T;
  error?: string;
}

/**
 * POST one payload to the storefront notification service.
 *
 * Never throws. A notification is always secondary to the action that triggered
 * it, so a storefront that is down or misconfigured must not fail the owner's
 * save.
 */
async function postNotify<T>(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<NotifyOutcome<T>> {
  const secret = process.env.NOTIFY_API_SECRET;
  if (!secret) {
    return {
      ok: false,
      error:
        "NOTIFY_API_SECRET is not set, so customer notifications are disabled. " +
        "Add the same value to both apps' .env.local to enable them.",
    };
  }

  const url = `${notifyBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notify-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error:
          data?.error || `Notification service returned ${response.status}`,
      };
    }

    return { ok: true, result: data?.result as T };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Notification service timed out"
        : error instanceof Error
          ? error.message
          : "Failed to reach the notification service";

    // A common one in development: the storefront app is simply not running.
    console.error(`Customer notification failed (${url}):`, message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export interface BroadcastCounters {
  type: string;
  audience: number;
  emailSent: number;
  emailFailed: number;
  telegramSent: number;
  telegramFailed: number;
  inAppCreated: number;
}

export interface DispatchCounters {
  customerId: string;
  type: string;
  email: boolean | null;
  telegram: boolean | null;
  inApp: boolean | null;
  skipped?: Record<string, string>;
}

/** Announce something to every opted-in customer (promotion, loyalty rewards). */
export function broadcastToCustomers(
  payload: Record<string, unknown>,
): Promise<NotifyOutcome<BroadcastCounters>> {
  // Broadcasts are paced to respect Gmail and Telegram rate limits, so allow
  // several minutes before giving up on the response.
  return postNotify<BroadcastCounters>(
    "/api/notifications/broadcast",
    payload,
    280_000,
  );
}

/** Notify one customer about their own order, refund or coupon. */
export function notifyCustomer(
  payload: Record<string, unknown> & { customerId: string },
): Promise<NotifyOutcome<DispatchCounters>> {
  return postNotify<DispatchCounters>(
    "/api/notifications/dispatch",
    payload,
    30_000,
  );
}
