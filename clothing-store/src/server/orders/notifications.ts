/**
 * In-app notification documents written by the order actions.
 *
 * Same `type`s and fields as the browser code wrote before (transactionService
 * and the refunds page), so the Sidebar/TopNavBar badges, the owner
 * notifications page and the storefront account page keep showing them.
 * They are created inside the action's transaction.
 */

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import type { CustomerEventPayload } from "@/server/notificationOutbox";
import { stripUndefined } from "@/server/serialize";

const REFUND_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
};

function methodLabel(method: string): string {
  return REFUND_METHOD_LABEL[method] || "Original Payment Method";
}

function receiptOf(txn: DocumentData, docId: string): string {
  return (typeof txn.transactionId === "string" && txn.transactionId) || docId;
}

function withOptionalOrderFields(
  base: Record<string, unknown>,
  txn: DocumentData,
  branchId: unknown,
): Record<string, unknown> {
  if (txn.onlineOrderId) base.onlineOrderId = txn.onlineOrderId;
  if (branchId) base.branchId = branchId;
  return base;
}

/** Owner-facing "Refund Payment Pending" (no userId: POS staff only). */
export function ownerRefundPaymentNotification(
  txn: DocumentData,
  docId: string,
  cancelled: boolean,
): Record<string, unknown> {
  const receipt = receiptOf(txn, docId);
  return {
    type: "refund_payment",
    title: "Refund Payment Pending",
    message: cancelled
      ? `Refund payment pending for cancelled order #${receipt}`
      : `Refund payment pending for order #${receipt}`,
    link: "/owner/requests/pending-refunds",
    metadata: { transactionId: docId, orderId: receipt },
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Customer "refund_completed", as confirmRefundPayment / confirmCancellationRefund wrote it. */
export function customerRefundCompletedNotification(params: {
  txn: DocumentData;
  docId: string;
  amount: number;
  refundMethod: string;
  notes?: string;
  full: boolean;
  cancellation: boolean;
}): Record<string, unknown> | null {
  const { txn, docId, amount, refundMethod, notes, full, cancellation } = params;
  const uid = txn.customer?.uid;
  if (!uid) return null;
  const receipt = receiptOf(txn, docId);
  const statusLabel = full ? "Full Refund" : "Partial Refund";
  const currency = txn.sellingCurrency || "THB";
  const noteText = notes ? `\n\nNote: ${notes}` : "";
  return withOptionalOrderFields(
    {
      userId: uid,
      type: "refund_completed",
      title: cancellation ? `Cancellation ${statusLabel} Completed` : `${statusLabel} Completed`,
      message: `Your ${cancellation ? "cancellation refund" : "refund"} for order ${receipt} has been processed.\n\nAmount: ${Number(amount).toFixed(2)} ${currency}\nMethod: ${methodLabel(refundMethod)}${noteText}`,
      orderId: receipt,
      transactionId: docId,
      amount,
      refundMethod,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
    txn,
    txn.branchId,
  );
}

/** Customer "refund_rejected" after an inspection found every item damaged. */
export function customerRefundRejectedNotification(
  txn: DocumentData,
  docId: string,
): Record<string, unknown> | null {
  const uid = txn.customer?.uid;
  if (!uid) return null;
  return withOptionalOrderFields(
    {
      userId: uid,
      type: "refund_rejected",
      title: "Refund Rejected",
      message: `Sorry, your return for order ${txn.transactionId} cannot be refunded. All returned items were damaged and not in resellable condition.`,
      orderId: txn.transactionId,
      transactionId: docId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
    txn,
    txn.shopId,
  );
}

/** Customer "partial_refund_with_damaged_items" when some returned items were damaged. */
export function customerPartialDamagedNotification(
  txn: DocumentData,
  docId: string,
  acceptedCount: number,
  damagedCount: number,
): Record<string, unknown> | null {
  const uid = txn.customer?.uid;
  if (!uid) return null;
  return withOptionalOrderFields(
    {
      userId: uid,
      type: "partial_refund_with_damaged_items",
      title: "Partial Refund",
      message: `Your return for order ${txn.transactionId}:\n\n✅ ${acceptedCount} item(s) accepted - Refund approved\n❌ ${damagedCount} item(s) damaged - No refund\n\nOnly accepted items will be refunded.`,
      orderId: txn.transactionId,
      transactionId: docId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
    txn,
    txn.shopId,
  );
}

// ---------------------------------------------------------------------------
// Customer email/Telegram messages (queued in notificationOutbox)
// ---------------------------------------------------------------------------

/** deliveryStatus target -> storefront event type (pending stays silent). */
export const DELIVERY_EVENT: Record<string, string> = {
  confirmed: "order_packaging",
  shipped: "order_shipped",
  delivered: "order_delivered",
};

export interface CustomerEventExtra {
  reason?: string;
  refundAmount?: number;
  refundMethod?: string;
  /** "paid" | "pending": the storefront's cancellation text depends on it. */
  paymentStatus?: string;
  /** True when the storefront bell already shows this event. */
  skipInApp?: boolean;
}

/**
 * A message about this transaction for its customer, in the shape the
 * storefront's /api/notifications/dispatch accepts. Null without a customer.
 */
export function customerEventFromTransaction(
  txn: DocumentData,
  docId: string,
  type: string,
  extra: CustomerEventExtra = {},
): CustomerEventPayload | null {
  const uid =
    (typeof txn.customer?.uid === "string" && txn.customer.uid.trim()) ||
    (typeof txn.customerUid === "string" && txn.customerUid.trim()) ||
    "";
  if (!uid || uid.includes("/") || uid.length > 128) return null;

  const orderRef =
    (typeof txn.onlineOrderId === "string" && txn.onlineOrderId.trim()) || receiptOf(txn, docId);
  const items = (Array.isArray(txn.items) ? txn.items : [])
    .map((item: DocumentData) => ({
      name: String(item?.groupName ?? item?.name ?? "").trim(),
      quantity: Number(item?.quantity ?? 0) || 0,
    }))
    .filter((item: { name: string }) => item.name)
    .slice(0, 40);
  const refundAmount = Number(extra.refundAmount);

  return stripUndefined({
    customerId: uid,
    type,
    order: {
      orderRef,
      totalAmount: Math.max(0, Number(txn.total) || 0),
      paymentMethod: String(txn.paymentMethod || txn.paymentProvider || ""),
      paymentStatus: extra.paymentStatus,
      items,
    },
    reason: extra.reason ? extra.reason.slice(0, 300) : undefined,
    refundAmount: Number.isFinite(refundAmount) && refundAmount > 0 ? refundAmount : undefined,
    refundMethod: extra.refundMethod ? methodLabel(extra.refundMethod) : undefined,
    skipInApp: extra.skipInApp ? true : undefined,
  });
}
