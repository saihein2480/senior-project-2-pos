/**
 * Server actions on `transactions/{id}`.
 *
 * Each exported function runs in ONE Firestore transaction (runOnTransaction):
 * fresh read of the transaction, its onlineOrders document and
 * business_settings/main (+ stock documents when stock comes back), a guard
 * from the state machine (src/lib/orderState.ts), then every write of the
 * action: the transaction, the onlineOrders mirror, stock + returns ledger,
 * in-app notifications and the audit entry. Either all of it lands or none.
 *
 * "...By" fields record the verified caller (`actor.label`, plus a "...ByUid"
 * sibling); nothing about the actor comes from the request body.
 */

import { randomUUID } from "crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import {
  assertCanApply,
  computeReturnRefund,
  OrderStateError,
  planDeliveryChange,
  unrefundedQuantities,
  type OrderState,
  type ReturnStatus,
} from "@/lib/orderState";
import { stripUndefined } from "@/server/serialize";
import type { VerifiedActor } from "@/server/auditLog";
import { deliverAfterCommit, type CustomerEventPayload } from "@/server/notificationOutbox";
import {
  finishAction,
  prepareTransactionStock,
  runOnTransaction,
  stateOf,
  type FinishOptions,
  type OrderContext,
} from "./context";
import { withUpdates } from "./txWrites";
import {
  customerEventFromTransaction,
  customerPartialDamagedNotification,
  customerRefundCompletedNotification,
  customerRefundRejectedNotification,
  DELIVERY_EVENT,
  ownerRefundPaymentNotification,
  type CustomerEventExtra,
} from "./notifications";
import type {
  DeliveryStatusInput,
  InspectionResult,
  RefundMethod,
  TransactionActionInput,
  TransactionActionResult,
} from "./types";

function newRefundId(): string {
  return `REF-${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 9)}`;
}

function refundsOf(data: DocumentData): Array<Record<string, unknown>> {
  return Array.isArray(data.refunds) ? (data.refunds as Array<Record<string, unknown>>) : [];
}

function by(ctx: OrderContext, prefix: string): Record<string, unknown> {
  return { [`${prefix}By`]: ctx.actor.label, [`${prefix}ByUid`]: ctx.actor.uid };
}

function opts(ctx: OrderContext) {
  return { refundTaxOnReturns: ctx.refundTaxOnReturns };
}

/** A customer message about this order (null without a customer uid). */
function customerEvent(ctx: OrderContext, type: string, extra: CustomerEventExtra = {}): CustomerEventPayload | null {
  return customerEventFromTransaction(ctx.data, ctx.id, type, extra);
}

/** Order-status messages are for online orders only; a walk-in buyer is at the till. */
function onlineOrderEvent(
  ctx: OrderContext,
  state: OrderState,
  type: string | undefined,
  extra: CustomerEventExtra = {},
): Array<CustomerEventPayload | null> {
  if (!type || state.channel !== "online") return [];
  return [customerEvent(ctx, type, { paymentStatus: state.moneyReceived ? "paid" : "pending", ...extra })];
}

/**
 * A walk-in sale paid at the till (cash or scan, not COD): the customer is
 * standing at the counter, so the money goes back there and then. Its refunds
 * and cancellation refunds are settled when they are recorded instead of
 * waiting on the Pending Refund Payments page.
 */
function isCounterRefund(state: OrderState): boolean {
  return state.channel === "walk_in" && state.paymentMethod !== "cod" && state.moneyReceived;
}

/** How a counter refund is paid back: what the caller chose, else cash for cash sales. */
function counterRefundMethod(state: OrderState, chosen?: RefundMethod): RefundMethod {
  if (chosen) return chosen;
  return state.paymentMethod === "cash" ? "cash" : "original_payment";
}

