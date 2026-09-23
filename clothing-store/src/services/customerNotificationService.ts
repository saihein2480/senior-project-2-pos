/**
 * Browser-side entry point for sending customer notifications from the POS UI.
 *
 * Calls the POS API routes under `/api/notifications/*`, which hold the shared
 * secret and forward to the storefront app that owns email and the Telegram bot.
 * Nothing here needs — or is given — the secret.
 *
 * Every function is best-effort and never throws: the owner's promotion has
 * already been saved by the time we get here, so a failed announcement is worth
 * reporting but must not look like the save failed.
 */

import { auth } from "@/lib/firebase";

export interface BroadcastCounters {
  type: string;
  /** Customers we could reach on at least one channel. */
  audience: number;
  emailSent: number;
  emailFailed: number;
  telegramSent: number;
  telegramFailed: number;
  inAppCreated: number;
}

export interface NotifyResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Attach the caller's Firebase ID token so the route can check their role. */
async function authHeaders(): Promise<Record<string, string> | null> {
  const user = auth?.currentUser;
  if (!user) return null;

  try {
    const token = await user.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  } catch (error) {
    console.error("Could not get an ID token for the notification call:", error);
    return null;
  }
}

async function post<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<NotifyResult<T>> {
  const headers = await authHeaders();
  if (!headers) {
    return { ok: false, error: "You must be signed in to notify customers." };
  }

  try {
    const response = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json?.success === false) {
      return {
        ok: false,
        error: json?.error || `Request failed with status ${response.status}`,
      };
    }

    return { ok: true, data: json?.data as T };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to notify customers";
    console.error(`Customer notification request failed (${path}):`, message);
    return { ok: false, error: message };
  }
}

export interface PromotionAnnouncementInput {
  name: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  productName?: string;
  variantName?: string;
  startDate?: string;
  endDate?: string;
  maxDiscountTHB?: number;
  /** Absolute image URL; Telegram sends it as a photo when present. */
  image?: string;
  /** Storefront path for the call-to-action, e.g. "/product/abc123". */
  productPath?: string;
}

export interface CouponPackageAnnouncementInput {
  name: string;
  pointsRequired: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  validityDays: number;
}

export class CustomerNotificationService {
  /** Email + Telegram every opted-in customer about a newly published promotion. */
  static announcePromotion(
    promotion: PromotionAnnouncementInput,
  ): Promise<NotifyResult<BroadcastCounters>> {
    return post<BroadcastCounters>("/api/notifications/customer-campaign", {
      type: "promotion_created",
      promotion,
    });
  }

  /** Email + Telegram every opted-in customer about new loyalty reward tiers. */
  static announceCouponPackages(
    couponPackages: CouponPackageAnnouncementInput[],
    context: { pointsPerPurchase?: number; minimumSpendAmount?: number } = {},
  ): Promise<NotifyResult<BroadcastCounters>> {
    return post<BroadcastCounters>("/api/notifications/customer-campaign", {
      type: "coupon_packages_published",
      couponPackages,
      pointsPerPurchase: context.pointsPerPurchase,
      minimumSpendAmount: context.minimumSpendAmount,
    });
  }

  /** Notify one customer about their own order/refund event. */
  static notifyOrderEvent(payload: {
    customerId: string;
    type: string;
    order: {
      orderRef: string;
      totalAmount: number;
      paymentMethod?: string;
      paymentStatus?: string;
      items?: { name: string; quantity: number }[];
      trackingNumber?: string;
    };
    reason?: string;
    refundAmount?: number;
    refundMethod?: string;
  }): Promise<NotifyResult<unknown>> {
    return post("/api/notifications/customer-event", payload);
  }
}

/**
 * One-line summary of a broadcast, for a toast.
 *
 * e.g. "Announced to 42 customers (38 emails, 12 Telegram)".
 */
export function summariseBroadcast(counters: BroadcastCounters): string {
  if (counters.audience === 0) {
    return "No customers were reachable, so no announcement was sent.";
  }

  const parts: string[] = [];
  if (counters.emailSent) parts.push(`${counters.emailSent} email`);
  if (counters.telegramSent) parts.push(`${counters.telegramSent} Telegram`);

  const failed = counters.emailFailed + counters.telegramFailed;
  const failureNote = failed ? `, ${failed} failed` : "";

  if (parts.length === 0) {
    return `No messages could be delivered to ${counters.audience} customer${
      counters.audience === 1 ? "" : "s"
    }${failureNote}.`;
  }

  return `Announced to ${counters.audience} customer${
    counters.audience === 1 ? "" : "s"
  } (${parts.join(", ")}${failureNote}).`;
}
