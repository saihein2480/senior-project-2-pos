/**
 * Server actions on `onlineOrders/{id}` (the online-orders page).
 *
 * When the order has a transaction (COD orders always do; MMPAY orders once
 * paid) the transaction is the source of truth: the status change runs the
 * same state machine and the same cancel path as the transactions page, and
 * both documents are written in one Firestore transaction. Orders without a
 * transaction (unpaid / failed MMPAY checkouts) are guarded on their own
 * fields.
 *
 * Customer email/Telegram is queued in `notificationOutbox` inside that same
 * transaction and delivered server-side after the commit (retried by the cron
 * drain), so it no longer depends on the owner's browser.
 */

import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  assertCanApply,
  deriveOnlineOrderState,
  furthestFulfilment,
  ONLINE_STATUS_TO_DELIVERY,
  planDeliveryChange,
  type DeliveryTarget,
  type OnlineStatusTarget,
} from "@/lib/orderState";
import { ApiError, isApiError } from "@/server/errors";
import { appendAudit, type VerifiedActor } from "@/server/auditLog";
import { readLoyaltyCustomer } from "@/server/loyaltyAdmin";
import {
  deliverAfterCommit,
  deliverOutboxItems,
  NOTIFICATION_OUTBOX,
  outboxDocument,
} from "@/server/notificationOutbox";
import {
  onlineOrderReturnGuard,
  onlineOrderReturnLines,
  readStockReturn,
  writeStockReturnStock,
} from "@/server/stockReturnsAdmin";
import {
  contextFrom,
  finishAction,
  ONLINE_ORDERS,
  settingsRef,
  stateOf,
  toApiError,
  TRANSACTIONS,
  type OrderContext,
} from "./context";
import { cancelInContext, deliveryUpdates } from "./transactionActions";
import type { BulkResult, CustomerNotifyPayload, OnlineOrderActionResult } from "./types";

