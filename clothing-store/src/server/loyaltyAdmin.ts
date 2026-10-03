/**
 * Loyalty points lifecycle on the server (Admin SDK, server only).
 *
 * Policy
 *   - Points are earned on what was bought, never on delivery:
 *       basis = max(0, total − deliveryFee)   (the transaction's stored THB figures)
 *     and, exactly like the legacy LoyaltyService.awardPoints, a purchase whose
 *     basis reaches `loyaltySettings.minimumSpendAmount` earns
 *     `loyaltySettings.pointsPerPurchase` (business_settings/main.loyaltySettings).
 *   - They are awarded when the sale is real: a walk-in sale once it is
 *     completed (POST /api/transactions/[id]/award-loyalty for cash sales, the
 *     approve/delivered transition for pending scan/COD sales), an online COD
 *     order when it is approved or delivered, an MMPay order when the payment
 *     succeeds (storefront webhook).
 *   - The award is recorded on the transaction as `loyaltyAward` (Admin SDK
 *     only). A transaction with a `loyaltyAward` is never awarded again.
 *   - Cancelling reverses every awarded point that is left; refunds reverse
 *     floor(awarded × refunded goods share), cumulatively, capped at the award.
 *     Reversals are recorded in `loyaltyReversed`. The customer's balance never
 *     goes below 0; what could not be taken back is kept as `shortfall`.
 *   - Coupons the customer already holds are never clawed back.
 *   - A coupon spent on an order that is cancelled before the sale happened
 *     (never paid) is given back, with the points it cost.
 *
 * Legacy orders (before `loyaltyAward` existed) were awarded by the browser /
 * storefront at placement and only left a `customers/{uid}.pointsHistory[]`
 * entry whose `transactionId` is the receipt number (TXN-…; for MMPay orders
 * the document id). Such an entry counts as the award: it is never awarded a
 * second time and it is what a cancel/refund reverses.
 *
 * The first half of this file is pure (no Firestore I/O) so it can be unit
 * tested; the second half reads/writes inside the caller's transaction.
 */

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { OrderState } from "@/lib/orderState";
import { exceedsMoney, nonNegativeMoney, roundTo, sumMoney } from "@/lib/money";

export const CUSTOMERS_COLLECTION = "customers";

/** Keep the reversal log on the transaction bounded. */
const MAX_REVERSAL_ENTRIES = 20;

// ---------------------------------------------------------------------------
// Contract (shared with the storefront webhook)
// ---------------------------------------------------------------------------

export type LoyaltyAwardSource = "pos_sale" | "pos_approval" | "online_payment" | "cod_delivery";

/** transactions/{id}.loyaltyAward */
export interface LoyaltyAwardMarker {
  points: number;
  /** max(0, total − deliveryFee) in THB at award time. */
  basis: number;
  customerId: string;
  awardedAt: Timestamp;
  source: LoyaltyAwardSource;
}

export interface LoyaltyReversalEntry {
  /** Points this step accounted as reversed. */
  points: number;
  /** Points actually taken off the balance. */
  applied: number;
  /** points − applied (the balance was too low). */
  shortfall: number;
  reason: "cancelled" | "refund";
  action: string;
  at: Timestamp;
}

/** transactions/{id}.loyaltyReversed (cumulative). */
export interface LoyaltyReversedMarker {
  points: number;
  appliedPoints: number;
  shortfall: number;
  lastReversedAt: Timestamp;
  customerId: string;
  /** Set when the reversed award was a legacy pointsHistory entry (no loyaltyAward). */
  legacyAward?: { points: number; historyEntryIds: string[] };
  entries: LoyaltyReversalEntry[];
}

export interface LoyaltySettingsLike {
  enabled?: unknown;
  minimumSpendAmount?: unknown;
  pointsPerPurchase?: unknown;
  couponPackages?: unknown;
  pointsForCoupon?: unknown;
}

// ---------------------------------------------------------------------------
// Pure calculators
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Points are earned on goods: max(0, total − deliveryFee), rounded to satang. */
export function loyaltyBasis(txn: { total?: unknown; deliveryFee?: unknown }): number {
  return nonNegativeMoney(num(txn.total) - num(txn.deliveryFee));
}

export type NoAwardReason = "loyalty_disabled" | "below_minimum" | "no_points_configured";

