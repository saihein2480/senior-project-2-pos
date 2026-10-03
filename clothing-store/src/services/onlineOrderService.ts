import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { postOrderApi } from "@/services/transactionService";
import type {
  BulkResult,
  OnlineOrderActionResult,
} from "@/server/orders/types";

export interface OnlineOrder {
  id: string;
  orderId: string;
  total?: number;
  amountMmk: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  provider?: string;
  paymentProvider?: string;
  transactionId?: string; // Link to transaction document
  // Financial breakdown
  subtotal?: number;
  tax?: number;
  taxRate?: number; // Percentage applied at checkout (e.g. 7 for 7%)
  discount?: number;
  /** Flat THB delivery fee from POS Settings, included in `total`. */
  deliveryFee?: number;
  exchangeRate?: number; // THB -> MMK rate used at checkout
  // Coupon fields
  couponCode?: string;
  appliedCouponCode?: string;
  couponId?: string;
  couponDiscountTHB?: number;
  /**
   * Promotions that reduced this order, named.
   *
   * Recorded with the order because promotion documents are edited and
   * deactivated over time, so they cannot be looked up afterwards to explain an
   * old invoice. Absent on orders placed before this was captured.
   */
  appliedPromotions?: Array<{
    promotionId?: string;
    name?: string;
    discountType?: string;
    discountValue?: number;
    discountTHB?: number;
  }>;
  customer?: {
    uid?: string;
    email?: string;
    displayName?: string;
    phone?: string;
    phoneNumber?: string;
    address?: string | Record<string, unknown>;
    shippingAddress?: string | Record<string, unknown>;
  };
  address?: string | Record<string, unknown>;
  shippingAddress?: string | Record<string, unknown>;
  product?: {
    productId?: string;
    productName?: string;
    variantId?: string;
    color?: string;
    size?: string;
    quantity?: number;
    priceTHB?: number;
    originalPriceTHB?: number;
    lineDiscountTHB?: number;
    promotionId?: string;
    promotionName?: string;
  };
  cartItems?: Array<{
    productId?: string;
    productName?: string;
    variantId?: string;
    color?: string;
    size?: string;
    image?: string;
    /** Unit price actually charged, after the winning promotion. */
    priceTHB?: number;
    /** Catalogue unit price before any promotion. */
    originalPriceTHB?: number;
    /** What this line saved. */
    lineDiscountTHB?: number;
    promotionId?: string;
    /** Name of the promotion that won for this line. */
    promotionName?: string;
    quantity?: number;
  }>;
  items?: Array<{
    name: string;
    amount: number;
    quantity: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
  stockDeductedAt?: string;
  stockRestoredAt?: string;
}

export interface OnlineTransaction {
  id: string;
  transactionId: string;
  onlineOrderId?: string;
  source?: string;
  total?: number;
  sellingTotal?: number;
  sellingCurrency?: string;
  paymentProvider?: string;
  paymentMethod?: string;
  status?: string;
  paymentStatus?: string; // Added to match actual data structure
  timestamp?: string;
  exchangeRate?: number;
  customer?: {
    uid?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
    customerType?: string;
  };
  items?: Array<{
    productId?: string;
    stockId?: string;
    groupName?: string;
    selectedColor?: string;
    selectedSize?: string;
    colorCode?: string;
    unitPrice?: number;
    originalPrice?: number;
    quantity?: number;
  }>;
  /**
   * Money breakdown stored at purchase time. These were already being written
   * by the storefront (see api/transactions/create-cod and api/mmpay/webhook)
   * but were missing from this interface, so readers had to cast to `any`.
   */
  subtotal?: number;
  discount?: number;
  tax?: number;
  /** Percentage applied at purchase time, e.g. 7 for 7%. */
  taxRate?: number;
  /** Flat THB delivery fee charged with a storefront order. */
  deliveryFee?: number;
  amountPaid?: number;
  amountMmk?: number;
  couponCode?: string;
  appliedCouponCode?: string;
  couponDiscountTHB?: number;
  branchName?: string;
}

export type { OnlineOrderActionResult } from "@/server/orders/types";

/** Statuses the online-orders page offers. */
export type OnlineOrderStatusValue =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "fully_returned"
  | "partially_returned";

const ONLINE_STATUSES: readonly string[] = [
  "pending",
  "packaging",
  "delivering",
  "delivered",
  "cancelled",
  "fully_returned",
  "partially_returned",
];

function normalizeDate(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (
    typeof input === "object" &&
    input !== null &&
    "toDate" in (input as Record<string, unknown>)
  ) {
    try {
      return (input as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

function toStatusValue(status: string): OnlineOrderStatusValue {
  const value = (status || "").trim().toLowerCase();
  if (value === "canceled") return "cancelled";
  if (!ONLINE_STATUSES.includes(value)) {
    throw new Error(`Unsupported order status "${status}".`);
  }
  return value as OnlineOrderStatusValue;
}

class OnlineOrderService {
  async getOnlineOrders(): Promise<OnlineOrder[]> {
    if (!db) return [];

    const q = query(
      collection(db, "onlineOrders"),
      orderBy("updatedAt", "desc"),
    );
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data = d.data() as Omit<OnlineOrder, "id">;
      return {
        id: d.id,
        ...data,
        createdAt: normalizeDate(data.createdAt),
        updatedAt: normalizeDate(data.updatedAt),
      };
    });
  }

  async getOnlineTransactions(): Promise<OnlineTransaction[]> {
    if (!db) return [];

    const q = query(
      collection(db, "transactions"),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<OnlineTransaction, "id">),
      }))
      .filter((tx) => tx.source === "online" || tx.paymentProvider === "MMPAY")
      .map((tx) => ({ ...tx, timestamp: normalizeDate(tx.timestamp || "") }));
  }

