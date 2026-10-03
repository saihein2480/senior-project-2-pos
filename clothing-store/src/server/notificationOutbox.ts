/**
 * Customer notification outbox (Admin SDK, server only).
 *
 * Order actions no longer hand a "notify" payload to the browser. Instead the
 * action's own Firestore transaction creates one `notificationOutbox/{id}`
 * document per customer message, so a committed status change always has its
 * message queued. After the commit the route tries to deliver it right away
 * (short timeout); whatever is still undelivered is retried by
 * GET/POST /api/cron/notification-outbox.
 *
 * Document
 *   {
 *     payload:  { customerId, type, order, reason?, refundAmount?, refundMethod?, skipInApp? },
 *     status:   "pending" | "sent" | "failed" | "dead",
 *     attempts: number,              // incremented when an attempt is claimed
 *     createdAt, nextAttemptAt,      // Timestamps; nextAttemptAt is removed once sent/dead
 *     source:   { transactionId, onlineOrderId?, action },
 *     leaseUntil?, leaseId?,         // set while one worker owns the attempt
 *     lastAttemptAt?, lastError?, sentAt?, deadAt?, duplicate?
 *   }
 *
 * Delivery is at-least-once: the outbox id is sent as `idempotencyKey`, and
 * the storefront's /api/notifications/dispatch records it in
 * `notificationDispatches/{key}` so a retry of an already-handled message is
 * answered `{ duplicate: true }` without messaging the customer again.
 *
 * Only documents with a due `nextAttemptAt` are ever queried, so the drain
 * needs nothing but the automatic single-field index.
 */

import { randomUUID } from "crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { stripUndefined } from "./serialize";

export const NOTIFICATION_OUTBOX = "notificationOutbox";
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 60_000;
export const OUTBOX_DELIVERY_TIMEOUT_MS = 5_000;
export const OUTBOX_BASE_BACKOFF_MS = 60_000;
export const OUTBOX_MAX_BACKOFF_MS = 6 * 60 * 60_000;
export const OUTBOX_DRAIN_LIMIT = 25;
const LAST_ERROR_MAX = 500;

export type OutboxStatus = "pending" | "sent" | "failed" | "dead";

/** One message for one customer, in the shape /api/notifications/dispatch accepts. */
export interface CustomerEventPayload {
  customerId: string;
  type: string;
  order: {
    orderRef: string;
    totalAmount: number;
    paymentMethod?: string;
    paymentStatus?: string;
    items?: Array<{ name: string; quantity: number }>;
  };
  reason?: string;
  refundAmount?: number;
  refundMethod?: string;
  /** The storefront already shows this event in the bell (derived from the order or a POS notification). */
  skipInApp?: boolean;
}

export interface OutboxSource {
  /** transactions/{id} document id, null for an online order without a transaction. */
  transactionId: string | null;
  onlineOrderId?: string | null;
  action: string;
}

/** The document an action creates (status pending, due now). */
export function outboxDocument(
  payload: CustomerEventPayload,
  source: OutboxSource,
  now: Timestamp,
): Record<string, unknown> {
  return {
    payload: stripUndefined(payload),
    status: "pending",
    attempts: 0,
    createdAt: now,
    nextAttemptAt: now,
    source: stripUndefined({
      transactionId: source.transactionId,
      onlineOrderId: source.onlineOrderId ?? undefined,
      action: source.action,
    }),
  };
}

/** 1 min, 2, 4, 8, … capped at 6 h. `attempts` = attempts made so far (≥ 1). */
export function backoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(OUTBOX_MAX_BACKOFF_MS, OUTBOX_BASE_BACKOFF_MS * 2 ** (n - 1));
}

