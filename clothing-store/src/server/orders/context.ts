/**
 * Shared plumbing for the order actions: load an order inside a Firestore
 * transaction, prepare its stock return, and finish an action by writing the
 * action's fields + the coherent legacy status fields + the onlineOrders
 * mirror + stock/ledger + notifications + the audit entry, all in that same
 * transaction.
 */

import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  auditSnapshot,
  deriveOrderState,
  isOrderStateError,
  legacyStatusFields,
  onlineOrderMirrorFields,
  type OrderState,
} from "@/lib/orderState";
import { ApiError } from "@/server/errors";
import { appendAudit, type VerifiedActor } from "@/server/auditLog";
import {
  customerRef,
  customerUpdateFor,
  loyaltyAuditDetails,
  loyaltyCustomerFromSnapshot,
  loyaltyCustomerId,
  planLoyaltyChanges,
  type LoyaltyCustomerDoc,
  type LoyaltySettingsLike,
} from "@/server/loyaltyAdmin";
import {
  NOTIFICATION_OUTBOX,
  outboxDocument,
  type CustomerEventPayload,
} from "@/server/notificationOutbox";
import {
  readStockReturn,
  selectTransactionReturnGuard,
  transactionReturnLines,
  writeStockReturnStock,
  type PreparedStockReturn,
} from "@/server/stockReturnsAdmin";
import { TxWriteSet, withUpdates } from "./txWrites";
import type { OrderStatusSnapshot } from "./types";

export const TRANSACTIONS = "transactions";
export const ONLINE_ORDERS = "onlineOrders";
export const NOTIFICATIONS = "notifications";

export interface LoadedDoc {
  id: string;
  ref: DocumentReference;
  exists: boolean;
  data: DocumentData | null;
}

export interface OrderContext {
  db: Firestore;
  tx: Transaction;
  actor: VerifiedActor;
  id: string;
  ref: DocumentReference;
  data: DocumentData;
  online: LoadedDoc | null;
  refundTaxOnReturns: boolean;
  /** business_settings/main.loyaltySettings. */
  loyaltySettings: LoyaltySettingsLike | null;
  /** customers/{id} whose points this order moves (read with the order). */
  loyaltyCustomer: LoyaltyCustomerDoc | null;
  writes: TxWriteSet;
  /** notificationOutbox ids queued by this attempt (delivered after commit). */
  outboxIds: string[];
  now: Timestamp;
  nowIso: string;
}

/** Fields the legacy writer owns; an action's own value for them is only an intent. */
const LEGACY_KEYS = ["status", "orderStatus", "paymentStatus", "deliveryStatus"] as const;

export function settingsRef(db: Firestore): DocumentReference {
  return db.collection("business_settings").doc("main");
}

export function readRefundTaxSetting(data: DocumentData | undefined | null): boolean {
  return data?.refundTaxOnReturns === true;
}

export function readLoyaltySettings(data: DocumentData | undefined | null): LoyaltySettingsLike | null {
  const value = data?.loyaltySettings;
  return value && typeof value === "object" ? (value as LoyaltySettingsLike) : null;
}

/** Build a context from documents already read in this transaction. */
export function contextFrom(params: {
  db: Firestore;
  tx: Transaction;
  actor: VerifiedActor;
  ref: DocumentReference;
  data: DocumentData;
  online: LoadedDoc | null;
  /** business_settings/main as read in this transaction. */
  settings: DocumentData | null | undefined;
  /** From readLoyaltyCustomer, read before any write. */
  loyaltyCustomer: LoyaltyCustomerDoc | null;
}): OrderContext {
  const now = Timestamp.now();
  const { settings, ...rest } = params;
  return {
    ...rest,
    refundTaxOnReturns: readRefundTaxSetting(settings),
    loyaltySettings: readLoyaltySettings(settings),
    id: params.ref.id,
    writes: new TxWriteSet(),
    outboxIds: [],
    now,
    nowIso: now.toDate().toISOString(),
  };
}

/**
 * Fresh read of transactions/{id}, its onlineOrders document (when it has an
 * onlineOrderId) and business_settings/main.
 */
