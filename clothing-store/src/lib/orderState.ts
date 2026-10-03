/**
 * The order state machine shared by every code path that changes an order.
 *
 * A transaction carries its state in several overlapping legacy fields, each
 * written by a different screen over time:
 *
 *   status              "pending" | "completed" | "cancelled" | "refunded" |
 *                       "partially_refunded" | "refund_rejected"
 *   orderStatus         "pending" | "packaging" | "confirmed" | "delivering" |
 *                       "delivered" | "cancelled" | "fully_returned" |
 *                       "partially_returned"
 *   paymentStatus       "SUCCESS" | "PENDING" | "pending_refund" |
 *                       "refund_rejected" | "refunded" | "partially_refunded"
 *   deliveryStatus      "pending" | "confirmed" | "shipped" | "delivered" |
 *                       "cancelled"
 *   cancellationRefund  { amount, status: "pending" | "completed" }
 *   refunds[]           { refundId, totalAmount, status: "pending" | "completed", items }
 *
 * Readers (POS pages, the storefront's purchases page and orderLabels.ts)
 * interpret those strings, so this module never invents new values. Instead:
 *
 *   1. `deriveOrderState` reads all of them into one normalised view.
 *   2. `assertCanApply` checks an action against an explicit transition table
 *      and throws an `OrderStateError` with a message a customer could read.
 *   3. `refundableSummary` / `computeReturnRefund` do the refund arithmetic
 *      with the rounding helpers in money.ts.
 *   4. `legacyStatusFields` turns the state *after* an action back into the
 *      coherent set of legacy strings to write, so every writer keeps them in
 *      step with each other (and `onlineOrderMirrorFields` does the same for
 *      the linked `onlineOrders` document).
 *
 * Pure: no Firebase imports. The server actions in src/server/orders call it
 * inside a Firestore transaction on freshly read documents.
 */

import {
  exceedsMoney,
  nonNegativeMoney,
  roundMoney,
  safeDivide,
  sumMoney,
} from "@/lib/money";

// ---------------------------------------------------------------------------
// Input shapes (structural, so both the client `Transaction` type and raw
// Firestore data fit)
// ---------------------------------------------------------------------------

export interface OrderLineLike {
  id?: string | null;
  stockId?: string | null;
  groupName?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  discountedPrice?: number | null;
}

export interface RefundRecordLike {
  refundId?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  items?: Array<{ itemIndex?: number | null; quantity?: number | null }> | null;
}

export interface OrderDocLike {
  status?: string | null;
  orderStatus?: string | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  paymentMethod?: string | null;
  onlineOrderId?: string | null;
  source?: string | null;
  orderSource?: string | null;
  items?: OrderLineLike[] | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total?: number | null;
  deliveryFee?: number | null;
  refunds?: RefundRecordLike[] | null;
  cancellationRefund?: { amount?: number | null; status?: string | null } | null;
  cancelledAt?: unknown;
  rejectedAt?: unknown;
  cancellationRequest?: { status?: string | null } | null;
  refundRequest?: {
    status?: string | null;
    type?: string | null;
    returnReceived?: boolean | null;
    inspectionCompleted?: boolean | null;
    returnStatus?: string | null;
  } | null;
}

/** The parts of an `onlineOrders` document this module reads. */
export interface OnlineOrderLike {
  status?: string | null;
  orderStatus?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  stockDeductedAt?: unknown;
  stockRestoredAt?: unknown;
}

// ---------------------------------------------------------------------------
// Normalised state
// ---------------------------------------------------------------------------

/** Where the goods are. "none" = handed over at the till (no delivery tracking). */
export type FulfilmentState =
  | "none"
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "partially_returned"
  | "fully_returned";

/**
 * "pending"  - awaiting approval (status "pending": COD/scan not yet confirmed)
 * "unpaid"   - approved but the money has not been received (COD before delivery)
 * "paid"     - money received
 */
export type PaymentState = "pending" | "unpaid" | "paid";

/** How much has been given back, from the refund records (not the labels). */
export type RefundLevel = "none" | "partial" | "full" | "rejected";

export type CancellationRefundState =
  | "none"
  | "pending"
  | "completed"
  | "failed"
  | "rejected";

export interface OrderState {
  channel: "walk_in" | "online";
  paymentMethod: string;
  payment: PaymentState;
  /** Shortcut for payment === "pending". */
  awaitingApproval: boolean;
  /** Money was received (so cancelling or refunding means paying it back). */
  moneyReceived: boolean;
  fulfilment: FulfilmentState;
  cancelled: boolean;
  /** Rejected while awaiting approval (also `cancelled`). */
  rejected: boolean;
  refund: RefundLevel;
  /** A refunds[] entry is still waiting for its payout to be confirmed. */
  refundPayoutPending: boolean;
  refundEntries: Array<{ refundId: string; status: string }>;
  cancellationRefund: CancellationRefundState;
  cancellationRequest: string; // "none" | "pending" | "approved" | "rejected" | other
  refundRequest: string; // "none" | "pending" | "approved" | "completed" | "completed_no_refund" | "rejected"
  refundRequestType: string | null;
  returnReceived: boolean;
  inspectionCompleted: boolean;
  /** Payment failed or expired at the gateway (online orders only). */
  paymentFailed: boolean;
  money: RefundableSummary;
}