export function trimError(message: unknown): string {
  const text = typeof message === "string" ? message : message instanceof Error ? message.message : String(message);
  return text.length > LAST_ERROR_MAX ? `${text.slice(0, LAST_ERROR_MAX - 1)}…` : text;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendOutcome {
  ok: boolean;
  /** The storefront had already handled this key. */
  duplicate?: boolean;
  /** Retrying cannot help (the payload was refused). */
  permanent?: boolean;
  status?: number;
  error?: string;
}

export type OutboxSender = (
  body: Record<string, unknown>,
  options: { idempotencyKey: string; timeoutMs: number },
) => Promise<SendOutcome>;

/** Same base URL resolution as src/lib/customerNotify.ts. */
function notifyBaseUrl(): string {
  return (
    process.env.CUSTOMER_NOTIFY_BASE_URL ||
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
}

/** POST to the storefront's /api/notifications/dispatch. Never throws. */
export const sendToStorefront: OutboxSender = async (body, { idempotencyKey, timeoutMs }) => {
  const secret = process.env.NOTIFY_API_SECRET;
  if (!secret) {
    return { ok: false, error: "NOTIFY_API_SECRET is not set, so customer notifications are disabled." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${notifyBaseUrl()}/api/notifications/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notify-secret": secret,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ ...body, idempotencyKey }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { ok: true, status: response.status, duplicate: data?.duplicate === true };
    const error = typeof data?.error === "string" ? data.error : `Notification service returned ${response.status}`;
    // 400 = the storefront refused the payload itself; sending it again won't change that.
    return { ok: false, status: response.status, permanent: response.status === 400, error };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? `Notification service timed out after ${timeoutMs} ms` : trimError(error) };
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Claim / complete
// ---------------------------------------------------------------------------

export interface ClaimedItem {
  ref: DocumentReference;
  leaseId: string;
  attempts: number;
  payload: Record<string, unknown>;
}

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/**
 * Take the lease on one item, in a transaction, so two drains (or a drain
 * and the post-commit attempt) never send it at the same time. Returns null
 * when it is not due, already leased, or finished.
 */
export async function claimOutboxItem(
  db: Firestore,
  ref: DocumentReference,
  options: { leaseMs?: number; nowMs?: number } = {},
): Promise<ClaimedItem | null> {
  const leaseMs = options.leaseMs ?? OUTBOX_LEASE_MS;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    const nowMs = options.nowMs ?? Date.now();
    if (data.status !== "pending" && data.status !== "failed") return null;
    const leaseUntil = millis(data.leaseUntil);
    if (leaseUntil !== null && leaseUntil > nowMs) return null;
    const due = millis(data.nextAttemptAt);
    if (due === null || due > nowMs) return null;

    const attempts = Math.max(0, Number(data.attempts) || 0) + 1;
    const leaseId = randomUUID();
    const until = Timestamp.fromMillis(nowMs + leaseMs);
    tx.update(ref, {
      leaseId,
      leaseUntil: until,
      // A crashed worker's item becomes due again once the lease runs out.
      nextAttemptAt: until,
      attempts,
      lastAttemptAt: Timestamp.fromMillis(nowMs),
    });
    return { ref, leaseId, attempts, payload: (data.payload ?? {}) as Record<string, unknown> };
  });
}

export type DeliveryOutcome = "sent" | "failed" | "dead" | "skipped" | "lease_lost";

/** Record the attempt's result, if this worker still holds the lease. */
export async function completeOutboxItem(
  db: Firestore,
  claim: ClaimedItem,
  outcome: SendOutcome,
  nowMs: number = Date.now(),
): Promise<DeliveryOutcome> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(claim.ref);
    if (!snap.exists || snap.data()?.leaseId !== claim.leaseId) return "lease_lost";
    const now = Timestamp.fromMillis(nowMs);
    const release = { leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete(), updatedAt: now };

    if (outcome.ok) {
      tx.update(claim.ref, {
        ...release,
        status: "sent",
        sentAt: now,
        nextAttemptAt: FieldValue.delete(),
        lastError: FieldValue.delete(),
        ...(outcome.duplicate ? { duplicate: true } : {}),
      });
      return "sent";
    }

    const lastError = trimError(outcome.error || "Delivery failed");
    if (outcome.permanent || claim.attempts >= OUTBOX_MAX_ATTEMPTS) {
      tx.update(claim.ref, {
        ...release,
        status: "dead",
        deadAt: now,
        nextAttemptAt: FieldValue.delete(),
        lastError,
      });
      return "dead";
    }

    tx.update(claim.ref, {
      ...release,
      status: "failed",
      nextAttemptAt: Timestamp.fromMillis(nowMs + backoffMs(claim.attempts)),
      lastError,
    });
    return "failed";
  });
}