export async function loadTransactionContext(
  db: Firestore,
  tx: Transaction,
  actor: VerifiedActor,
  id: string,
): Promise<OrderContext> {
  const ref = db.collection(TRANSACTIONS).doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new ApiError(404, "Transaction not found");
  const data = snap.data() ?? {};

  const onlineOrderId =
    typeof data.onlineOrderId === "string" && data.onlineOrderId.trim() ? data.onlineOrderId.trim() : null;
  const customerId = loyaltyCustomerId(data);
  const onlineRef = onlineOrderId ? db.collection(ONLINE_ORDERS).doc(onlineOrderId) : null;
  const loyaltyRef = customerId ? customerRef(db, customerId) : null;
  const refs: DocumentReference[] = [settingsRef(db)];
  if (onlineRef) refs.push(onlineRef);
  if (loyaltyRef) refs.push(loyaltyRef);
  const snaps = await tx.getAll(...refs);
  const settingsSnap = snaps[0];
  const onlineSnap = onlineRef ? snaps[1] : undefined;
  const customerSnap = loyaltyRef ? snaps[onlineRef ? 2 : 1] : undefined;

  const online: LoadedDoc | null =
    onlineOrderId && onlineSnap
      ? {
          id: onlineOrderId,
          ref: onlineSnap.ref,
          exists: onlineSnap.exists,
          data: onlineSnap.exists ? (onlineSnap.data() ?? {}) : null,
        }
      : null;

  return contextFrom({
    db,
    tx,
    actor,
    ref,
    data,
    online,
    settings: settingsSnap?.data(),
    loyaltyCustomer:
      customerId && loyaltyRef ? loyaltyCustomerFromSnapshot(customerId, loyaltyRef, customerSnap) : null,
  });
}

export function stateOf(ctx: OrderContext, data: DocumentData = ctx.data): OrderState {
  return deriveOrderState(data, { refundTaxOnReturns: ctx.refundTaxOnReturns });
}

/** Read phase of a stock return for this transaction's lines. */
export async function prepareTransactionStock(
  ctx: OrderContext,
  lines: Array<{ lineIndex: number; quantity: number; restock: boolean }>,
): Promise<PreparedStockReturn> {
  const guard = selectTransactionReturnGuard(
    ctx.db,
    ctx.id,
    ctx.data,
    ctx.online ? { id: ctx.online.id, exists: ctx.online.exists } : null,
  );
  const guardData = guard.collection === ONLINE_ORDERS ? (ctx.online?.data ?? null) : ctx.data;
  return readStockReturn(ctx.tx, ctx.db, guard, guardData, transactionReturnLines(ctx.data, lines));
}

export interface FinishOptions {
  action: string;
  /** The action's own fields (field paths allowed). Legacy status keys are intents. */
  updates: Record<string, unknown>;
  prepared?: PreparedStockReturn | null;
  forcePaymentStatus?: boolean;
  /** Exact status picked on the online-orders page. */
  requestedOnlineStatus?: string;
  reason?: string | null;
  details?: Record<string, unknown>;
  /** In-app `notifications` documents (POS bell / storefront bell). */
  notifications?: Array<Record<string, unknown> | null>;
  /**
   * Customer email/Telegram messages, queued in `notificationOutbox` in this
   * transaction. A function receives the order as it will be after the action.
   */
  customerEvents?:
    | Array<CustomerEventPayload | null>
    | ((after: DocumentData, state: OrderState) => Array<CustomerEventPayload | null>);
}

export interface FinishResult {
  after: DocumentData;
  state: OrderState;
  snapshot: OrderStatusSnapshot;
}

/** Queue customer messages in the outbox as part of this transaction. */
export function queueCustomerEvents(
  ctx: Pick<OrderContext, "db" | "writes" | "outboxIds" | "now" | "id" | "online">,
  events: Array<CustomerEventPayload | null>,
  action: string,
  transactionId: string | null = ctx.id,
): void {
  for (const payload of events) {
    if (!payload) continue;
    const ref = ctx.db.collection(NOTIFICATION_OUTBOX).doc();
    ctx.writes.create(
      ref,
      outboxDocument(payload, { transactionId, onlineOrderId: ctx.online?.id ?? null, action }, ctx.now),
    );
    ctx.outboxIds.push(ref.id);
  }
}

/**
 * Write phase of an action. Call once, after every read of the attempt.
 * Queues the writes on `ctx.writes` (committed by the runner) and appends
 * the audit entry. Loyalty (award on approval/delivery, reversal on cancel or
 * refund, coupon give-back) is derived here from the order before and after,
 * so every action path gets the same rules.
 */