/** A refunds[] entry, in the shape the pages and the storefront read. */
function buildRefundEntry(
  ctx: OrderContext,
  computed: ReturnType<typeof computeReturnRefund>,
  params: { reason?: string; refundMethod?: RefundMethod; needsPayout: boolean },
): Record<string, unknown> {
  const refundId = newRefundId();
  return stripUndefined({
    id: refundId,
    refundId,
    transactionId: ctx.id,
    items: computed.items,
    totalAmount: computed.totalAmount,
    itemsSubtotal: computed.itemsSubtotal,
    cartDiscountRefund: computed.cartDiscountRefund,
    taxRefund: computed.taxRefund,
    reason: params.reason || undefined,
    processedBy: ctx.actor.label,
    processedByUid: ctx.actor.uid,
    createdAt: ctx.now,
    // Paid orders wait for the payout to be confirmed (pending refunds page);
    // unpaid ones (COD before delivery) have nothing to pay back.
    status: params.needsPayout ? "pending" : "completed",
    refundMethod: params.refundMethod,
    ...(params.needsPayout ? {} : { refundedAt: ctx.now, refundedBy: ctx.actor.label }),
  });
}

function result(
  action: TransactionActionResult["action"],
  finished: ReturnType<typeof finishAction> | null,
  ctx: OrderContext,
  extra: Partial<TransactionActionResult> = {},
): TransactionActionResult {
  const order = finished
    ? finished.snapshot
    : {
        id: ctx.id,
        transactionId: typeof ctx.data.transactionId === "string" ? ctx.data.transactionId : null,
        status: ctx.data.status ?? null,
        orderStatus: ctx.data.orderStatus ?? null,
        paymentStatus: ctx.data.paymentStatus ?? null,
        deliveryStatus: ctx.data.deliveryStatus ?? null,
      };
  return { action, changed: finished !== null, order, ...extra };
}

// ---------------------------------------------------------------------------
// Cancellation (shared by cancel, reject-free paths, delivery "cancelled",
// cancellation requests and the online-orders page)
// ---------------------------------------------------------------------------

export interface CancelOptions {
  action: string;
  reason?: string;
  refundMethod?: RefundMethod;
  /** Extra transaction fields written with the cancellation. */
  extraUpdates?: Record<string, unknown>;
  requestedOnlineStatus?: string;
  /** Customer messages for this cancellation (the caller decides which). */
  customerEvents?: FinishOptions["customerEvents"];
}

/**
 * Cancel the order: every unit not already refunded goes back through the
 * returns ledger, and a paid order gets a pending cancellationRefund of
 * total − already refunded (the sale is voided, so tax and delivery fee come
 * back too). Guards are the caller's job.
 */
export async function cancelInContext(
  ctx: OrderContext,
  state: OrderState,
  options: CancelOptions,
): Promise<{ finished: ReturnType<typeof finishAction>; refundAmount: number }> {
  const refundAmount = state.moneyReceived ? state.money.cancellationRefundable : 0;
  // A walk-in sale cancelled at the till is paid back on the spot.
  const counter = refundAmount > 0 && isCounterRefund(state);

  const updates: Record<string, unknown> = {
    cancelledAt: ctx.now,
    cancelReason: options.reason || undefined,
    ...by(ctx, "cancelled"),
    ...(options.extraUpdates ?? {}),
  };
  if (refundAmount > 0) {
    updates.cancellationRefund = stripUndefined({
      amount: refundAmount,
      method: counter ? counterRefundMethod(state, options.refundMethod) : options.refundMethod || "pending",
      status: counter ? "completed" : "pending",
      requestedAt: ctx.now,
      requestedBy: ctx.actor.label,
      requestedByUid: ctx.actor.uid,
      reason: options.reason || undefined,
      ...(counter
        ? {
            confirmedAt: ctx.now,
            confirmedBy: ctx.actor.label,
            confirmedByUid: ctx.actor.uid,
            paidAtCounter: true,
          }
        : {}),
    });
  }

  const prepared = await prepareTransactionStock(
    ctx,
    unrefundedQuantities(ctx.data).map((line) => ({ ...line, restock: true })),
  );

  const finished = finishAction(ctx, {
    action: options.action,
    updates,
    prepared,
    reason: options.reason ?? null,
    requestedOnlineStatus: options.requestedOnlineStatus,
    forcePaymentStatus: counter,
    details: { cancellationRefundAmount: refundAmount, ...(counter ? { paidAtCounter: true } : {}) },
    // Nothing left to pay out for a counter refund, so no "refund payment" alert.
    notifications:
      refundAmount > 0 && !counter ? [ownerRefundPaymentNotification(ctx.data, ctx.id, true)] : [],
    customerEvents: options.customerEvents,
  });

  return { finished, refundAmount };
}