export interface DeliverOptions {
  send?: OutboxSender;
  timeoutMs?: number;
  leaseMs?: number;
}

/** Claim, send, record. Never throws. */
export async function deliverOutboxItem(
  db: Firestore,
  id: string,
  options: DeliverOptions = {},
): Promise<DeliveryOutcome> {
  const ref = db.collection(NOTIFICATION_OUTBOX).doc(id);
  try {
    const claim = await claimOutboxItem(db, ref, { leaseMs: options.leaseMs });
    if (!claim) return "skipped";
    let outcome: SendOutcome;
    try {
      outcome = await (options.send ?? sendToStorefront)(claim.payload, {
        idempotencyKey: id,
        timeoutMs: options.timeoutMs ?? OUTBOX_DELIVERY_TIMEOUT_MS,
      });
    } catch (error) {
      outcome = { ok: false, error: trimError(error) };
    }
    const result = await completeOutboxItem(db, claim, outcome);
    if (result !== "sent") {
      console.warn(`Customer notification ${id}: ${result}${outcome.error ? ` (${trimError(outcome.error)})` : ""}`);
    }
    return result;
  } catch (error) {
    console.error(`Customer notification ${id}: delivery attempt crashed:`, error);
    return "skipped";
  }
}

export interface DeliverManyOptions extends DeliverOptions {
  concurrency?: number;
  /** Stop starting new deliveries after this long; the rest wait for the drain. */
  budgetMs?: number;
}

/** Deliver several items with bounded concurrency and an overall time budget. Never throws. */
export async function deliverOutboxItems(
  db: Firestore,
  ids: string[],
  options: DeliverManyOptions = {},
): Promise<Record<string, DeliveryOutcome | "deferred">> {
  const results: Record<string, DeliveryOutcome | "deferred"> = {};
  const queue = Array.from(new Set(ids.filter(Boolean)));
  if (queue.length === 0) return results;
  const deadline = Date.now() + (options.budgetMs ?? 8_000);
  const workers = Math.max(1, Math.min(options.concurrency ?? 5, queue.length));

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        if (Date.now() >= deadline) {
          results[id] = "deferred";
          continue;
        }
        results[id] = await deliverOutboxItem(db, id, options);
      }
    }),
  );
  return results;
}

/** Post-commit attempt used by the order actions. Never throws, never blocks long. */
export async function deliverAfterCommit(db: Firestore, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await deliverOutboxItems(db, ids, { budgetMs: 8_000 });
  } catch (error) {
    console.error("Post-commit customer notification delivery failed:", error);
  }
}

export interface DrainSummary {
  scanned: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
  deferred: number;
}

/** Process due items (oldest first). Concurrent drains are safe: each item is leased. */
export async function drainNotificationOutbox(
  db: Firestore,
  options: DeliverManyOptions & { limit?: number } = {},
): Promise<DrainSummary> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? OUTBOX_DRAIN_LIMIT)));
  const due = await db
    .collection(NOTIFICATION_OUTBOX)
    .where("nextAttemptAt", "<=", Timestamp.now())
    .orderBy("nextAttemptAt", "asc")
    .limit(limit)
    .get();

  const ids = due.docs
    .filter((doc) => {
      const status = doc.get("status");
      return status === "pending" || status === "failed";
    })
    .map((doc) => doc.id);

  const results = await deliverOutboxItems(db, ids, { budgetMs: 45_000, ...options });
  const summary: DrainSummary = { scanned: due.size, sent: 0, failed: 0, dead: 0, skipped: 0, deferred: 0 };
  for (const outcome of Object.values(results)) {
    if (outcome === "sent") summary.sent++;
    else if (outcome === "failed") summary.failed++;
    else if (outcome === "dead") summary.dead++;
    else if (outcome === "deferred") summary.deferred++;
    else summary.skipped++;
  }
  return summary;
}
