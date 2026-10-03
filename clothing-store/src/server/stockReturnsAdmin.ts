/**
 * Admin-SDK port of `StockService.returnOrderLines` (src/services/stockService.ts)
 * and of the guard selection in `transactionService.returnTransactionStock`,
 * built to run INSIDE a transaction the caller already holds.
 *
 * Firestore transactions need every read before the first write, and the
 * caller usually writes the guard document (the transaction or the online
 * order) itself. So a stock return is split in two:
 *
 *   const prepared = await readStockReturn(tx, db, guard, guardData, lines); // reads
 *   ...other reads...
 *   writeStockReturnStock(tx, prepared);           // stock documents
 *   writes.update(guard.ref, prepared.guardUpdates) // ledger, merged by the caller
 *
 * or `applyStockReturn(tx, prepared)` when the caller does not touch the guard
 * document itself.
 *
 * Ledger semantics are unchanged: `stockReturnLedger` on the guard document
 * counts units already dealt with per line, `requireField` (stockDeductedAt)
 * skips orders whose stock was never taken, and `stockRestoredAt` (plus a
 * reservation release on online orders) is written once every line is back.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  applyAdjustments,
  planOrderLineReturns,
  type OrderLineReturn,
  type ReturnLedgerSource,
} from "@/lib/stockMath";
import type { ColorVariant, StockItem } from "@/types/stock";

const STOCKS = "stocks";

export interface StockReturnGuard {
  ref: DocumentReference;
  collection: "onlineOrders" | "transactions";
  source: ReturnLedgerSource;
  /** Skip the return when this field is missing on the guard document. */
  requireField?: string;
  /** Extra fields to write once every line is fully back. */
  extraUpdatesWhenComplete?: (guardData: DocumentData) => Record<string, unknown>;
}

/** A returned line that could not be put back on a shelf. */
export interface UnresolvedReturnLine {
  stockId: string;
  color: string;
  size: string;
  quantity: number;
  reason: "stock_not_found" | "variant_not_found" | "size_not_found";
}

export interface StockReturnResult {
  restocked: number;
  accounted: number;
  skippedReason?: string;
  /**
   * Units counted in the ledger but NOT restocked because their product,
   * variant or size no longer matches (never guessed onto another variant).
   * They end up in the audit entry so the owner can adjust stock by hand;
   * a retry does not restock them again.
   */
  unresolved?: UnresolvedReturnLine[];
}

export interface PreparedStockReturn {
  guard: StockReturnGuard;
  result: StockReturnResult;
  stockWrites: Array<{ ref: DocumentReference; colorVariants: ColorVariant[] }>;
  /** Fields to write on the guard document, or null when nothing changes. */
  guardUpdates: Record<string, unknown> | null;
}

const releaseReservation = (current: DocumentData): Record<string, unknown> =>
  current.stockReservationStatus === "reserved"
    ? { stockReservationStatus: "released", stockReleaseReason: "cancelled_in_pos" }
    : {};

/**
 * Which document holds the returns ledger for a transaction.
 *
 * Online orders keep it on `onlineOrders/{onlineOrderId}` when that document
 * exists (the online-orders page uses the same ledger). Otherwise it lives on
 * the transaction; online transactions only return stock once
 * `stockDeductedAt` shows it was taken.
 */
export function selectTransactionReturnGuard(
  db: Firestore,
  transactionDocId: string,
  txnData: DocumentData,
  onlineOrder: { id: string; exists: boolean } | null,
): StockReturnGuard {
  if (onlineOrder?.exists) {
    return {
      ref: db.collection("onlineOrders").doc(onlineOrder.id),
      collection: "onlineOrders",
      source: "onlineOrder",
      requireField: "stockDeductedAt",
      extraUpdatesWhenComplete: releaseReservation,
    };
  }

  const isOnline =
    !!txnData.onlineOrderId ||
    txnData.source === "online" ||
    txnData.orderSource === "web_storefront";

  return {
    ref: db.collection("transactions").doc(transactionDocId),
    collection: "transactions",
    source: "transaction",
    requireField: isOnline ? "stockDeductedAt" : undefined,
  };
}

/** Guard for an online order that has no transaction. */
export function onlineOrderReturnGuard(db: Firestore, orderId: string): StockReturnGuard {
  return {
    ref: db.collection("onlineOrders").doc(orderId),
    collection: "onlineOrders",
    source: "onlineOrder",
    requireField: "stockDeductedAt",
    extraUpdatesWhenComplete: releaseReservation,
  };
}

/** Return lines for a transaction's `items`, by position. */
export function transactionReturnLines(
  txnData: DocumentData,
  lines: Array<{ lineIndex: number; quantity: number; restock: boolean }>,
): OrderLineReturn[] {
  const items = Array.isArray(txnData.items) ? txnData.items : [];
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const item = items[line.lineIndex] || {};
      return {
        lineIndex: line.lineIndex,
        quantity: line.quantity,
        restock: line.restock,
        stockId: String(item.stockId || ""),
        // POS lines keep the variant id (or the till's `cv<n>-<stockId>`
        // stand-in) in selectedColor; older lines hold the colour name there.
        // `item.id` is the cart line id, not a variant id.
        colorName: String(item.selectedColor || ""),
        size: String(item.selectedSize || ""),
        variantHint: String(item.selectedColor || ""),
        // Confirms a stand-in id by colour (see resolveVariantIndex).
        colorCode: String(item.colorCode || ""),
      };
    })
    .filter((line) => !!line.stockId);
}