/** Move delivery forward (guards already checked; not for "cancelled"). */
export function deliveryUpdates(
  ctx: OrderContext,
  state: OrderState,
  target: Exclude<DeliveryStatusInput, "cancelled">,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    deliveryStatus: target,
    deliveryStatusUpdatedAt: ctx.now,
    deliveryStatusUpdatedBy: ctx.actor.label,
    deliveryStatusUpdatedByUid: ctx.actor.uid,
  };
  // Delivered COD = paid at the door, so a still-pending order completes.
  // An order that is already refunded/partially refunded keeps that status.
  if (target === "delivered" && state.awaitingApproval) {
    updates.status = "completed";
    updates.approvedAt = ctx.now;
    Object.assign(updates, by(ctx, "approved"));
  }
  return updates;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ActionFn<A extends TransactionActionInput["action"]> = (
  ctx: OrderContext,
  input: Extract<TransactionActionInput, { action: A }>,
) => Promise<TransactionActionResult>;

const processRefund: ActionFn<"processRefund"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("refund", state);

  const computed = computeReturnRefund(ctx.data, input.items, opts(ctx));
  // Walk-in refunds are paid at the counter now, so they are recorded as
  // completed rather than queued for Pending Refund Payments.
  const counter = isCounterRefund(state);
  const entry = buildRefundEntry(ctx, computed, {
    reason: input.reason,
    refundMethod: counter ? counterRefundMethod(state, input.refundMethod) : input.refundMethod,
    needsPayout: state.moneyReceived && !counter,
  });
  if (counter) entry.refundedByUid = ctx.actor.uid;
  const refunds = [...refundsOf(ctx.data), entry];
  const updates: Record<string, unknown> = { refunds };

  // orderStatus follows the return (as before): an explicit hint wins,
  // otherwise shipped/delivered orders and "return" requests become
  // fully/partially returned by how much has now been refunded.
  const afterRefund = stateOf(ctx, withUpdates(ctx.data, { refunds }));
  const hinted: ReturnStatus | undefined =
    input.returnStatus === "refunded"
      ? "fully_returned"
      : input.returnStatus === "partially_refunded"
        ? "partially_returned"
        : undefined;
  const wentOut = ["shipped", "delivered", "partially_returned", "fully_returned"].includes(state.fulfilment);
  if (hinted) updates.orderStatus = hinted;
  else if (wentOut || state.refundRequestType === "return") {
    updates.orderStatus = afterRefund.refund === "full" ? "fully_returned" : "partially_returned";
  }

  if (input.approveRefundRequest && state.refundRequest === "pending") {
    updates["refundRequest.status"] = "approved";
    updates["refundRequest.approvedAt"] = ctx.nowIso;
    updates["refundRequest.approvedBy"] = ctx.actor.label;
  }

  const inspection = new Map<number, InspectionResult>(
    (input.inspectionResults ?? []).map((r) => [r.lineIndex, r.result]),
  );
  const prepared = await prepareTransactionStock(
    ctx,
    computed.items.map((item) => ({
      lineIndex: item.itemIndex,
      quantity: item.quantity,
      restock: input.inspectionResults ? inspection.get(item.itemIndex) === "accepted" : true,
    })),
  );

  const finished = finishAction(ctx, {
    action: "processRefund",
    updates,
    prepared,
    reason: input.reason ?? null,
    // A settled counter refund moves the payment status on, as a payout
    // confirmation would.
    forcePaymentStatus: counter,
    details: {
      refundId: entry.refundId,
      amount: computed.totalAmount,
      items: computed.items,
      ...(counter ? { paidAtCounter: true, refundMethod: entry.refundMethod } : {}),
    },
  });

  return result("processRefund", finished, ctx, {
    refundId: String(entry.refundId),
    refundAmount: computed.totalAmount,
    stock: prepared.result,
  });
};

