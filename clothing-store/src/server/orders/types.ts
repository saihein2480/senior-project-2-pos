/**
 * Inputs and results of the order server actions.
 *
 * The API routes validate request bodies with zod into these shapes; the
 * server actions trust nothing else from the browser (no actor names, no
 * transaction snapshot: every action reads the documents fresh).
 */

import type { OnlineStatusTarget, ReturnStatus } from "@/lib/orderState";
import type { CustomerEventPayload } from "@/server/notificationOutbox";

export type RefundMethod = "cash" | "original_payment" | "bank_transfer";
export type DeliveryStatusInput = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type InspectionResult = "accepted" | "damaged";

export type TransactionActionInput =
  | {
      action: "processRefund";
      items: Array<{ lineIndex: number; quantity: number }>;
      reason?: string;
      refundMethod?: RefundMethod;
      /** Per line: accepted units go back on the shelf, damaged ones are written off. */
      inspectionResults?: Array<{ lineIndex: number; result: InspectionResult }>;
      /** Legacy hint: "refunded" -> orderStatus fully_returned, "partially_refunded" -> partially_returned. */
      returnStatus?: "refunded" | "partially_refunded";
      /** Also mark a pending refundRequest as approved (same transaction). */
      approveRefundRequest?: boolean;
    }
  | { action: "confirmReturnStatus"; returnStatus: ReturnStatus }
  | {
      action: "confirmRefundPayment";
      refundId: string;
      refundMethod: RefundMethod;
      notes?: string;
      proofUrl?: string;
    }
  | { action: "cancel"; reason?: string; refundMethod?: RefundMethod }
  | {
      action: "confirmCancellationRefund";
      refundMethod: RefundMethod;
      notes?: string;
      proofUrl?: string;
    }
  | { action: "approve" }
  | { action: "reject"; reason?: string }
  | { action: "updateDeliveryStatus"; deliveryStatus: DeliveryStatusInput }
  | {
      action: "setStatus";
      status: "pending" | "completed" | "cancelled" | "refunded" | "partially_refunded";
    }
  | { action: "approveCancellationRequest"; refundMethod?: RefundMethod }
  | { action: "rejectCancellationRequest"; reason: string }
  | { action: "approveRefundRequest" }
  | { action: "rejectRefundRequest"; reason: string }
  | { action: "markReturnReceived"; returnStatus: ReturnStatus }
  | {
      action: "completeReturnInspection";
      lines: Array<{
        lineIndex: number;
        quantity: number;
        result: InspectionResult;
        damageReason?: string;
      }>;
      returnStatus?: ReturnStatus;
    };

export type TransactionActionName = TransactionActionInput["action"];

/** Legacy fields after the action, so pages can update without a reload. */
export interface OrderStatusSnapshot {
  id: string;
  transactionId: string | null;
  status: string | null;
  orderStatus: string | null;
  paymentStatus: string | null;
  deliveryStatus: string | null;
}

export interface TransactionActionResult {
  action: TransactionActionName;
  /** False when the request was a no-op (e.g. delivery status already set). */
  changed: boolean;
  order: OrderStatusSnapshot;
  refundId?: string;
  refundAmount?: number;
  /** Amount owed back by a cancellation (cancellationRefund.amount), 0 if none. */
  cancellationRefundAmount?: number;
  stock?: { restocked: number; accounted: number; skippedReason?: string };
  /** completeReturnInspection only. */
  outcome?: "refund_rejected" | "pending_refund";
  acceptedCount?: number;
  damagedCount?: number;
}

export type OnlineOrderActionInput =
  | { action: "setStatus"; status: OnlineStatusTarget }
  | { action: "setPaymentStatus"; paymentStatus: "SUCCESS" | "PENDING" };

/**
 * A customer email/Telegram message. Queued in `notificationOutbox` inside the
 * action's transaction and delivered server-side (src/server/notificationOutbox.ts).
 */
export type CustomerNotifyPayload = CustomerEventPayload;

export interface OnlineOrderActionResult {
  orderId: string;
  changed: boolean;
  previousStatus: string | null;
  status: string | null;
  paymentStatus: string | null;
  /** The linked transaction document, when there is one. */
  transactionDocId: string | null;
  cancellationRefundAmount?: number;
}

export interface BulkResult<T> {
  successCount: number;
  failCount: number;
  results: Array<{ id: string; ok: true; data: T } | { id: string; ok: false; error: string; status: number }>;
}