/**
 * Points a purchase of `basis` earns, mirroring LoyaltyService.awardPoints:
 * loyalty enabled and basis ≥ minimumSpendAmount → pointsPerPurchase.
 */
export function pointsForPurchase(
  basis: number,
  settings: LoyaltySettingsLike | null | undefined,
): { points: number; reason?: NoAwardReason } {
  if (!settings || !settings.enabled) return { points: 0, reason: "loyalty_disabled" };
  const minimumRaw = Number(settings.minimumSpendAmount);
  const minimum = Number.isFinite(minimumRaw) && minimumRaw > 0 ? minimumRaw : 0;
  if (!(basis > 0) || exceedsMoney(minimum, basis)) return { points: 0, reason: "below_minimum" };
  const perPurchase = Number(settings.pointsPerPurchase);
  if (!Number.isFinite(perPurchase) || perPurchase <= 0) {
    return { points: 0, reason: "no_points_configured" };
  }
  return { points: perPurchase };
}

/** The ids a legacy pointsHistory entry may carry for this transaction. */
export function transactionKeys(txn: DocumentData, docId: string): string[] {
  const keys = new Set<string>();
  if (typeof txn.transactionId === "string" && txn.transactionId.trim()) keys.add(txn.transactionId.trim());
  if (docId) keys.add(docId);
  return Array.from(keys);
}

export interface LegacyAward {
  points: number;
  historyEntryIds: string[];
}

/** Points the legacy client/storefront code awarded for this transaction, from pointsHistory. */
export function legacyAwardFromHistory(history: unknown, keys: string[]): LegacyAward | null {
  if (!Array.isArray(history) || keys.length === 0) return null;
  const wanted = new Set(keys);
  let points = 0;
  const historyEntryIds: string[] = [];
  for (const entry of history) {
    if (!isRecord(entry)) continue;
    if (typeof entry.transactionId !== "string" || !wanted.has(entry.transactionId)) continue;
    const earned = num(entry.pointsEarned);
    if (earned <= 0) continue;
    points += earned;
    historyEntryIds.push(String(entry.id ?? ""));
  }
  return points > 0 ? { points: roundTo(points, 6), historyEntryIds } : null;
}

/** A usable loyaltyAward marker, or null. */
export function readAwardMarker(value: unknown): { points: number; customerId: string | null; basis: number } | null {
  if (!isRecord(value)) return null;
  return {
    points: Math.max(0, num(value.points)),
    customerId: typeof value.customerId === "string" && value.customerId ? value.customerId : null,
    basis: Math.max(0, num(value.basis)),
  };
}

/**
 * Share (0..1) of the goods that has been refunded, tax-neutral: refunded
 * goods net of discount / goods net of discount. Same as "refunded goods
 * amount / basis" with both measured on the same footing, so an order whose
 * tax was not refunded still reaches 1 when every unit came back. Rejected
 * refunds don't count; pending ones (payout not confirmed yet) do.
 */
export function refundedGoodsShare(txn: DocumentData, state: OrderState): number {
  if (state.refund === "full") return 1;
  const goodsNet = state.money.goodsNet;
  if (!(goodsNet > 0)) return 0;
  const refunds = Array.isArray(txn.refunds) ? (txn.refunds as unknown[]) : [];
  const refundedNet = sumMoney(
    refunds
      .filter((r): r is Record<string, unknown> => isRecord(r) && lower(r.status) !== "rejected")
      .map((r) => Math.max(0, num(r.totalAmount) - num(r.taxRefund))),
  );
  return Math.min(1, Math.max(0, refundedNet / goodsNet));
}

/** Points that should be reversed in total: all on cancel, floor(awarded × share) otherwise. */
export function reversalTarget(awarded: number, cancelled: boolean, share: number): number {
  if (!(awarded > 0)) return 0;
  if (cancelled) return awarded;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  // roundTo absorbs float noise such as 3 × (1/3) = 0.9999999.
  return Math.min(awarded, Math.floor(roundTo(awarded * clamped, 6)));
}

/** Take `target − alreadyReversed` off `balance`, never below 0. */
export function applyReversal(params: { target: number; alreadyReversed: number; balance: number }): {
  delta: number;
  applied: number;
  shortfall: number;
  balance: number;
} {
  const delta = Math.max(0, roundTo(params.target - Math.max(0, params.alreadyReversed), 6));
  const available = Math.max(0, num(params.balance));
  const applied = Math.min(delta, available);
  return {
    delta,
    applied,
    shortfall: roundTo(delta - applied, 6),
    balance: roundTo(available - applied, 6),
  };
}