const confirmReturnStatus: ActionFn<"confirmReturnStatus"> = async (ctx, input) => {
  assertCanApply("confirmReturnStatus", stateOf(ctx));
  const finished = finishAction(ctx, {
    action: "confirmReturnStatus",
    updates: {
      orderStatus: input.returnStatus,
      "refundRequest.returnStatusConfirmedAt": ctx.now,
      "refundRequest.returnStatusConfirmedBy": ctx.actor.label,
    },
    details: { returnStatus: input.returnStatus },
  });
  return result("confirmReturnStatus", finished, ctx);
};

const confirmRefundPayment: ActionFn<"confirmRefundPayment"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("confirmRefundPayment", state, { refundId: input.refundId });

  const refunds = refundsOf(ctx.data).map((refund): Record<string, unknown> =>
    refund.refundId === input.refundId
      ? stripUndefined({
          ...refund,
          status: "completed",
          refundMethod: input.refundMethod,
          refundedAt: ctx.now,
          refundedBy: ctx.actor.label,
          refundedByUid: ctx.actor.uid,
          refundNotes: input.notes || undefined,
          refundProofUrl: input.proofUrl || undefined,
        })
      : refund,
  );
  const confirmed = refunds.find((r) => r.refundId === input.refundId) as Record<string, unknown>;
  const amount = Number(confirmed.totalAmount) || 0;
  const fullAfter = stateOf(ctx, withUpdates(ctx.data, { refunds })).refund === "full";

  const finished = finishAction(ctx, {
    action: "confirmRefundPayment",
    updates: { refunds },
    forcePaymentStatus: true,
    details: { refundId: input.refundId, amount, refundMethod: input.refundMethod },
    notifications: [
      customerRefundCompletedNotification({
        txn: ctx.data,
        docId: ctx.id,
        amount,
        refundMethod: input.refundMethod,
        notes: input.notes,
        full: fullAfter,
        cancellation: false,
      }),
    ],
    // The in-app "refund_completed" above is the bell entry; email/Telegram only.
    customerEvents: [
      customerEvent(ctx, "refund_completed", {
        refundAmount: amount,
        refundMethod: input.refundMethod,
        skipInApp: true,
      }),
    ],
  });
  return result("confirmRefundPayment", finished, ctx, { refundId: input.refundId, refundAmount: amount });
};

const cancel: ActionFn<"cancel"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("cancel", state);
  const { finished, refundAmount } = await cancelInContext(ctx, state, {
    action: "cancel",
    reason: input.reason,
    refundMethod: input.refundMethod,
    customerEvents: onlineOrderEvent(ctx, state, "order_cancelled", { reason: input.reason }),
  });
  return result("cancel", finished, ctx, { cancellationRefundAmount: refundAmount });
};

const confirmCancellationRefund: ActionFn<"confirmCancellationRefund"> = async (ctx, input) => {
  assertCanApply("confirmCancellationRefund", stateOf(ctx));
  const amount = Number(ctx.data.cancellationRefund?.amount) || 0;
  const finished = finishAction(ctx, {
    action: "confirmCancellationRefund",
    updates: {
      "cancellationRefund.status": "completed",
      "cancellationRefund.method": input.refundMethod,
      "cancellationRefund.confirmedAt": ctx.now,
      "cancellationRefund.confirmedBy": ctx.actor.label,
      "cancellationRefund.confirmedByUid": ctx.actor.uid,
      ...(input.notes ? { "cancellationRefund.notes": input.notes } : {}),
      ...(input.proofUrl ? { "cancellationRefund.proofUrl": input.proofUrl } : {}),
    },
    forcePaymentStatus: true,
    details: { amount, refundMethod: input.refundMethod },
    notifications: [
      customerRefundCompletedNotification({
        txn: ctx.data,
        docId: ctx.id,
        amount,
        refundMethod: input.refundMethod,
        notes: input.notes,
        full: true,
        cancellation: true,
      }),
    ],
    customerEvents: [
      customerEvent(ctx, "refund_completed", {
        refundAmount: amount,
        refundMethod: input.refundMethod,
        skipInApp: true,
      }),
    ],
  });
  return result("confirmCancellationRefund", finished, ctx, { refundAmount: amount });
};