  /**
   * Change one online order's status (server action; POST
   * /api/online-orders/[id]/actions { action: "setStatus" }).
   *
   * Guarded like the transactions page: forward only (pending -> packaging ->
   * delivering -> delivered), returned statuses only after delivery, nothing
   * on a cancelled order, payment-failed orders can only be cancelled.
   * "cancelled" runs the full cancel path on the linked transaction (stock
   * back through the returns ledger, pending cancellation refund when paid),
   * all in one Firestore transaction. Re-saving the current status is a
   * no-op. Throws with the server's message when refused.
   *
   * The customer's email/Telegram message is queued and sent by the server
   * (notificationOutbox), so nothing is left for the browser to do.
   */
  async updateOnlineOrderStatus(orderId: string, status: string): Promise<void> {
    if (!orderId || !status) return;
    await postOrderApi<OnlineOrderActionResult>(
      `/api/online-orders/${encodeURIComponent(orderId)}/actions`,
      { action: "setStatus", status: toStatusValue(status) },
    );
  }

  /**
   * Bulk status change (POST /api/online-orders/bulk-status): one Firestore
   * transaction per order. Orders that were updated are kept even when
   * others are refused; if any were refused this throws an Error listing
   * them. Customers of the orders that moved are notified by the server.
   */
  async updateOnlineOrderStatuses(orderIds: string[], status: string): Promise<void> {
    if (!orderIds.length || !status) return;
    const result = await postOrderApi<BulkResult<OnlineOrderActionResult>>(
      "/api/online-orders/bulk-status",
      { ids: orderIds, status: toStatusValue(status) },
    );

    const failed = result.results.filter((r) => !r.ok);
    if (failed.length > 0) {
      const details = failed
        .slice(0, 5)
        .map((r) => (r.ok ? "" : `${r.id}: ${r.error}`))
        .join("\n");
      throw new Error(
        `${failed.length} of ${result.results.length} order(s) were not updated:\n${details}${failed.length > 5 ? "\n..." : ""}`,
      );
    }
  }

  /**
   * Mark a cash-on-delivery order paid ("SUCCESS") or unpaid ("PENDING"),
   * with its transaction (status completed/pending + paymentStatus), in one
   * Firestore transaction. Refused for non-COD, cancelled or refunded
   * orders, and "PENDING" once refunds exist.
   */
  async updateOnlineOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<void> {
    const value = (paymentStatus || "").trim().toUpperCase();
    if (value !== "SUCCESS" && value !== "PENDING") {
      throw new Error(`Unsupported payment status "${paymentStatus}".`);
    }
    await postOrderApi<OnlineOrderActionResult>(
      `/api/online-orders/${encodeURIComponent(orderId)}/actions`,
      { action: "setPaymentStatus", paymentStatus: value },
    );
  }
}

export const onlineOrderService = new OnlineOrderService();