export function finishAction(ctx: OrderContext, options: FinishOptions): FinishResult {
  const intended = withUpdates(ctx.data, options.updates);
  const legacy = legacyStatusFields(ctx.data, intended, {
    refundTaxOnReturns: ctx.refundTaxOnReturns,
    forcePaymentStatus: options.forcePaymentStatus,
  });

  const own: Record<string, unknown> = { ...options.updates };
  for (const key of LEGACY_KEYS) delete own[key];
  const txnUpdate = { ...own, ...legacy };
  let after = withUpdates(ctx.data, txnUpdate);
  const state = stateOf(ctx, after);

  const loyalty = planLoyaltyChanges({
    docId: ctx.id,
    before: ctx.data,
    after,
    beforeState: stateOf(ctx),
    afterState: state,
    settings: ctx.loyaltySettings,
    customer: ctx.loyaltyCustomer,
    now: ctx.now,
    action: options.action,
  });
  Object.assign(txnUpdate, loyalty.txnUpdates);
  after = withUpdates(after, loyalty.txnUpdates);
  const customerUpdate = customerUpdateFor(loyalty);
  if (customerUpdate && ctx.loyaltyCustomer) ctx.writes.update(ctx.loyaltyCustomer.ref, customerUpdate);
  const loyaltyDetails = loyaltyAuditDetails(loyalty);

  ctx.writes.update(ctx.ref, txnUpdate);

  if (ctx.online?.exists && ctx.online.data) {
    const mirror = onlineOrderMirrorFields(ctx.online.data, state, legacy, {
      requestedStatus: options.requestedOnlineStatus,
      now: ctx.nowIso,
    });
    ctx.writes.update(ctx.online.ref, mirror);
  }

  if (options.prepared) {
    writeStockReturnStock(ctx.tx, options.prepared);
    ctx.writes.update(options.prepared.guard.ref, options.prepared.guardUpdates);
  }

  for (const notification of options.notifications ?? []) {
    if (notification) ctx.writes.create(ctx.db.collection(NOTIFICATIONS).doc(), notification);
  }

  const events =
    typeof options.customerEvents === "function"
      ? options.customerEvents(after, state)
      : (options.customerEvents ?? []);
  const queuedBefore = ctx.outboxIds.length;
  queueCustomerEvents(ctx, events, options.action);
  const queued = ctx.outboxIds.slice(queuedBefore);

  appendAudit(
    ctx.tx,
    {
      action: options.action,
      targetCollection: TRANSACTIONS,
      targetId: ctx.id,
      transactionId: typeof ctx.data.transactionId === "string" ? ctx.data.transactionId : null,
      actor: ctx.actor,
      reason: options.reason ?? null,
      before: auditSnapshot(ctx.data),
      after: auditSnapshot(after),
      details: {
        ...(options.details ?? {}),
        ...(options.prepared ? { stock: options.prepared.result } : {}),
        ...(ctx.online?.exists ? { onlineOrderId: ctx.online.id } : {}),
        ...(loyaltyDetails ? { loyalty: loyaltyDetails } : {}),
        ...(queued.length > 0 ? { notificationOutboxIds: queued } : {}),
      },
    },
    ctx.db,
  );

  return { after, state, snapshot: snapshotOf(ctx.id, after) };
}

export function snapshotOf(id: string, data: DocumentData): OrderStatusSnapshot {
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    id,
    transactionId: str(data.transactionId),
    status: str(data.status),
    orderStatus: str(data.orderStatus),
    paymentStatus: str(data.paymentStatus),
    deliveryStatus: str(data.deliveryStatus),
  };
}

/** OrderStateError -> ApiError with its status (409 / 404 / 400). */
export function toApiError(error: unknown): unknown {
  if (isOrderStateError(error)) return new ApiError(error.httpStatus, error.message);
  return error;
}

/**
 * Run `fn` in one Firestore transaction on a freshly loaded transaction
 * document, then commit the queued writes. Retries (contention) re-read
 * everything, so every guard sees current data. `outboxIds` are the
 * customer messages the committed attempt queued.
 */
export async function runOnTransaction<T>(
  db: Firestore,
  actor: VerifiedActor,
  id: string,
  fn: (ctx: OrderContext) => Promise<T>,
): Promise<{ result: T; outboxIds: string[] }> {
  try {
    return await db.runTransaction(async (tx) => {
      const ctx = await loadTransactionContext(db, tx, actor, id);
      const result = await fn(ctx);
      ctx.writes.commit(tx);
      return { result, outboxIds: [...ctx.outboxIds] };
    });
  } catch (error) {
    throw toApiError(error);
  }
}