const approve: ActionFn<"approve"> = async (ctx) => {
  const state = stateOf(ctx);
  assertCanApply("approve", state);

  // Approving a COD order also ships it (pending/confirmed → shipped), in the
  // same transaction, so staff don't have to do it as a second step. A
  // delivery that is already shipped or delivered is left alone.
  const currentDelivery =
    typeof ctx.data.deliveryStatus === "string"
      ? ctx.data.deliveryStatus.trim().toLowerCase()
      : "";
  const shipDelivery =
    String(ctx.data.paymentMethod || "").toLowerCase() === "cod" &&
    (currentDelivery === "" || currentDelivery === "pending" || currentDelivery === "confirmed");

  const finished = finishAction(ctx, {
    action: "approve",
    updates: {
      status: "completed",
      approvedAt: ctx.now,
      ...by(ctx, "approved"),
      ...(shipDelivery ? deliveryUpdates(ctx, state, "shipped") : {}),
    },
    ...(shipDelivery
      ? {
          details: { deliveryStatus: "shipped" },
          customerEvents: (_after: unknown, afterState: OrderState) =>
            onlineOrderEvent(ctx, afterState, DELIVERY_EVENT.shipped),
        }
      : {}),
  });
  return result("approve", finished, ctx);
};

const reject: ActionFn<"reject"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("reject", state);
  const prepared = await prepareTransactionStock(
    ctx,
    unrefundedQuantities(ctx.data).map((line) => ({ ...line, restock: true })),
  );
  const finished = finishAction(ctx, {
    action: "reject",
    updates: {
      rejectedAt: ctx.now,
      rejectReason: input.reason || undefined,
      ...by(ctx, "rejected"),
    },
    prepared,
    reason: input.reason ?? null,
    customerEvents: onlineOrderEvent(ctx, state, "order_cancelled", { reason: input.reason }),
  });
  return result("reject", finished, ctx, { stock: prepared.result });
};

const updateDeliveryStatus: ActionFn<"updateDeliveryStatus"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("updateDelivery", state, { deliveryTarget: input.deliveryStatus });
  const plan = planDeliveryChange(state, input.deliveryStatus);

  if (plan === "noop") return result("updateDeliveryStatus", null, ctx);

  if (plan === "cancel") {
    const { finished, refundAmount } = await cancelInContext(ctx, state, {
      action: "updateDeliveryStatus",
      reason: "Delivery cancelled",
      extraUpdates: {
        deliveryStatus: "cancelled",
        deliveryStatusUpdatedAt: ctx.now,
        deliveryStatusUpdatedBy: ctx.actor.label,
        deliveryStatusUpdatedByUid: ctx.actor.uid,
      },
      customerEvents: onlineOrderEvent(ctx, state, "order_cancelled"),
    });
    return result("updateDeliveryStatus", finished, ctx, { cancellationRefundAmount: refundAmount });
  }

  const target = input.deliveryStatus as Exclude<DeliveryStatusInput, "cancelled">;
  const finished = finishAction(ctx, {
    action: "updateDeliveryStatus",
    updates: deliveryUpdates(ctx, state, target),
    details: { deliveryStatus: target },
    customerEvents: (_after, afterState) =>
      onlineOrderEvent(ctx, afterState, DELIVERY_EVENT[target]),
  });
  return result("updateDeliveryStatus", finished, ctx);
};