export interface DeriveOptions {
  /** business_settings/main.refundTaxOnReturns. Default false. */
  refundTaxOnReturns?: boolean;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function qty(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const SUCCESS_PAYMENT = /^(success|succeeded|paid|completed)$/;
const PENDING_PAYMENT = /^(pending|processing|created|initiated|unpaid)$/;
const REFUND_FAMILY = new Set([
  "pending_refund",
  "refund_rejected",
  "refunded",
  "partially_refunded",
]);

const FULFILMENT_RANK: Record<FulfilmentState, number> = {
  none: 0,
  pending: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 3,
  partially_returned: 4,
  fully_returned: 4,
};

function isReturned(f: FulfilmentState): boolean {
  return f === "partially_returned" || f === "fully_returned";
}

/** deliveryStatus -> fulfilment. "cancelled" is not a fulfilment state. */
function fulfilmentFromDelivery(raw: unknown): FulfilmentState | null {
  switch (lower(raw)) {
    case "pending":
      return "pending";
    case "confirmed":
      return "confirmed";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    default:
      return null;
  }
}

/** orderStatus (or onlineOrders.status) -> fulfilment. */
export function fulfilmentFromOrderStatus(raw: unknown): FulfilmentState | null {
  const value = lower(raw);
  if (!value) return null;
  if (/fully_returned/.test(value)) return "fully_returned";
  if (/partially_returned/.test(value)) return "partially_returned";
  if (/(packaging|packed|preparing|confirmed|processing)/.test(value)) return "confirmed";
  if (/(delivering|shipping|shipped|in_transit)/.test(value)) return "shipped";
  if (/(delivered|fulfilled)/.test(value)) return "delivered";
  if (/(pending|paid|success|completed|created)/.test(value)) return "pending";
  return null;
}

function maxFulfilment(a: FulfilmentState | null, b: FulfilmentState | null): FulfilmentState | null {
  if (!a) return b;
  if (!b) return a;
  return FULFILMENT_RANK[b] > FULFILMENT_RANK[a] ? b : a;
}

/** The further along of two fulfilment states (e.g. transaction vs its online order). */
export function furthestFulfilment(a: FulfilmentState, b: FulfilmentState): FulfilmentState {
  return maxFulfilment(a, b) ?? a;
}

/** Read every legacy field of a transaction into one view. */
export function deriveOrderState(doc: OrderDocLike, options: DeriveOptions = {}): OrderState {
  const status = lower(doc.status);
  const orderStatus = lower(doc.orderStatus);
  const paymentStatus = lower(doc.paymentStatus);
  const deliveryStatus = lower(doc.deliveryStatus);
  const method = lower(doc.paymentMethod);

  const cr = doc.cancellationRefund;
  let cancellationRefund: CancellationRefundState = "none";
  if (cr && typeof cr === "object") {
    const crStatus = lower(cr.status);
    cancellationRefund =
      crStatus === "completed" || crStatus === "failed" || crStatus === "rejected"
        ? crStatus
        : "pending";
  }

  const rejected = hasValue(doc.rejectedAt);
  // A rejected pending order and an order cancelled through any path. The
  // delivery-only "cancelled" is deliberately not evidence: it was written
  // without returning stock, so the order still has to go through cancel.
  const cancelled =
    status === "cancelled" ||
    orderStatus === "cancelled" ||
    hasValue(doc.cancelledAt) ||
    cancellationRefund !== "none" ||
    rejected;

  const returnedFromRequest =
    doc.refundRequest?.returnReceived && fulfilmentFromOrderStatus(doc.refundRequest.returnStatus);
  const fulfilment: FulfilmentState =
    maxFulfilment(
      maxFulfilment(fulfilmentFromDelivery(deliveryStatus), fulfilmentFromOrderStatus(orderStatus)),
      returnedFromRequest && isReturned(returnedFromRequest) ? returnedFromRequest : null,
    ) ?? "none";

  const awaitingApproval = !cancelled && status === "pending";

  let moneyReceived: boolean;
  const delivered = fulfilment === "delivered" || isReturned(fulfilment) || deliveryStatus === "delivered";
  if (SUCCESS_PAYMENT.test(paymentStatus)) {
    moneyReceived = true;
  } else if (cancelled) {
    // Only matters for refunds owed on an order cancelled before this module
    // existed (no cancellationRefund recorded). Mirrors the storefront's
    // request-refund rule: cash/scan/wallet, or COD that was delivered.
    moneyReceived =
      cancellationRefund !== "none" ||
      (!rejected && (method === "cod" ? delivered : method !== ""));
  } else if (method === "cod" && PENDING_PAYMENT.test(paymentStatus)) {
    moneyReceived = false;
  } else if (status === "pending") {
    moneyReceived = false;
  } else if (method === "cod") {
    moneyReceived = delivered;
  } else {
    moneyReceived = true;
  }

  const payment: PaymentState = awaitingApproval ? "pending" : moneyReceived ? "paid" : "unpaid";

  const money = refundableSummary(doc, options);
  const refunds = Array.isArray(doc.refunds) ? doc.refunds : [];
  const refundPayoutPending = refunds.some((r) => lower(r?.status) === "pending");

  let refund: RefundLevel = "none";
  const sold = money.soldQtyByLine;
  const anySold = sold.some((q) => q > 0);
  const allLinesRefunded =
    anySold && sold.every((q, i) => q <= 0 || (money.refundedQtyByLine[i] || 0) >= q);
  const anyRefunded =
    money.returnsRefunded > 0 || Object.values(money.refundedQtyByLine).some((q) => q > 0);
  if (
    allLinesRefunded ||
    (money.maxRefundable > 0 && money.returnsRefunded > 0 && !exceedsMoney(money.maxRefundable, money.returnsRefunded))
  ) {
    refund = "full";
  } else if (anyRefunded) {
    refund = "partial";
  } else if (status === "refunded" || paymentStatus === "refunded") {
    // Legacy documents marked refunded without any refund records.
    refund = "full";
  } else if (status === "partially_refunded" || paymentStatus === "partially_refunded") {
    refund = "partial";
  } else if (status === "refund_rejected" || paymentStatus === "refund_rejected") {
    refund = "rejected";
  }

  const isOnline =
    hasValue(doc.onlineOrderId) || lower(doc.source) === "online" || lower(doc.orderSource) === "web_storefront";

  return {
    channel: isOnline ? "online" : "walk_in",
    paymentMethod: method,
    payment,
    awaitingApproval,
    moneyReceived,
    fulfilment,
    cancelled,
    rejected,
    refund,
    refundPayoutPending,
    refundEntries: refunds.map((r) => ({
      refundId: String(r?.refundId ?? ""),
      status: lower(r?.status) || "pending",
    })),
    cancellationRefund,
    cancellationRequest: lower(doc.cancellationRequest?.status) || "none",
    refundRequest: lower(doc.refundRequest?.status) || "none",
    refundRequestType: lower(doc.refundRequest?.type) || null,
    returnReceived: doc.refundRequest?.returnReceived === true,
    inspectionCompleted: doc.refundRequest?.inspectionCompleted === true,
    paymentFailed: false,
    money,
  };
}

/** The same view for an `onlineOrders` document with no transaction yet. */
export function deriveOnlineOrderState(order: OnlineOrderLike): OrderState {
  const status = lower(order.status);
  const paymentStatus = lower(order.paymentStatus);
  const combined = `${status} ${paymentStatus}`;
  const cancelled = /(cancelled|canceled|void)/.test(status);
  const paymentFailed = !cancelled && /(fail|declined|expired|timeout|stock_conflict)/.test(combined);
  const fulfilment = fulfilmentFromOrderStatus(status) ?? "pending";
  const moneyReceived = SUCCESS_PAYMENT.test(paymentStatus) || status === "paid";
  let refund: RefundLevel = "none";
  if (paymentStatus === "refunded") refund = "full";
  else if (paymentStatus === "partially_refunded") refund = "partial";
  else if (paymentStatus === "refund_rejected") refund = "rejected";

  return {
    channel: "online",
    paymentMethod: lower(order.paymentMethod),
    payment: moneyReceived ? "paid" : "unpaid",
    awaitingApproval: false,
    moneyReceived,
    fulfilment,
    cancelled,
    rejected: false,
    refund,
    refundPayoutPending: paymentStatus === "pending_refund",
    refundEntries: [],
    cancellationRefund: "none",
    cancellationRequest: "none",
    refundRequest: "none",
    refundRequestType: null,
    returnReceived: false,
    inspectionCompleted: false,
    paymentFailed,
    money: refundableSummary({}),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type OrderStateErrorCode =
  | "already_cancelled"
  | "fully_refunded"
  | "not_awaiting_approval"
  | "awaiting_approval"
  | "already_delivered"
  | "already_returned"
  | "not_delivered"
  | "delivery_backwards"
  | "already_confirmed"
  | "nothing_to_confirm"
  | "request_not_open"
  | "return_not_received"
  | "already_inspected"
  | "not_cod"
  | "has_refunds"
  | "not_paid"
  | "payment_failed"
  | "quantity_exceeded"
  | "amount_exceeded"
  | "nothing_to_refund"
  | "not_found"
  | "invalid_input";

/** A refused transition. `message` is safe to show to staff and customers. */
export class OrderStateError extends Error {
  readonly code: OrderStateErrorCode;

  constructor(code: OrderStateErrorCode, message: string) {
    super(message);
    this.name = "OrderStateError";
    this.code = code;
  }

  /** HTTP status a route should answer with. */
  get httpStatus(): number {
    if (this.code === "not_found") return 404;
    if (this.code === "invalid_input") return 400;
    return 409;
  }
}

export function isOrderStateError(error: unknown): error is OrderStateError {
  return (
    error instanceof OrderStateError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "OrderStateError")
  );
}

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

export type DeliveryTarget = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type ReturnStatus = "fully_returned" | "partially_returned";

/** Statuses the online-orders page offers (OWNER_STATUS_OPTIONS). */
export type OnlineStatusTarget =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "fully_returned"
  | "partially_returned";

export type OrderActionName =
  | "approve"
  | "reject"
  | "cancel"
  | "refund"
  | "confirmRefundPayment"
  | "confirmCancellationRefund"
  | "updateDelivery"
  | "confirmReturnStatus"
  | "markReturnReceived"
  | "completeInspection"
  | "approveCancellationRequest"
  | "rejectCancellationRequest"
  | "approveRefundRequest"
  | "rejectRefundRequest"
  | "setPaymentStatus"
  | "setOnlineStatus";

export interface ActionParams {
  refundId?: string;
  deliveryTarget?: DeliveryTarget;
  paymentTarget?: "paid" | "unpaid";
  onlineTarget?: OnlineStatusTarget;
}

interface Guard {
  /** True when the action must be refused. */
  deny: (s: OrderState, p: ActionParams) => boolean;
  code: OrderStateErrorCode;
  message: string | ((s: OrderState, p: ActionParams) => string);
}

const notCancelled: Guard = {
  deny: (s) => s.cancelled,
  code: "already_cancelled",
  message: "This order is already cancelled.",
};
const notFullyRefunded: Guard = {
  deny: (s) => s.refund === "full",
  code: "fully_refunded",
  message: "This order has already been fully refunded.",
};
const notDelivered: Guard = {
  deny: (s) => s.fulfilment === "delivered" || isReturned(s.fulfilment),
  code: "already_delivered",
  message:
    "This order has already been delivered, so it can't be cancelled. Process a return instead.",
};

const FULFILMENT_LABEL: Record<FulfilmentState, string> = {
  none: "not tracked",
  pending: "pending",
  confirmed: "confirmed",
  shipped: "shipped",
  delivered: "delivered",
  partially_returned: "partially returned",
  fully_returned: "fully returned",
};

const DELIVERY_TARGET_FULFILMENT: Record<Exclude<DeliveryTarget, "cancelled">, FulfilmentState> = {
  pending: "pending",
  confirmed: "confirmed",
  shipped: "shipped",
  delivered: "delivered",
};

/** online-orders page status -> delivery target on the transaction. */
export const ONLINE_STATUS_TO_DELIVERY: Record<
  Exclude<OnlineStatusTarget, "fully_returned" | "partially_returned">,
  DeliveryTarget
> = {
  pending: "pending",
  packaging: "confirmed",
  delivering: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
};

/**
 * Every action, the states it is allowed from (for people), and the guards
 * that enforce that (for code). Guards are checked in order; the first one
 * that denies decides the message.
 */
export const ORDER_TRANSITIONS: Record<OrderActionName, { allowedFrom: string; guards: Guard[] }> = {
  approve: {
    allowedFrom: "awaiting approval (status pending), not cancelled",
    guards: [
      notCancelled,
      notFullyRefunded,
      {
        deny: (s) => !s.awaitingApproval,
        code: "not_awaiting_approval",
        message: "This order is not awaiting approval. It has already been approved.",
      },
    ],
  },
  reject: {
    allowedFrom: "awaiting approval (status pending), not cancelled",
    guards: [
      notCancelled,
      {
        deny: (s) => !s.awaitingApproval,
        code: "not_awaiting_approval",
        message: "Only orders that are awaiting approval can be rejected.",
      },
    ],
  },
  cancel: {
    allowedFrom: "any live order not yet delivered and not fully refunded",
    guards: [notCancelled, notFullyRefunded, notDelivered],
  },
  refund: {
    allowedFrom: "approved, not cancelled, not fully refunded",
    guards: [
      notCancelled,
      notFullyRefunded,
      {
        deny: (s) => s.awaitingApproval,
        code: "awaiting_approval",
        message: "This order hasn't been approved yet. Approve or cancel it instead of refunding it.",
      },
    ],
  },
  confirmRefundPayment: {
    allowedFrom: "a refunds[] entry with status pending (also on a cancelled order: the money is still owed)",
    guards: [
      {
        deny: (s, p) => !s.refundEntries.some((r) => r.refundId === p.refundId),
        code: "not_found",
        message: "Refund not found on this order.",
      },
      {
        deny: (s, p) => s.refundEntries.find((r) => r.refundId === p.refundId)?.status !== "pending",
        code: "already_confirmed",
        message: (s, p) =>
          s.refundEntries.find((r) => r.refundId === p.refundId)?.status === "completed"
            ? "This refund payment has already been confirmed."
            : "This refund is not waiting for a payment confirmation.",
      },
    ],
  },
  confirmCancellationRefund: {
    allowedFrom: "cancelled with cancellationRefund.status pending",
    guards: [
      {
        deny: (s) => s.cancellationRefund === "none",
        code: "nothing_to_confirm",
        message: "This order has no cancellation refund to confirm.",
      },
      {
        deny: (s) => s.cancellationRefund !== "pending",
        code: "already_confirmed",
        message: "This cancellation refund has already been confirmed.",
      },
    ],
  },
  updateDelivery: {
    allowedFrom:
      "live order; forward only pending -> confirmed -> shipped -> delivered; cancelled only before delivered (runs the cancel path)",
    guards: [
      notCancelled,
      notFullyRefunded,
      {
        deny: (s) => isReturned(s.fulfilment),
        code: "already_returned",
        message: "This order has already been returned.",
      },
      {
        deny: (s, p) => p.deliveryTarget === "cancelled" && s.fulfilment === "delivered",
        code: "already_delivered",
        message: "This order has already been delivered, so it can't be cancelled. Process a return instead.",
      },
      {
        deny: (s, p) => {
          if (!p.deliveryTarget || p.deliveryTarget === "cancelled") return false;
          const target = DELIVERY_TARGET_FULFILMENT[p.deliveryTarget];
          if (target === s.fulfilment) return false; // no-op
          if (s.fulfilment === "none") return false;
          return FULFILMENT_RANK[target] <= FULFILMENT_RANK[s.fulfilment];
        },
        code: "delivery_backwards",
        message: (s) =>
          `Delivery status can only move forward. This order is already ${FULFILMENT_LABEL[s.fulfilment]}.`,
      },
    ],
  },
  confirmReturnStatus: {
    allowedFrom: "not cancelled, with a refund request",
    guards: [
      notCancelled,
      {
        deny: (s) => s.refundRequest === "none",
        code: "request_not_open",
        message: "No refund request found for this order.",
      },
    ],
  },
  markReturnReceived: {
    allowedFrom: "approved return request whose items have not been received yet",
    guards: [
      notCancelled,
      {
        deny: (s) => s.refundRequestType !== "return" || s.refundRequest === "none",
        code: "request_not_open",
        message: "This order has no return request.",
      },
      {
        deny: (s) => s.refundRequest === "pending",
        code: "request_not_open",
        message: "Approve the return request first.",
      },
      {
        deny: (s) => s.refundRequest !== "approved",
        code: "request_not_open",
        message: "This return request has already been closed.",
      },
      {
        deny: (s) => s.returnReceived,
        code: "already_confirmed",
        message: "The returned items have already been marked as received.",
      },
    ],
  },
  completeInspection: {
    allowedFrom: "approved return request, items received, not yet inspected",
    guards: [
      notCancelled,
      notFullyRefunded,
      {
        deny: (s) => s.refundRequestType !== "return" || s.refundRequest !== "approved",
        code: "request_not_open",
        message: "This order has no open return request.",
      },
      {
        deny: (s) => !s.returnReceived,
        code: "return_not_received",
        message: "Mark the returned items as received before inspecting them.",
      },
      {
        deny: (s) => s.inspectionCompleted,
        code: "already_inspected",
        message: "This return has already been inspected.",
      },
    ],
  },
  approveCancellationRequest: {
    allowedFrom: "cancellation request pending + everything `cancel` requires",
    guards: [
      notCancelled,
      {
        deny: (s) => s.cancellationRequest !== "pending",
        code: "request_not_open",
        message: "This cancellation request has already been handled.",
      },
      notFullyRefunded,
      notDelivered,
    ],
  },
  rejectCancellationRequest: {
    allowedFrom: "cancellation request pending",
    guards: [
      {
        deny: (s) => s.cancellationRequest !== "pending",
        code: "request_not_open",
        message: "This cancellation request has already been handled.",
      },
    ],
  },
  approveRefundRequest: {
    allowedFrom:
      "refund request pending; a 'return' needs a live order, a 'cancellation' needs a cancelled paid order with no cancellation refund yet",
    guards: [
      {
        deny: (s) => s.refundRequest !== "pending",
        code: "request_not_open",
        message: "This refund request has already been handled.",
      },
      {
        deny: (s) => s.refundRequestType !== "cancellation" && s.cancelled,
        code: "already_cancelled",
        message: "This order is already cancelled.",
      },
      {
        deny: (s) => s.refundRequestType !== "cancellation" && s.refund === "full",
        code: "fully_refunded",
        message: "This order has already been fully refunded.",
      },
      {
        deny: (s) => s.refundRequestType === "cancellation" && !s.cancelled,
        code: "invalid_input",
        message: "This order is not cancelled. Treat the request as a return instead.",
      },
      {
        deny: (s) => s.refundRequestType === "cancellation" && s.cancellationRefund !== "none",
        code: "already_confirmed",
        message: "A cancellation refund has already been recorded for this order.",
      },
      {
        deny: (s) => s.refundRequestType === "cancellation" && !s.moneyReceived,
        code: "not_paid",
        message: "This order was never paid, so there is nothing to refund.",
      },
    ],
  },
  rejectRefundRequest: {
    allowedFrom: "refund request pending, or an approved return whose items have not been received",
    guards: [
      {
        deny: (s) => s.refundRequest !== "pending" && s.refundRequest !== "approved",
        code: "request_not_open",
        message: "This refund request has already been handled.",
      },
      {
        deny: (s) => s.returnReceived,
        code: "request_not_open",
        message: "The returned items were already received. Complete the inspection instead.",
      },
    ],
  },
  setPaymentStatus: {
    allowedFrom: "live cash-on-delivery order; 'unpaid' only while nothing has been refunded",
    guards: [
      notCancelled,
      notFullyRefunded,
      {
        deny: (s) => s.paymentMethod !== "cod",
        code: "not_cod",
        message: "Only cash-on-delivery orders can be marked paid or unpaid here.",
      },
      {
        deny: (s, p) => p.paymentTarget === "unpaid" && (s.refund !== "none" || s.refundPayoutPending),
        code: "has_refunds",
        message: "This order already has refunds recorded, so it can't be marked unpaid.",
      },
    ],
  },
  setOnlineStatus: {
    allowedFrom:
      "same as updateDelivery for pending/packaging/delivering/delivered/cancelled; returned statuses only from delivered",
    guards: [
      notCancelled,
      {
        deny: (s, p) => s.paymentFailed && p.onlineTarget !== "cancelled",
        code: "payment_failed",
        message: "This order's payment failed or expired, so it can only be cancelled.",
      },
      {
        deny: (s, p) =>
          s.refund === "full" &&
          p.onlineTarget !== "fully_returned" &&
          p.onlineTarget !== "partially_returned",
        code: "fully_refunded",
        message: "This order has already been fully refunded.",
      },
      {
        deny: (s, p) =>
          (p.onlineTarget === "fully_returned" || p.onlineTarget === "partially_returned") &&
          s.fulfilment !== "delivered" &&
          !isReturned(s.fulfilment),
        code: "not_delivered",
        message: "Only delivered orders can be marked as returned.",
      },
      {
        deny: (s, p) =>
          isReturned(s.fulfilment) &&
          p.onlineTarget !== "fully_returned" &&
          p.onlineTarget !== "partially_returned",
        code: "already_returned",
        message: "This order has already been returned.",
      },
      {
        deny: (s, p) => p.onlineTarget === "cancelled" && (s.fulfilment === "delivered" || isReturned(s.fulfilment)),
        code: "already_delivered",
        message: "This order has already been delivered, so it can't be cancelled. Process a return instead.",
      },
      {
        deny: (s, p) => {
          const t = p.onlineTarget;
          if (!t || t === "cancelled" || t === "fully_returned" || t === "partially_returned") return false;
          const target = DELIVERY_TARGET_FULFILMENT[ONLINE_STATUS_TO_DELIVERY[t] as Exclude<DeliveryTarget, "cancelled">];
          if (target === s.fulfilment || s.fulfilment === "none") return false;
          return FULFILMENT_RANK[target] < FULFILMENT_RANK[s.fulfilment];
        },
        code: "delivery_backwards",
        message: (s) =>
          `Order status can only move forward. This order is already ${FULFILMENT_LABEL[s.fulfilment]}.`,
      },
    ],
  },
};

/** The first guard that refuses `action`, or null when it may proceed. */
export function checkAction(
  action: OrderActionName,
  state: OrderState,
  params: ActionParams = {},
): OrderStateError | null {
  for (const guard of ORDER_TRANSITIONS[action].guards) {
    if (guard.deny(state, params)) {
      const message = typeof guard.message === "function" ? guard.message(state, params) : guard.message;
      return new OrderStateError(guard.code, message);
    }
  }
  return null;
}

/** Throws an `OrderStateError` if `action` is not allowed from `state`. */
export function assertCanApply(action: OrderActionName, state: OrderState, params: ActionParams = {}): void {
  const error = checkAction(action, state, params);
  if (error) throw error;
}

/**
 * What a delivery update does: nothing (same status), move forward, or run
 * the cancel path. Call after `assertCanApply("updateDelivery", ...)`.
 */
export function planDeliveryChange(state: OrderState, target: DeliveryTarget): "noop" | "advance" | "cancel" {
  if (target === "cancelled") return "cancel";
  const next = DELIVERY_TARGET_FULFILMENT[target];
  if (next === state.fulfilment) return "noop";
  return "advance";
}

// ---------------------------------------------------------------------------
// Refund arithmetic
// ---------------------------------------------------------------------------

export interface RefundableSummary {
  /** Order total (incl. tax and delivery fee). */
  total: number;
  tax: number;
  deliveryFee: number;
  /** Σ line amounts at the price recorded on each line. */
  linesGross: number;
  /** What the customer paid for the goods: total − tax − delivery fee, capped at linesGross. */
  goodsNet: number;
  /** goodsNet / linesGross: the share of each line amount left after order-level discounts. */
  netRatio: number;
  /** tax / goodsNet. */
  taxRatio: number;
  /** Most a return refund can ever reach: goodsNet (+ tax when refundTaxOnReturns). Never the delivery fee. */
  maxRefundable: number;
  /** refunds[] not rejected + cancellationRefund.amount unless rejected. */
  alreadyRefunded: number;
  /** refunds[] (not rejected) only. */
  returnsRefunded: number;
  /** maxRefundable − returnsRefunded, never negative. */
  remaining: number;
  /** What cancelling a paid order refunds: total − alreadyRefunded, never negative. */
  cancellationRefundable: number;
  refundedQtyByLine: Record<number, number>;
  soldQtyByLine: number[];
}

function linePrice(line: OrderLineLike | undefined): number {
  if (!line) return 0;
  const discounted = Number(line.discountedPrice);
  if (line.discountedPrice !== undefined && line.discountedPrice !== null && Number.isFinite(discounted)) {
    return Math.max(0, discounted);
  }
  return Math.max(0, num(line.unitPrice));
}

/**
 * Refund figures for an order, from its stored lines and refund records.
 *
 * The discount is applied as a ratio (goodsNet / linesGross) rather than from
 * the `discount` field, because the channels store it differently: the till
 * records line prices after item discounts with `discount` = cart discount +
 * coupon, while the storefront records line prices after promotions with
 * `subtotal` before them and the coupon in `couponDiscountTHB`. total − tax −
 * delivery fee is what was actually paid for the goods on both.
 */
export function refundableSummary(doc: OrderDocLike, options: DeriveOptions = {}): RefundableSummary {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const soldQtyByLine = items.map((line) => qty(line?.quantity));
  const linesGross = sumMoney(items.map((line, i) => linePrice(line) * soldQtyByLine[i]));
  const tax = nonNegativeMoney(num(doc.tax));
  const deliveryFee = nonNegativeMoney(num(doc.deliveryFee));

  const totalRaw = Number(doc.total);
  const total = Number.isFinite(totalRaw)
    ? nonNegativeMoney(totalRaw)
    : nonNegativeMoney(num(doc.subtotal) - num(doc.discount) + tax + deliveryFee);

  let goodsNet = Number.isFinite(totalRaw)
    ? nonNegativeMoney(total - tax - deliveryFee)
    : nonNegativeMoney(num(doc.subtotal) - num(doc.discount));
  if (linesGross > 0 && goodsNet > linesGross) goodsNet = linesGross;

  const netRatio = linesGross > 0 ? Math.min(1, safeDivide(goodsNet, linesGross, 0)) : 0;
  const taxRatio = safeDivide(tax, goodsNet, 0);
  const maxRefundable = roundMoney(goodsNet + (options.refundTaxOnReturns === true ? tax : 0));

  const refundedQtyByLine: Record<number, number> = {};
  const counted = (Array.isArray(doc.refunds) ? doc.refunds : []).filter(
    (r) => r && lower(r.status) !== "rejected",
  );
  for (const refund of counted) {
    for (const item of Array.isArray(refund.items) ? refund.items : []) {
      const index = Number(item?.itemIndex);
      if (!Number.isInteger(index) || index < 0) continue;
      refundedQtyByLine[index] = (refundedQtyByLine[index] || 0) + qty(item?.quantity);
    }
  }
  const returnsRefunded = sumMoney(counted.map((r) => num(r.totalAmount)));

  const cr = doc.cancellationRefund;
  const crAmount = cr && typeof cr === "object" && lower(cr.status) !== "rejected" ? num(cr.amount) : 0;
  const alreadyRefunded = sumMoney([returnsRefunded, crAmount]);

  return {
    total,
    tax,
    deliveryFee,
    linesGross,
    goodsNet,
    netRatio,
    taxRatio,
    maxRefundable,
    alreadyRefunded,
    returnsRefunded,
    remaining: nonNegativeMoney(maxRefundable - returnsRefunded),
    cancellationRefundable: nonNegativeMoney(total - alreadyRefunded),
    refundedQtyByLine,
    soldQtyByLine,
  };
}

export interface RefundLineRequest {
  lineIndex: number;
  quantity: number;
}

export interface ComputedRefundLine {
  itemId: string;
  itemIndex: number;
  quantity: number;
  /** Price recorded on the line (before order-level discounts). */
  unitPrice: number;
  /** unitPrice × quantity. */
  totalAmount: number;
}

export interface ComputedReturnRefund {
  items: ComputedRefundLine[];
  /** Σ line amounts being refunded, before order-level discounts and tax. */
  itemsSubtotal: number;
  /** Proportional order-level discount taken off those lines. */
  cartDiscountRefund: number;
  /** Proportional tax included in the refund (0 unless refundTaxOnReturns). */
  taxRefund: number;
  /** itemsSubtotal − cartDiscountRefund + taxRefund. */
  totalAmount: number;
  /** After this refund every unit of every line has been refunded. */
  completesOrder: boolean;
}

/**
 * The money a return refund of `lines` is worth, validated against what is
 * left on the order. Throws `OrderStateError` for bad indexes (invalid_input),
 * quantities over what is left (quantity_exceeded) or money over the
 * refundable maximum (amount_exceeded).
 */
export function computeReturnRefund(
  doc: OrderDocLike,
  lines: RefundLineRequest[],
  options: DeriveOptions = {},
): ComputedReturnRefund {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const summary = refundableSummary(doc, options);

  // Merge duplicates so two entries for one line cannot each pass the check.
  const requested = new Map<number, number>();
  for (const line of lines) {
    const index = Number(line.lineIndex);
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      throw new OrderStateError("invalid_input", `Item ${line.lineIndex} is not part of this order.`);
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new OrderStateError("invalid_input", "Refund quantities must be whole numbers.");
    }
    if (quantity === 0) continue;
    requested.set(index, (requested.get(index) || 0) + quantity);
  }
  if (requested.size === 0) {
    throw new OrderStateError("nothing_to_refund", "Select at least one item to refund.");
  }

  const refundLines: ComputedRefundLine[] = [];
  const shares: number[] = [];
  const taxShares: number[] = [];
  for (const [index, quantity] of Array.from(requested.entries()).sort((a, b) => a[0] - b[0])) {
    const item = items[index];
    const sold = summary.soldQtyByLine[index] || 0;
    const already = summary.refundedQtyByLine[index] || 0;
    const available = Math.max(0, sold - already);
    if (quantity > available) {
      const name = item?.groupName || `item ${index + 1}`;
      throw new OrderStateError(
        "quantity_exceeded",
        `Cannot refund ${quantity} of "${name}". Only ${available} left to refund (${already} already refunded).`,
      );
    }
    const unitPrice = roundMoney(linePrice(item));
    const amount = roundMoney(unitPrice * quantity);
    const net = amount * summary.netRatio;
    shares.push(amount - net);
    taxShares.push(options.refundTaxOnReturns === true ? net * summary.taxRatio : 0);
    refundLines.push({
      itemId: String(item?.id ?? item?.groupName ?? index),
      itemIndex: index,
      quantity,
      unitPrice,
      totalAmount: amount,
    });
  }

  const itemsSubtotal = sumMoney(refundLines.map((l) => l.totalAmount));
  const cartDiscountRefund = sumMoney(shares);
  const taxRefund = sumMoney(taxShares);
  let totalAmount = roundMoney(itemsSubtotal - cartDiscountRefund + taxRefund);

  const completesOrder = summary.soldQtyByLine.every((sold, index) => {
    const after = (summary.refundedQtyByLine[index] || 0) + (requested.get(index) || 0);
    return sold <= 0 || after >= sold;
  });

  if (exceedsMoney(totalAmount, summary.remaining)) {
    // Per-refund rounding can leave the last refund a few satang over.
    if (completesOrder && roundMoney(totalAmount - summary.remaining) <= 0.05) {
      totalAmount = summary.remaining;
    } else {
      throw new OrderStateError(
        "amount_exceeded",
        `Cannot refund ${totalAmount.toFixed(2)}. Only ${summary.remaining.toFixed(2)} of this order is left to refund.`,
      );
    }
  } else if (completesOrder && roundMoney(summary.remaining - totalAmount) <= 0.05) {
    // Absorb the rounding residue so a fully refunded order nets to zero.
    totalAmount = summary.remaining;
  }

  if (!(totalAmount >= 0)) totalAmount = 0;

  return {
    items: refundLines,
    itemsSubtotal,
    cartDiscountRefund,
    taxRefund,
    totalAmount,
    completesOrder,
  };
}

// ---------------------------------------------------------------------------
// Legacy field writer
// ---------------------------------------------------------------------------

export interface LegacyStatusFields {
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  deliveryStatus?: string;
}

export interface LegacyWriteOptions extends DeriveOptions {
  /** Write paymentStatus even when the document has none (payout confirmations, inspections). */
  forcePaymentStatus?: boolean;
}

function canonicalStatus(s: OrderState): string {
  if (s.cancelled) return s.cancellationRefund === "completed" ? "refunded" : "cancelled";
  if (s.refund === "full") return "refunded";
  if (s.refund === "partial") return "partially_refunded";
  if (s.refund === "rejected") return "refund_rejected";
  if (s.payment === "pending") return "pending";
  return "completed";
}

function canonicalOrderStatus(s: OrderState): string | undefined {
  if (s.cancelled) return "cancelled";
  switch (s.fulfilment) {
    case "fully_returned":
    case "partially_returned":
      return s.fulfilment;
    case "delivered":
      return "delivered";
    case "shipped":
      return "delivering";
    case "confirmed":
      return "packaging";
    case "pending":
      return "pending";
    default:
      return undefined;
  }
}

function sameOrderStatusClass(current: unknown, target: string): boolean {
  const raw = lower(current);
  if (!raw) return false;
  if (raw === target) return true;
  if (target === "cancelled") return raw === "cancelled";
  return fulfilmentFromOrderStatus(raw) === fulfilmentFromOrderStatus(target) && raw !== "cancelled";
}

function canonicalPaymentStatus(s: OrderState, beforeRaw: unknown): string | undefined {
  const raw = typeof beforeRaw === "string" ? beforeRaw : "";
  const low = lower(raw);
  if (s.cancelled) {
    if (s.cancellationRefund === "completed") return "refunded";
    // The pending-refunds page only looks at refunds[] while paymentStatus is
    // "pending_refund", which would hide a pending cancellation refund.
    if (s.cancellationRefund === "pending" && low === "pending_refund") return "cancelled";
    return undefined;
  }
  if (s.refundPayoutPending) return "pending_refund";
  if (s.refund === "full") return "refunded";
  if (s.refund === "partial") return "partially_refunded";
  if (s.refund === "rejected") return "refund_rejected";
  if (s.moneyReceived) return SUCCESS_PAYMENT.test(low) ? raw : "SUCCESS";
  return PENDING_PAYMENT.test(low) ? raw : "PENDING";
}

/**
 * The legacy strings to write so they agree with the order's state after an
 * action. `after` is the document as it will be once the action's own fields
 * (refunds[], cancellationRefund, deliveryStatus, refundRequest...) are
 * applied. Only fields that change are returned:
 *
 *   status          always kept in step
 *   orderStatus     when the doc has one, or the order is cancelled/returned,
 *                   or its fulfilment moved
 *   paymentStatus   when the doc has one, or `forcePaymentStatus`
 *   deliveryStatus  when the doc has one, or the action set it
 */
export function legacyStatusFields(
  before: OrderDocLike,
  after: OrderDocLike,
  options: LegacyWriteOptions = {},
): LegacyStatusFields {
  const prev = deriveOrderState(before, options);
  const next = deriveOrderState(after, options);
  const out: LegacyStatusFields = {};

  const status = canonicalStatus(next);
  if (status !== before.status) out.status = status;

  const orderTarget = canonicalOrderStatus(next);
  const writeOrder =
    hasValue(before.orderStatus) ||
    hasValue(after.orderStatus) ||
    next.cancelled ||
    isReturned(next.fulfilment) ||
    prev.fulfilment !== next.fulfilment;
  if (writeOrder && orderTarget) {
    const current = hasValue(after.orderStatus) ? after.orderStatus : before.orderStatus;
    if (!sameOrderStatusClass(current, orderTarget)) out.orderStatus = orderTarget;
    else if (current !== before.orderStatus && typeof current === "string") out.orderStatus = current;
  }

  if (hasValue(before.paymentStatus) || options.forcePaymentStatus) {
    const target = canonicalPaymentStatus(next, before.paymentStatus);
    if (target && target !== before.paymentStatus) out.paymentStatus = target;
  }

  const deliveryTouched = hasValue(before.deliveryStatus) || after.deliveryStatus !== before.deliveryStatus;
  if (deliveryTouched) {
    let target: string | undefined;
    if (next.cancelled) {
      target = lower(before.deliveryStatus) === "delivered" ? undefined : "cancelled";
    } else if (next.fulfilment === "pending" || next.fulfilment === "confirmed" || next.fulfilment === "shipped" || next.fulfilment === "delivered") {
      target = next.fulfilment;
    }
    if (target && target !== before.deliveryStatus) out.deliveryStatus = target;
  }

  return out;
}

/**
 * Fields to write on the linked `onlineOrders` document so it agrees with
 * the transaction after an action. `written` is what `legacyStatusFields`
 * returned. `requestedStatus` is the exact status the online-orders page
 * picked, if that is where the action came from.
 */
export function onlineOrderMirrorFields(
  online: OnlineOrderLike,
  txnAfter: OrderState,
  written: LegacyStatusFields,
  options: { requestedStatus?: string; now?: string } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const currentStatus = lower(online.status);

  let desired: string | undefined = options.requestedStatus;
  if (!desired) {
    if (txnAfter.cancelled) desired = "cancelled";
    else if (isReturned(txnAfter.fulfilment)) desired = txnAfter.fulfilment;
    else if (written.deliveryStatus || written.orderStatus) {
      if (txnAfter.fulfilment === "delivered") desired = "delivered";
      else if (txnAfter.fulfilment === "shipped") desired = "delivering";
      else if (txnAfter.fulfilment === "confirmed") desired = "packaging";
    }
  }

  if (desired) {
    const cancelledNow = /(cancelled|canceled|void)/.test(currentStatus);
    let write: boolean;
    if (options.requestedStatus) write = currentStatus !== desired;
    else if (desired === "cancelled") write = !cancelledNow;
    else
      write =
        cancelledNow ||
        fulfilmentFromOrderStatus(currentStatus) !== fulfilmentFromOrderStatus(desired);
    if (write) out.status = desired;
    const writeOrderStatus =
      desired === "cancelled" || desired === "fully_returned" || desired === "partially_returned" || hasValue(online.orderStatus);
    if (writeOrderStatus && lower(online.orderStatus) !== desired) out.orderStatus = desired;
  }

  let payment: string | undefined;
  if (written.paymentStatus && REFUND_FAMILY.has(written.paymentStatus)) payment = written.paymentStatus;
  if (txnAfter.cancelled && txnAfter.cancellationRefund === "completed") payment = "refunded";
  if (payment && payment !== online.paymentStatus) out.paymentStatus = payment;

  if (Object.keys(out).length > 0) {
    const now = options.now ?? new Date().toISOString();
    out.updatedAt = now;
    out.lastUpdated = now;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small helpers for callers
// ---------------------------------------------------------------------------

/** Units still to come back per line (sold − refunded), for cancellations. */
export function unrefundedQuantities(doc: OrderDocLike): Array<{ lineIndex: number; quantity: number }> {
  const summary = refundableSummary(doc);
  return summary.soldQtyByLine.map((sold, lineIndex) => ({
    lineIndex,
    quantity: Math.max(0, sold - (summary.refundedQtyByLine[lineIndex] || 0)),
  }));
}

/** A compact before/after picture for the audit log. */
export function auditSnapshot(doc: OrderDocLike | null | undefined): Record<string, unknown> | null {
  if (!doc) return null;
  const money = refundableSummary(doc);
  const cr = doc.cancellationRefund;
  return {
    status: doc.status ?? null,
    orderStatus: doc.orderStatus ?? null,
    paymentStatus: doc.paymentStatus ?? null,
    deliveryStatus: doc.deliveryStatus ?? null,
    total: money.total,
    alreadyRefunded: money.alreadyRefunded,
    refundsCount: Array.isArray(doc.refunds) ? doc.refunds.length : 0,
    cancellationRefund:
      cr && typeof cr === "object" ? { amount: num(cr.amount), status: cr.status ?? null } : null,
  };
}