/** Return lines for an online order's `cartItems` (or single `product`). */
export function onlineOrderReturnLines(
  orderData: DocumentData,
  alreadyRefunded: Record<number, number> = {},
): OrderLineReturn[] {
  const rows: Array<Record<string, unknown>> =
    Array.isArray(orderData.cartItems) && orderData.cartItems.length > 0
      ? orderData.cartItems
      : orderData.product
        ? [orderData.product]
        : [];

  return rows
    .map((item, index) => ({
      lineIndex: index,
      quantity: Math.max(0, Number(item.quantity || 0)) - (alreadyRefunded[index] || 0),
      restock: true,
      stockId: String(item.productId || "").trim(),
      colorName: String(item.color || "").trim(),
      size: String(item.size || "").trim(),
      variantHint: String(item.variantId || "").trim() || undefined,
    }))
    .filter((line) => line.stockId && line.quantity > 0);
}

/**
 * Read phase. `guardData` is the guard document as already read in this
 * transaction (null when it does not exist). Reads the stock documents the
 * plan needs; writes nothing.
 */
export async function readStockReturn(
  tx: Transaction,
  db: Firestore,
  guard: StockReturnGuard,
  guardData: DocumentData | null,
  lines: OrderLineReturn[],
): Promise<PreparedStockReturn> {
  const skip = (skippedReason: string): PreparedStockReturn => ({
    guard,
    result: { restocked: 0, accounted: 0, skippedReason },
    stockWrites: [],
    guardUpdates: null,
  });

  if (lines.length === 0) return skip("nothing_to_return");
  if (!guardData) return skip("order_not_found");
  if (guard.requireField && !guardData[guard.requireField]) {
    return skip("stock_never_deducted");
  }

  const plan = planOrderLineReturns(guardData, guard.source, lines);
  if (plan.skippedReason) return skip(plan.skippedReason);
  if (plan.accounted === 0) return skip("nothing_left_to_return");

  const stockIds = Array.from(plan.adjustmentsByStock.keys());
  const refs = stockIds.map((stockId) => db.collection(STOCKS).doc(stockId));
  const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];

  const stockWrites: PreparedStockReturn["stockWrites"] = [];
  const unresolved: UnresolvedReturnLine[] = [];
  let unshelved = 0;
  snaps.forEach((snap, index) => {
    const stockId = stockIds[index];
    const adjustments = plan.adjustmentsByStock.get(stockId) || [];
    if (!snap.exists) {
      console.error(`Stock item ${stockId} not found; skipping restore`);
      for (const adjustment of adjustments) {
        unresolved.push({
          stockId,
          color: String(adjustment.color || ""),
          size: String(adjustment.size || ""),
          quantity: adjustment.delta,
          reason: "stock_not_found",
        });
        unshelved += adjustment.delta;
      }
      return;
    }
    const result = applyAdjustments(
      (snap.data() as Partial<StockItem>).colorVariants,
      stockId,
      adjustments,
      { allowAddSize: true, skipUnresolvable: true },
    );
    if (result.skipped.length > 0) {
      console.error(
        `Could not match ${result.skipped.length} line(s) to a variant of stock ${stockId}; they were not restored`,
        result.skipped.map((s) => s.adjustment),
      );
      for (const { adjustment, reason } of result.skipped) {
        unresolved.push({
          stockId,
          color: String(adjustment.color || ""),
          size: String(adjustment.size || ""),
          quantity: adjustment.delta,
          reason: reason === "size_not_found" ? "size_not_found" : "variant_not_found",
        });
        unshelved += adjustment.delta;
      }
    }
    if (result.applied.length > 0) {
      stockWrites.push({ ref: refs[index], colorVariants: result.colorVariants });
    }
  });

  // `stockRestoredAt` keeps its old meaning (the whole order is back) because
  // the storefront reads it to decide whether a paid-late order still holds
  // its stock.
  const completesNow = plan.complete && !guardData.stockRestoredAt;
  const guardUpdates: Record<string, unknown> = {
    stockReturnLedger: plan.ledger,
    ...(completesNow
      ? {
          stockRestoredAt: new Date().toISOString(),
          ...(guard.extraUpdatesWhenComplete ? guard.extraUpdatesWhenComplete(guardData) : {}),
        }
      : {}),
  };

  return {
    guard,
    result: {
      restocked: Math.max(0, plan.restocked - unshelved),
      accounted: plan.accounted,
      ...(unresolved.length > 0 ? { unresolved } : {}),
    },
    stockWrites,
    guardUpdates,
  };
}

/** Write phase, stock documents only. The caller merges `guardUpdates`. */
export function writeStockReturnStock(tx: Transaction, prepared: PreparedStockReturn): void {
  for (const write of prepared.stockWrites) {
    tx.update(write.ref, {
      colorVariants: write.colorVariants,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/** Write phase for callers that do not write the guard document themselves. */
export function applyStockReturn(tx: Transaction, prepared: PreparedStockReturn): void {
  writeStockReturnStock(tx, prepared);
  if (prepared.guardUpdates) tx.update(prepared.guard.ref, prepared.guardUpdates);
}