const setStatus: ActionFn<"setStatus"> = async (ctx, input) => {
  if (input.status === "completed") return approve(ctx, { action: "approve" });
  if (input.status === "cancelled") return cancel(ctx, { action: "cancel" });
  throw new OrderStateError(
    "invalid_input",
    "This status can't be set directly. Use the refund or approval actions instead.",
  );
};

const approveCancellationRequest: ActionFn<"approveCancellationRequest"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("approveCancellationRequest", state);
  const reason =
    (typeof ctx.data.cancellationRequest?.reason === "string" && ctx.data.cancellationRequest.reason) ||
    "Approved by owner";
  const { finished, refundAmount } = await cancelInContext(ctx, state, {
    action: "approveCancellationRequest",
    reason,
    refundMethod: input.refundMethod,
    extraUpdates: {
      "cancellationRequest.status": "approved",
      "cancellationRequest.approvedAt": ctx.nowIso,
      "cancellationRequest.approvedBy": ctx.actor.label,
    },
    // The storefront bell derives "Cancellation approved" from cancellationRequest.
    customerEvents: [
      customerEvent(ctx, "cancellation_approved", {
        refundAmount: state.moneyReceived ? state.money.cancellationRefundable : undefined,
        paymentStatus: state.moneyReceived ? "paid" : "pending",
        skipInApp: true,
      }),
    ],
  });
  return result("approveCancellationRequest", finished, ctx, { cancellationRefundAmount: refundAmount });
};

const rejectCancellationRequest: ActionFn<"rejectCancellationRequest"> = async (ctx, input) => {
  assertCanApply("rejectCancellationRequest", stateOf(ctx));
  const finished = finishAction(ctx, {
    action: "rejectCancellationRequest",
    updates: {
      "cancellationRequest.status": "rejected",
      "cancellationRequest.rejectedAt": ctx.nowIso,
      "cancellationRequest.rejectionReason": input.reason,
      "cancellationRequest.rejectedBy": ctx.actor.label,
    },
    reason: input.reason,
    customerEvents: [customerEvent(ctx, "cancellation_rejected", { reason: input.reason, skipInApp: true })],
  });
  return result("rejectCancellationRequest", finished, ctx);
};

const approveRefundRequest: ActionFn<"approveRefundRequest"> = async (ctx) => {
  const state = stateOf(ctx);
  assertCanApply("approveRefundRequest", state);
  const updates: Record<string, unknown> = {
    "refundRequest.status": "approved",
    "refundRequest.approvedAt": ctx.nowIso,
    "refundRequest.approvedBy": ctx.actor.label,
  };
  let refundAmount: number | undefined;
  const notifications: Array<Record<string, unknown> | null> = [];

  // A refund request on an order that was cancelled without recording what
  // was owed (legacy data): record the cancellation refund now.
  if (state.refundRequestType === "cancellation") {
    refundAmount = state.money.cancellationRefundable;
    if (!(refundAmount > 0)) {
      throw new OrderStateError("nothing_to_refund", "Nothing is left to refund on this order.");
    }
    updates.cancellationRefund = stripUndefined({
      amount: refundAmount,
      method: "pending",
      status: "pending",
      requestedAt: ctx.now,
      requestedBy: ctx.actor.label,
      requestedByUid: ctx.actor.uid,
      reason: typeof ctx.data.refundRequest?.reason === "string" ? ctx.data.refundRequest.reason : undefined,
    });
    notifications.push(ownerRefundPaymentNotification(ctx.data, ctx.id, true));
  }

  const finished = finishAction(ctx, {
    action: "approveRefundRequest",
    updates,
    details: { type: state.refundRequestType, cancellationRefundAmount: refundAmount ?? 0 },
    notifications,
    // The storefront bell derives "Return request approved" from refundRequest.
    // A cancellation-type request is a refund for an order already cancelled.
    customerEvents: [
      state.refundRequestType === "cancellation"
        ? customerEvent(ctx, "cancellation_approved", {
            refundAmount,
            paymentStatus: "paid",
            skipInApp: true,
          })
        : customerEvent(ctx, "refund_approved", { skipInApp: true }),
    ],
  });
  return result("approveRefundRequest", finished, ctx, { cancellationRefundAmount: refundAmount });
};