function returned(fulfilment: OrderState["fulfilment"]): boolean {
  return fulfilment === "partially_returned" || fulfilment === "fully_returned";
}

/**
 * Did this action make the sale real? Approved (left "awaiting approval") or
 * delivered, and the order is still live.
 */
export function isAwardTransition(before: OrderState, after: OrderState): boolean {
  if (after.cancelled || after.awaitingApproval || after.refund === "full") return false;
  const approvedNow = before.awaitingApproval;
  const deliveredNow =
    after.fulfilment === "delivered" && before.fulfilment !== "delivered" && !returned(before.fulfilment);
  return approvedNow || deliveredNow;
}

export function awardSourceFor(state: OrderState): LoyaltyAwardSource {
  if (state.channel === "walk_in") return "pos_approval";
  return state.paymentMethod === "cod" ? "cod_delivery" : "online_payment";
}

/** What a coupon cost, as the code that spent it resolved it. */
export function couponPointsCost(
  coupon: Record<string, unknown>,
  settings: LoyaltySettingsLike | null | undefined,
  channel: OrderState["channel"],
): number {
  if (typeof coupon.pointsCost === "number" && Number.isFinite(coupon.pointsCost)) {
    return Math.max(0, coupon.pointsCost);
  }
  // The POS (LoyaltyService.redeemCoupon) deducted nothing for coupons without
  // pointsCost; the storefront (CouponService.useCouponAdmin) fell back to the
  // issuing package, then the legacy global cost.
  if (channel !== "online") return 0;
  if (typeof coupon.packageId === "string" && Array.isArray(settings?.couponPackages)) {
    const pkg = (settings.couponPackages as unknown[]).find(
      (p): p is Record<string, unknown> => isRecord(p) && p.id === coupon.packageId,
    );
    if (pkg && typeof pkg.pointsRequired === "number") return Math.max(0, pkg.pointsRequired);
  }
  return typeof settings?.pointsForCoupon === "number" ? Math.max(0, settings.pointsForCoupon) : 0;
}

function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export interface CouponRestorePlan {
  index: number;
  couponId: string;
  /** The coupon as it should be stored again. */
  coupon: Record<string, unknown>;
  /** Points to give back (what using the coupon took). */
  points: number;
}

/**
 * The coupon this order consumed, restored, when the order is being cancelled
 * and the sale never happened (no money received). The coupon must be marked
 * `used` with `usedInTransaction` = this order, which is how both apps record
 * a spent coupon.
 */
export function planCouponRestore(params: {
  txn: DocumentData;
  docId: string;
  before: OrderState;
  after: OrderState;
  coupons: unknown;
  settings: LoyaltySettingsLike | null | undefined;
  now: Timestamp;
}): CouponRestorePlan | null {
  const { txn, before, after } = params;
  if (!after.cancelled || before.cancelled || before.moneyReceived) return null;
  if (isRecord(txn.couponRestored)) return null;
  const couponId = typeof txn.couponId === "string" ? txn.couponId : "";
  if (!couponId || !Array.isArray(params.coupons)) return null;

  const keys = new Set(transactionKeys(txn, params.docId));
  const index = (params.coupons as unknown[]).findIndex(
    (c) =>
      isRecord(c) &&
      c.id === couponId &&
      lower(c.status) === "used" &&
      typeof c.usedInTransaction === "string" &&
      keys.has(c.usedInTransaction),
  );
  if (index < 0) return null;

  const original = (params.coupons as Record<string, unknown>[])[index];
  const expiresAt = toMillis(original.expiresAt);
  const expired = expiresAt !== null && expiresAt < params.now.toMillis();
  const coupon: Record<string, unknown> = {
    ...original,
    status: expired ? "expired" : "active",
    inUse: false,
    restoredAt: params.now,
    restoredFromTransaction: original.usedInTransaction,
  };
  delete coupon.usedAt;
  delete coupon.usedInTransaction;

  return {
    index,
    couponId,
    coupon,
    points: couponPointsCost(original, params.settings, before.channel),
  };
}

export interface LoyaltyCustomerSnapshot {
  id: string;
  exists: boolean;
  data: DocumentData | null;
}