/** Online status -> customer notification type (pending/confirmed stay silent). */
const STATUS_NOTIFICATION: Record<string, string> = {
  packaging: "order_packaging",
  delivering: "order_shipped",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const SET_STATUS_ACTION = "onlineOrder.setStatus";

interface LinkedTransaction {
  ref: DocumentReference;
  data: DocumentData;
}

interface Committed<T> {
  result: T;
  outboxIds: string[];
}

/**
 * The transaction for an online order. Current COD and MMPAY transactions
 * point at the order with `onlineOrderId`; some older COD transactions used
 * the order id as their own document id instead.
 */
async function findLinkedTransaction(
  tx: Transaction,
  db: Firestore,
  orderId: string,
): Promise<LinkedTransaction | null> {
  const direct = await tx.get(db.collection(TRANSACTIONS).doc(orderId));
  if (direct.exists) {
    const data = direct.data() ?? {};
    if (!data.onlineOrderId || data.onlineOrderId === orderId) return { ref: direct.ref, data };
  }
  const query = await tx.get(
    db.collection(TRANSACTIONS).where("onlineOrderId", "==", orderId).limit(1),
  );
  if (!query.empty) return { ref: query.docs[0].ref, data: query.docs[0].data() };
  return null;
}

/** The customer message for an online status (same payload the browser used to send). */
function notifyPayload(
  orderId: string,
  order: DocumentData,
  status: string,
  paymentStatus: string,
): CustomerNotifyPayload | null {
  const customerId = order.customer?.uid;
  const type = STATUS_NOTIFICATION[status];
  if (!customerId || typeof customerId !== "string" || customerId.includes("/") || !type) return null;
  return {
    customerId,
    type,
    order: {
      orderRef: order.orderId || orderId,
      totalAmount: Number(order.total || 0),
      paymentMethod: order.paymentMethod || order.provider || "",
      paymentStatus: paymentStatus || "",
      items: (Array.isArray(order.items) ? order.items : []).map((item: DocumentData) => ({
        name: String(item?.name ?? ""),
        quantity: Number(item?.quantity ?? 0),
      })),
    },
  };
}

function lowerStr(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/** One online order's status change, committed; outbox ids not yet delivered. */
async function setOnlineOrderStatusTx(
  db: Firestore,
  actor: VerifiedActor,
  orderId: string,
  target: OnlineStatusTarget,
): Promise<Committed<OnlineOrderActionResult>> {
  try {
    return await db.runTransaction(async (tx): Promise<Committed<OnlineOrderActionResult>> => {
      const orderRef = db.collection(ONLINE_ORDERS).doc(orderId);
      const [orderSnap, settingsSnap] = await tx.getAll(orderRef, settingsRef(db));
      if (!orderSnap.exists) throw new ApiError(404, "Online order not found");
      const order = orderSnap.data() ?? {};
      const previousStatus = typeof order.status === "string" ? order.status : null;
      const linked = await findLinkedTransaction(tx, db, orderId);

      const changed = lowerStr(previousStatus) !== target;
      const base: Omit<OnlineOrderActionResult, "changed" | "status" | "paymentStatus"> = {
        orderId,
        previousStatus,
        transactionDocId: linked?.ref.id ?? null,
      };

      // --- With a transaction: the transaction's state machine decides. ---
      if (linked) {
        // Last read of the attempt: the customer whose points may move.
        const loyaltyCustomer = await readLoyaltyCustomer(tx, db, linked.data);
        const ctx: OrderContext = contextFrom({
          db,
          tx,
          actor,
          ref: linked.ref,
          data: linked.data,
          online: { id: orderId, ref: orderRef, exists: true, data: order },
          settings: settingsSnap.data(),
          loyaltyCustomer,
        });
        const txnState = stateOf(ctx);
        // Older online status changes never reached the transaction, so the
        // order document can be further along than its transaction says.
        const state = {
          ...txnState,
          fulfilment: furthestFulfilment(txnState.fulfilment, deriveOnlineOrderState(order).fulfilment),
        };
        assertCanApply("setOnlineStatus", state, { onlineTarget: target });

        // Built from the order as it will be once mirrored (paymentStatus may move).
        const events = (paymentStatus: string) =>
          changed ? [notifyPayload(orderId, order, target, paymentStatus)] : [];

        let cancellationRefundAmount: number | undefined;
        if (target === "cancelled") {
          const { refundAmount } = await cancelInContext(ctx, state, {
            action: SET_STATUS_ACTION,
            reason: "Cancelled from online orders",
            requestedOnlineStatus: "cancelled",
            customerEvents: () => events(mirroredPaymentStatus(ctx, orderRef, order)),
          });
          cancellationRefundAmount = refundAmount;
        } else if (target === "fully_returned" || target === "partially_returned") {
          finishAction(ctx, {
            action: SET_STATUS_ACTION,
            updates: { orderStatus: target },
            requestedOnlineStatus: target,
            details: { onlineStatus: target },
          });
        } else {
          const deliveryTarget = ONLINE_STATUS_TO_DELIVERY[target] as Exclude<DeliveryTarget, "cancelled">;
          const plan = planDeliveryChange(state, deliveryTarget);
          if (plan === "noop" && !changed) {
            return {
              result: {
                ...base,
                changed: false,
                status: previousStatus,
                paymentStatus: order.paymentStatus ?? null,
              },
              outboxIds: [],
            };
          }
          finishAction(ctx, {
            action: SET_STATUS_ACTION,
            updates: plan === "advance" ? deliveryUpdates(ctx, state, deliveryTarget) : {},
            requestedOnlineStatus: target,
            details: { onlineStatus: target },
            customerEvents: () => events(mirroredPaymentStatus(ctx, orderRef, order)),
          });
        }

        ctx.writes.commit(tx);
        return {
          result: {
            ...base,
            changed,
            status: target,
            paymentStatus: mirroredPaymentStatus(ctx, orderRef, order) || null,
            cancellationRefundAmount,
          },
          outboxIds: [...ctx.outboxIds],
        };
      }

      // --- No transaction yet: guard on the order's own fields. ---
      const state = deriveOnlineOrderState(order);
      assertCanApply("setOnlineStatus", state, { onlineTarget: target });
      if (!changed) {
        return {
          result: { ...base, changed: false, status: previousStatus, paymentStatus: order.paymentStatus ?? null },
          outboxIds: [],
        };
      }

      const now = Timestamp.now();
      const nowIso = now.toDate().toISOString();
      const update: Record<string, unknown> = { status: target, updatedAt: nowIso };
      let stock: { restocked: number; accounted: number; skippedReason?: string } | undefined;
      if (target === "cancelled") {
        const prepared = await readStockReturn(
          tx,
          db,
          onlineOrderReturnGuard(db, orderId),
          order,
          onlineOrderReturnLines(order),
        );
        stock = prepared.result;
        // The ledger and the status land in one update of the same document.
        writeStockReturnStock(tx, prepared);
        Object.assign(update, prepared.guardUpdates ?? {});
      }
      tx.update(orderRef, update);

      const outboxIds: string[] = [];
      const payload = notifyPayload(orderId, order, target, order.paymentStatus ?? "");
      if (payload) {
        const outboxRef = db.collection(NOTIFICATION_OUTBOX).doc();
        tx.create(
          outboxRef,
          outboxDocument(payload, { transactionId: null, onlineOrderId: orderId, action: SET_STATUS_ACTION }, now),
        );
        outboxIds.push(outboxRef.id);
      }

      appendAudit(
        tx,
        {
          action: SET_STATUS_ACTION,
          targetCollection: ONLINE_ORDERS,
          targetId: orderId,
          transactionId: typeof order.transactionId === "string" ? order.transactionId : null,
          actor,
          before: { status: previousStatus, paymentStatus: order.paymentStatus ?? null },
          after: { status: target, paymentStatus: order.paymentStatus ?? null },
          details: {
            onlineStatus: target,
            ...(stock ? { stock } : {}),
            ...(outboxIds.length > 0 ? { notificationOutboxIds: outboxIds } : {}),
          },
        },
        db,
      );
      return {
        result: { ...base, changed: true, status: target, paymentStatus: order.paymentStatus ?? null },
        outboxIds,
      };
    });
  } catch (error) {
    throw toApiError(error);
  }
}

/** paymentStatus the online order will have after this attempt's writes. */
function mirroredPaymentStatus(ctx: OrderContext, orderRef: DocumentReference, order: DocumentData): string {
  const mirrored = ctx.writes.pendingUpdate(orderRef);
  const value = (mirrored?.paymentStatus as string | undefined) ?? order.paymentStatus;
  return typeof value === "string" ? value : "";
}

/** Status change requested on the online-orders page. */
export async function setOnlineOrderStatus(
  db: Firestore,
  actor: VerifiedActor,
  orderId: string,
  target: OnlineStatusTarget,
): Promise<OnlineOrderActionResult> {
  const { result, outboxIds } = await setOnlineOrderStatusTx(db, actor, orderId, target);
  await deliverAfterCommit(db, outboxIds);
  return result;
}

/** Mark a COD order paid ("SUCCESS") or unpaid ("PENDING"), with its transaction. */
export async function setOnlineOrderPaymentStatus(
  db: Firestore,
  actor: VerifiedActor,
  orderId: string,
  paymentStatus: "SUCCESS" | "PENDING",
): Promise<OnlineOrderActionResult> {
  const paymentTarget = paymentStatus === "SUCCESS" ? "paid" : "unpaid";
  try {
    return await db.runTransaction(async (tx) => {
      const orderRef = db.collection(ONLINE_ORDERS).doc(orderId);
      const [orderSnap, settingsSnap] = await tx.getAll(orderRef, settingsRef(db));
      if (!orderSnap.exists) throw new ApiError(404, "Order not found");
      const order = orderSnap.data() ?? {};
      const linked = await findLinkedTransaction(tx, db, orderId);
      const previousStatus = typeof order.status === "string" ? order.status : null;
      const changed = order.paymentStatus !== paymentStatus;
      const nowIso = new Date().toISOString();

      if (linked) {
        const loyaltyCustomer = await readLoyaltyCustomer(tx, db, linked.data);
        const ctx = contextFrom({
          db,
          tx,
          actor,
          ref: linked.ref,
          data: linked.data,
          online: { id: orderId, ref: orderRef, exists: true, data: order },
          settings: settingsSnap.data(),
          loyaltyCustomer,
        });
        assertCanApply("setPaymentStatus", stateOf(ctx), { paymentTarget });
        ctx.writes.update(orderRef, { paymentStatus, updatedAt: nowIso });
        // Marking a COD order paid completes it, which is when its points are
        // awarded (finishAction). Marking it unpaid again leaves an award in
        // place; a later cancel or refund reverses it.
        finishAction(ctx, {
          action: "onlineOrder.setPaymentStatus",
          updates: {
            paymentStatus,
            status: paymentStatus === "SUCCESS" ? "completed" : "pending",
            updatedAt: nowIso,
          },
          forcePaymentStatus: true,
          details: { paymentStatus },
        });
        ctx.writes.commit(tx);
      } else {
        assertCanApply("setPaymentStatus", deriveOnlineOrderState(order), { paymentTarget });
        tx.update(orderRef, { paymentStatus, updatedAt: nowIso });
        appendAudit(
          tx,
          {
            action: "onlineOrder.setPaymentStatus",
            targetCollection: ONLINE_ORDERS,
            targetId: orderId,
            transactionId: typeof order.transactionId === "string" ? order.transactionId : null,
            actor,
            before: { status: previousStatus, paymentStatus: order.paymentStatus ?? null },
            after: { status: previousStatus, paymentStatus },
          },
          db,
        );
      }

      return {
        orderId,
        changed,
        previousStatus,
        status: previousStatus,
        paymentStatus,
        transactionDocId: linked?.ref.id ?? null,
      };
    });
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * One transaction per order, so one refused order does not block the rest.
 * Customer messages are delivered once all orders are done, in parallel and
 * within a time budget; the cron drain sends whatever is left.
 */
export async function setOnlineOrderStatuses(
  db: Firestore,
  actor: VerifiedActor,
  orderIds: string[],
  target: OnlineStatusTarget,
): Promise<BulkResult<OnlineOrderActionResult>> {
  const results: BulkResult<OnlineOrderActionResult>["results"] = [];
  const outboxIds: string[] = [];
  for (const id of orderIds) {
    try {
      const committed = await setOnlineOrderStatusTx(db, actor, id, target);
      outboxIds.push(...committed.outboxIds);
      results.push({ id, ok: true, data: committed.result });
    } catch (error) {
      if (!isApiError(error)) console.error(`Bulk status update failed for ${id}:`, error);
      results.push({
        id,
        ok: false,
        error: isApiError(error) ? error.message : "Failed to update this order",
        status: isApiError(error) ? error.status : 500,
      });
    }
  }
  if (outboxIds.length > 0) {
    try {
      await deliverOutboxItems(db, outboxIds, { budgetMs: 10_000, concurrency: 5 });
    } catch (error) {
      console.error("Bulk status: customer notification delivery failed:", error);
    }
  }
  const successCount = results.filter((r) => r.ok).length;
  return { successCount, failCount: results.length - successCount, results };
}