const rejectRefundRequest: ActionFn<"rejectRefundRequest"> = async (ctx, input) => {
  assertCanApply("rejectRefundRequest", stateOf(ctx));
  const finished = finishAction(ctx, {
    action: "rejectRefundRequest",
    updates: {
      "refundRequest.status": "rejected",
      "refundRequest.rejectedAt": ctx.nowIso,
      "refundRequest.rejectionReason": input.reason,
      "refundRequest.rejectedBy": ctx.actor.label,
    },
    reason: input.reason,
    customerEvents: [customerEvent(ctx, "refund_rejected", { reason: input.reason, skipInApp: true })],
  });
  return result("rejectRefundRequest", finished, ctx);
};

const markReturnReceived: ActionFn<"markReturnReceived"> = async (ctx, input) => {
  assertCanApply("markReturnReceived", stateOf(ctx));
  const finished = finishAction(ctx, {
    action: "markReturnReceived",
    updates: {
      "refundRequest.returnReceived": true,
      "refundRequest.returnReceivedAt": ctx.nowIso,
      "refundRequest.returnReceivedBy": ctx.actor.label,
      "refundRequest.returnStatus": input.returnStatus,
      orderStatus: input.returnStatus,
    },
    details: { returnStatus: input.returnStatus },
  });
  return result("markReturnReceived", finished, ctx);
};

/**
 * Inspection of returned items, in one step: confirm the return status,
 * record the per-line results, and either
 *   - every item damaged: refund rejected (status/paymentStatus
 *     "refund_rejected", refundRequest "completed_no_refund"), or
 *   - some accepted: a pending refund for the accepted units only
 *     (paymentStatus "pending_refund", refundRequest "completed").
 * Accepted units go back on the shelf; damaged ones are written off in the
 * returns ledger so no later path shelves them.
 */