export interface LoyaltyPlanInput {
  docId: string;
  before: DocumentData;
  after: DocumentData;
  beforeState: OrderState;
  afterState: OrderState;
  settings: LoyaltySettingsLike | null | undefined;
  customer: LoyaltyCustomerSnapshot | null;
  now: Timestamp;
  action: string;
  /** award-loyalty route: award a completed sale without waiting for a transition. */
  forceAwardSource?: LoyaltyAwardSource;
  /** For tests; random otherwise. */
  historyEntryId?: string;
}

export type AwardSkipReason =
  | NoAwardReason
  | "already_awarded"
  | "legacy_awarded"
  | "no_customer"
  | "customer_not_found";

export interface LoyaltyPlan {
  /** Fields for transactions/{id} (loyaltyAward / loyaltyReversed / couponRestored). */
  txnUpdates: Record<string, unknown>;
  /** Absolute values for customers/{id}; historyEntry is appended with arrayUnion. */
  customer: { id: string; update: Record<string, unknown>; historyEntry?: Record<string, unknown> } | null;
  award: { points: number; basis: number; source: LoyaltyAwardSource } | null;
  /** Only when the action was an award trigger and nothing was awarded. */
  awardSkipped: AwardSkipReason | null;
  reversal: { delta: number; applied: number; shortfall: number; reason: "cancelled" | "refund" } | null;
  couponRestore: { couponId: string; points: number } | null;
  /** The award being reversed (if any) was a legacy pointsHistory entry. */
  legacy: boolean;
}

function historyDescription(source: LoyaltyAwardSource, txn: DocumentData): string {
  const branch = (typeof txn.branchName === "string" && txn.branchName) || "POS";
  const orderRef = (typeof txn.onlineOrderId === "string" && txn.onlineOrderId) || txn.transactionId || "";
  switch (source) {
    case "pos_sale":
      return `Purchase at ${branch}`;
    case "pos_approval":
      return `Purchase at ${branch} (approved)`;
    case "cod_delivery":
      return `Online COD order ${orderRef}`.trim();
    default:
      return `Online payment for order ${orderRef}`.trim();
  }
}

/**
 * Everything one action does to loyalty, from documents already read in the
 * transaction. Award first (if this action is a trigger), then the coupon
 * restore, then the reversal, so the balance clamp sees the final numbers.
 */