const completeReturnInspection: ActionFn<"completeReturnInspection"> = async (ctx, input) => {
  const state = stateOf(ctx);
  assertCanApply("completeInspection", state);
  if (!state.moneyReceived) {
    throw new OrderStateError("not_paid", "This order was not paid yet. Cannot process a return refund.");
  }

  const items = Array.isArray(ctx.data.items) ? ctx.data.items : [];
  const seen = new Set<number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.lineIndex) || line.lineIndex < 0 || line.lineIndex >= items.length) {
      throw new OrderStateError("invalid_input", `Item ${line.lineIndex} is not part of this order.`);
    }
    if (seen.has(line.lineIndex)) {
      throw new OrderStateError("invalid_input", "Each item can only be inspected once.");
    }
    seen.add(line.lineIndex);
    const available =
      (state.money.soldQtyByLine[line.lineIndex] || 0) - (state.money.refundedQtyByLine[line.lineIndex] || 0);
    if (line.quantity > available) {
      const name = items[line.lineIndex]?.groupName || `item ${line.lineIndex + 1}`;
      throw new OrderStateError(
        "quantity_exceeded",
        `Cannot return ${line.quantity} of "${name}". Only ${Math.max(0, available)} left on this order.`,
      );
    }
  }

  const stored = ctx.data.refundRequest?.returnStatus;
  const returnStatus: ReturnStatus =
    input.returnStatus ??
    (stored === "fully_returned" || stored === "partially_returned" ? stored : "partially_returned");

  const accepted = input.lines.filter((l) => l.result === "accepted");
  const damaged = input.lines.filter((l) => l.result === "damaged");
  const itemInspectionResults = input.lines.map((l) =>
    stripUndefined({
      itemIndex: l.lineIndex,
      status: l.result,
      inspectedAt: ctx.nowIso,
      damageReason: l.result === "damaged" ? l.damageReason || undefined : undefined,
    }),
  );

  const updates: Record<string, unknown> = {
    orderStatus: returnStatus,
    "refundRequest.returnStatusConfirmedAt": ctx.now,
    "refundRequest.returnStatusConfirmedBy": ctx.actor.label,
    "refundRequest.inspectionCompleted": true,
    "refundRequest.itemInspectionResults": itemInspectionResults,
    "refundRequest.inspectedBy": ctx.actor.label,
    "refundRequest.inspectedAt": ctx.nowIso,
  };
  const notifications: Array<Record<string, unknown> | null> = [];
  const customerEvents: Array<CustomerEventPayload | null> = [];
  let refundId: string | undefined;
  let refundAmount: number | undefined;
  let outcome: "refund_rejected" | "pending_refund";

  if (accepted.length === 0) {
    outcome = "refund_rejected";
    updates["refundRequest.status"] = "completed_no_refund";
    updates.status = "refund_rejected";
    updates.paymentStatus = "refund_rejected";
    notifications.push(customerRefundRejectedNotification(ctx.data, ctx.id));
    customerEvents.push(
      customerEvent(ctx, "refund_rejected", {
        reason: "All returned items were damaged and are not in resellable condition.",
        skipInApp: true,
      }),
    );
  } else {
    outcome = "pending_refund";
    const computed = computeReturnRefund(
      ctx.data,
      accepted.map((l) => ({ lineIndex: l.lineIndex, quantity: l.quantity })),
      opts(ctx),
    );
    const entry = buildRefundEntry(ctx, computed, {
      reason:
        (typeof ctx.data.refundRequest?.reason === "string" && ctx.data.refundRequest.reason) ||
        "Customer return request",
      needsPayout: true,
    });
    refundId = String(entry.refundId);
    refundAmount = computed.totalAmount;
    updates.refunds = [...refundsOf(ctx.data), entry];
    updates["refundRequest.status"] = "completed";
    notifications.push(ownerRefundPaymentNotification(ctx.data, ctx.id, false));
    if (damaged.length > 0) {
      notifications.push(customerPartialDamagedNotification(ctx.data, ctx.id, accepted.length, damaged.length));
    }
  }

  const prepared = await prepareTransactionStock(
    ctx,
    input.lines.map((l) => ({ lineIndex: l.lineIndex, quantity: l.quantity, restock: l.result === "accepted" })),
  );

  const finished = finishAction(ctx, {
    action: "completeReturnInspection",
    updates,
    prepared,
    forcePaymentStatus: true,
    details: { outcome, returnStatus, refundId, refundAmount, lines: input.lines },
    notifications,
    customerEvents,
  });

  return result("completeReturnInspection", finished, ctx, {
    outcome,
    refundId,
    refundAmount,
    acceptedCount: accepted.length,
    damagedCount: damaged.length,
    stock: prepared.result,
  });
};

const HANDLERS: { [A in TransactionActionInput["action"]]: ActionFn<A> } = {
  processRefund,
  confirmReturnStatus,
  confirmRefundPayment,
  cancel,
  confirmCancellationRefund,
  approve,
  reject,
  updateDeliveryStatus,
  setStatus,
  approveCancellationRequest,
  rejectCancellationRequest,
  approveRefundRequest,
  rejectRefundRequest,
  markReturnReceived,
  completeReturnInspection,
};

/** Run one action on transactions/{id} for a verified actor. */
export async function runTransactionAction(
  db: Firestore,
  actor: VerifiedActor,
  id: string,
  input: TransactionActionInput,
): Promise<TransactionActionResult> {
  const handler = HANDLERS[input.action] as ActionFn<typeof input.action>;
  const { result: actionResult, outboxIds } = await runOnTransaction(db, actor, id, (ctx) =>
    handler(ctx, input as Extract<TransactionActionInput, { action: typeof input.action }>),
  );
  // Committed; the customer message is queued either way. Try it now; the
  // cron drain retries whatever does not go through.
  await deliverAfterCommit(db, outboxIds);
  return actionResult;
}