export function planLoyaltyChanges(input: LoyaltyPlanInput): LoyaltyPlan {
  const { before, after, beforeState, afterState, customer, now } = input;
  const plan: LoyaltyPlan = {
    txnUpdates: {},
    customer: null,
    award: null,
    awardSkipped: null,
    reversal: null,
    couponRestore: null,
    legacy: false,
  };

  const marker = readAwardMarker(before.loyaltyAward);
  const reversedBefore = isRecord(before.loyaltyReversed) ? before.loyaltyReversed : null;
  const customerData = customer?.exists ? (customer.data ?? {}) : null;
  const keys = transactionKeys(before, input.docId);

  let legacy: LegacyAward | null = null;
  if (!marker) {
    legacy = legacyAwardFromHistory(customerData?.pointsHistory, keys);
    const recorded = isRecord(reversedBefore?.legacyAward) ? reversedBefore.legacyAward : null;
    if (!legacy && recorded && num(recorded.points) > 0) {
      legacy = {
        points: num(recorded.points),
        historyEntryIds: Array.isArray(recorded.historyEntryIds) ? recorded.historyEntryIds.map(String) : [],
      };
    }
  }

  let awardedPoints = marker?.points ?? legacy?.points ?? 0;
  let awardedCustomerId: string | null =
    marker?.customerId ?? (legacy && customer ? customer.id : null);

  // 1. Award
  const wantsAward = input.forceAwardSource ? true : isAwardTransition(beforeState, afterState);
  if (wantsAward) {
    if (marker) plan.awardSkipped = "already_awarded";
    else if (legacy) plan.awardSkipped = "legacy_awarded";
    else if (!customer) plan.awardSkipped = "no_customer";
    else if (!customer.exists) plan.awardSkipped = "customer_not_found";
    else {
      const basis = loyaltyBasis(after);
      const earned = pointsForPurchase(basis, input.settings);
      if (earned.points > 0) {
        plan.award = {
          points: earned.points,
          basis,
          source: input.forceAwardSource ?? awardSourceFor(afterState),
        };
        awardedPoints = earned.points;
        awardedCustomerId = customer.id;
      } else {
        plan.awardSkipped = earned.reason ?? "below_minimum";
      }
    }
  }

  // 2. Coupon given back (same customer only)
  const couponOwner =
    (typeof before.customer?.uid === "string" && before.customer.uid) ||
    (typeof before.customerUid === "string" && before.customerUid) ||
    null;
  const restore =
    customerData && customer && couponOwner === customer.id
      ? planCouponRestore({
          txn: before,
          docId: input.docId,
          before: beforeState,
          after: afterState,
          coupons: customerData.coupons,
          settings: input.settings,
          now,
        })
      : null;

  // 3. Reversal, only on a step that refunded or cancelled something (or a
  //    same-step award on an order that already has refunds).
  const shareBefore = refundedGoodsShare(before, beforeState);
  const shareAfter = refundedGoodsShare(after, afterState);
  const cancelStep =
    afterState.cancelled &&
    (!beforeState.cancelled || beforeState.cancellationRefund !== afterState.cancellationRefund);
  const relevant =
    shareAfter > shareBefore || cancelStep || (plan.award !== null && (shareAfter > 0 || afterState.cancelled));
  const target = reversalTarget(awardedPoints, afterState.cancelled, shareAfter);
  const alreadyReversed = num(reversedBefore?.points);
  const reversalCustomerMatches = !!awardedCustomerId && (!customer || customer.id === awardedCustomerId);

  let balance = num(customerData?.loyaltyPoints);
  let lifetime = num(customerData?.totalPointsEarned);
  if (plan.award) {
    balance += plan.award.points;
    lifetime += plan.award.points;
  }
  if (restore) balance += restore.points;

  if (relevant && reversalCustomerMatches && target > alreadyReversed) {
    const customerKnown = !!customerData;
    const step = applyReversal({ target, alreadyReversed, balance: customerKnown ? balance : 0 });
    if (customerKnown) {
      balance = step.balance;
      lifetime = Math.max(0, roundTo(lifetime - step.delta, 6));
    }
    const reason: "cancelled" | "refund" = afterState.cancelled ? "cancelled" : "refund";
    plan.reversal = { delta: step.delta, applied: step.applied, shortfall: step.shortfall, reason };
    plan.legacy = !marker && !plan.award && !!legacy;
    const previousEntries = Array.isArray(reversedBefore?.entries) ? (reversedBefore.entries as unknown[]) : [];
    const entry: LoyaltyReversalEntry = {
      points: step.delta,
      applied: step.applied,
      shortfall: step.shortfall,
      reason,
      action: input.action,
      at: now,
    };
    const reversed: LoyaltyReversedMarker = {
      points: roundTo(alreadyReversed + step.delta, 6),
      appliedPoints: roundTo(num(reversedBefore?.appliedPoints) + step.applied, 6),
      shortfall: roundTo(num(reversedBefore?.shortfall) + step.shortfall, 6),
      lastReversedAt: now,
      customerId: awardedCustomerId as string,
      ...(plan.legacy && legacy ? { legacyAward: legacy } : {}),
      entries: [...previousEntries, entry].slice(-MAX_REVERSAL_ENTRIES) as LoyaltyReversalEntry[],
    };
    plan.txnUpdates.loyaltyReversed = reversed;
  }

  if (plan.award && customer) {
    const awardMarker: LoyaltyAwardMarker = {
      points: plan.award.points,
      basis: plan.award.basis,
      customerId: customer.id,
      awardedAt: now,
      source: plan.award.source,
    };
    plan.txnUpdates.loyaltyAward = awardMarker;
  }

  if (restore) {
    plan.couponRestore = { couponId: restore.couponId, points: restore.points };
    plan.txnUpdates.couponRestored = { couponId: restore.couponId, points: restore.points, restoredAt: now };
  }

  const customerTouched =
    !!customerData && Boolean(plan.award || restore || (plan.reversal && plan.reversal.delta > 0));
  if (customerTouched && customer && customerData) {
    const update: Record<string, unknown> = {
      loyaltyPoints: roundTo(Math.max(0, balance), 6),
      totalPointsEarned: roundTo(Math.max(0, lifetime), 6),
      updatedAt: now,
    };
    if (restore) {
      const coupons = [...(customerData.coupons as unknown[])];
      coupons[restore.index] = restore.coupon;
      update.coupons = coupons;
      update.activeCouponsCount = coupons.filter((c) => isRecord(c) && lower(c.status) === "active").length;
    }
    let historyEntry: Record<string, unknown> | undefined;
    if (plan.award) {
      historyEntry = {
        id:
          input.historyEntryId ??
          `points_${now.toMillis()}_${Math.random().toString(36).substring(2, 9)}`,
        pointsEarned: plan.award.points,
        transactionId: keys[0] ?? input.docId,
        transactionAmount: plan.award.basis,
        earnedAt: now,
        source: afterState.channel === "walk_in" ? "pos" : "online",
        description: historyDescription(plan.award.source, after),
      };
    }
    plan.customer = { id: customer.id, update, historyEntry };
  }

  return plan;
}

/** Short summary for the audit entry, or undefined when nothing happened. */
export function loyaltyAuditDetails(plan: LoyaltyPlan): Record<string, unknown> | undefined {
  if (!plan.award && !plan.reversal && !plan.couponRestore && !plan.awardSkipped) return undefined;
  return {
    ...(plan.award ? { awarded: plan.award.points, source: plan.award.source, basis: plan.award.basis } : {}),
    ...(plan.awardSkipped ? { awardSkipped: plan.awardSkipped } : {}),
    ...(plan.reversal
      ? {
          reversed: plan.reversal.delta,
          reversedApplied: plan.reversal.applied,
          reversedShortfall: plan.reversal.shortfall,
          reversalReason: plan.reversal.reason,
        }
      : {}),
    ...(plan.legacy ? { legacyAward: true } : {}),
    ...(plan.couponRestore ? { couponRestored: plan.couponRestore.couponId, couponPoints: plan.couponRestore.points } : {}),
  };
}

// ---------------------------------------------------------------------------
// Firestore I/O (inside the caller's transaction)
// ---------------------------------------------------------------------------

function isDocId(id: unknown): id is string {
  return typeof id === "string" && !!id && id.length <= 1500 && !id.includes("/") && id !== "." && id !== "..";
}

/** Whose points this transaction moves: the award's customer, else the buyer. */
export function loyaltyCustomerId(txn: DocumentData | null | undefined): string | null {
  if (!txn) return null;
  const candidates = [
    isRecord(txn.loyaltyAward) ? txn.loyaltyAward.customerId : null,
    isRecord(txn.loyaltyReversed) ? txn.loyaltyReversed.customerId : null,
    txn.customer?.uid,
    txn.customerUid,
  ];
  for (const candidate of candidates) {
    if (isDocId(candidate)) return candidate;
  }
  return null;
}

export interface LoyaltyCustomerDoc extends LoyaltyCustomerSnapshot {
  ref: DocumentReference;
}

export function customerRef(db: Firestore, id: string): DocumentReference {
  return db.collection(CUSTOMERS_COLLECTION).doc(id);
}

/** Read the customer doc this transaction's loyalty touches (read phase). */
export async function readLoyaltyCustomer(
  tx: Transaction,
  db: Firestore,
  txn: DocumentData | null | undefined,
): Promise<LoyaltyCustomerDoc | null> {
  const id = loyaltyCustomerId(txn);
  if (!id) return null;
  const ref = customerRef(db, id);
  const snap = await tx.get(ref);
  return { id, ref, exists: snap.exists, data: snap.exists ? (snap.data() ?? {}) : null };
}

/** From an already-fetched snapshot (when the caller batches reads with getAll). */
export function loyaltyCustomerFromSnapshot(
  id: string,
  ref: DocumentReference,
  snap: { exists: boolean; data(): DocumentData | undefined } | undefined,
): LoyaltyCustomerDoc {
  const exists = !!snap?.exists;
  return { id, ref, exists, data: exists ? (snap?.data() ?? {}) : null };
}

/** The customers/{id} update for a plan (history appended with arrayUnion). */
export function customerUpdateFor(plan: LoyaltyPlan): Record<string, unknown> | null {
  if (!plan.customer) return null;
  return {
    ...plan.customer.update,
    ...(plan.customer.historyEntry ? { pointsHistory: FieldValue.arrayUnion(plan.customer.historyEntry) } : {}),
  };
}
