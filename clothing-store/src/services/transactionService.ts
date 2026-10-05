import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit as limitTo,
  Timestamp,
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { logActivity } from "@/lib/activityClient";
import { SelectedCustomer, CartItem } from "@/types/cart";
import type { ColorVariant } from "@/types/stock";
import {
  deductSaleLines,
  groupLineAdjustments,
  isStockAdjustmentError,
  saleStockMessage,
  StockAdjustmentError,
} from "@/lib/stockMath";
import type {
  BulkResult,
  InspectionResult,
  TransactionActionInput,
  TransactionActionResult,
} from "@/server/orders/types";
import type { ArchiveResult } from "@/server/orders/archive";

export type { TransactionActionResult } from "@/server/orders/types";

/**
 * POST a JSON body to one of the POS order routes and unwrap
 * `{ success, data }`. Throws an Error carrying the server's message (e.g.
 * "This order is already cancelled.") when the route refuses.
 */
export async function postOrderApi<T>(path: string, body: unknown): Promise<T> {
  const response = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: { success?: boolean; data?: T; error?: string } | null = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok || !json || json.success !== true) {
    throw new Error(json?.error || `Request failed (${response.status})`);
  }
  return json.data as T;
}

/**
 * Drop `undefined` (Firestore rejects it) from plain objects and arrays,
 * leaving class instances such as Timestamp untouched. Undefined array
 * entries become null.
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((v) => sanitizeForFirestore(v));
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) out[k] = sanitizeForFirestore(v);
    });
    return out;
  }
  return value;
}

/** "itemId___3" (the pages' refund-item keys) -> line 3. */
function lineIndexFromKey(key: string): number {
  const at = key.lastIndexOf("___");
  const index = Number.parseInt(at >= 0 ? key.slice(at + 3) : key, 10);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export interface DiscountBreakdown {
  wholesaleSavings: number;
  groupPercentSavings: number;
  groupFixedTotal: number;
  variantPercentSavings: number;
  variantFixedTotal: number;
  cartDiscount: number;
  cartDiscountPercent: number;
}

export interface Transaction {
  id?: string;
  transactionId: string;
  onlineOrderId?: string; // Reference to onlineOrders collection
  customer: SelectedCustomer | null;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  /**
   * Receipt-grade figures, recorded alongside the collapsed pair above rather
   * than replacing it.
   *
   * `subtotal` is net of wholesale and percentage discounts and `discount`
   * lumps every remaining saving together, which is enough for accounting but
   * cannot be printed as a breakdown a customer can check. These three fields
   * let a reprint or a report rebuild what was handed over at the till:
   *
   *   grossSubtotal - totalSavings + tax = total
   *
   * Absent on sales recorded before the itemised receipt was introduced, and on
   * storefront orders, which persist their own equivalents.
   */
  grossSubtotal?: number;
  totalSavings?: number;
  /**
   * Tax rate as a percentage (e.g. 7 for 7%) as actually applied.
   *
   * The storefront paths have always written this; the till did not, which left
   * receipts and reports deriving the rate by dividing tax by an assumed base.
   */
  taxRate?: number;
  // Loyalty coupon applied at the till, if any
  couponId?: string;
  couponCode?: string;
  couponDiscount?: number;
  /**
   * Storefront equivalents of `couponDiscount` / `couponCode`.
   *
   * The web checkout (`api/transactions/create-cod`) and the MMPay webhook
   * write the coupon value as `couponDiscountTHB` and echo the code as
   * `appliedCouponCode`. Declaring them here means loyalty reporting can see
   * online redemptions instead of only counting till ones.
   *
   * Careful: on the QR path `discount` and `couponDiscountTHB` carry the same
   * amount, so they must never be summed. See `getCouponCost` in
   * src/lib/analytics/retailAnalytics.ts.
   */
  couponDiscountTHB?: number;
  appliedCouponCode?: string;
  /**
   * Flat THB delivery fee on storefront orders (POS Settings → Delivery Fee).
   * Already included in `total`; not taxed. Absent on walk-in sales.
   */
  deliveryFee?: number;
  amountPaid: number;
  change: number;
  paymentMethod: "cash" | "scan" | "wallet" | "cod";
  timestamp: string;
  createdAt: Timestamp;
  /**
   * Legacy status strings. Written only by the order server actions
   * (src/server/orders) through `legacyStatusFields` in src/lib/orderState.ts,
   * which keeps status / orderStatus / paymentStatus / deliveryStatus
   * consistent. Read them through `deriveOrderState` rather than comparing
   * strings where possible.
   */
  status:
    | "completed"
    | "pending"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
    | "refund_rejected";
  paymentStatus?:
    | "completed"
    | "pending"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
    | "pending_refund"
    | "refund_rejected"
    | "SUCCESS"
    | "PENDING";
  orderStatus?:
    | "pending"
    | "confirmed"
    | "packaging"
    | "processing"
    | "delivered"
    | "delivering"
    | "cancelled"
    | "fully_returned"
    | "partially_returned";
  shopId?: string;
  branchName?: string;
  sellingCurrency?: "THB" | "MMK";
  exchangeRate?: number;
  sellingTotal?: number;
  refunds?: Refund[];
  /**
   * Refund owed because the whole order was cancelled, as written by
   * `cancelOrderWithRefund` / `confirmCancellationRefund` below.
   *
   * This was always persisted but never declared, which forced every reader
   * (refund report, cancellations page, pending refunds) to cast the
   * transaction to `any` just to reach it.
   */
  cancellationRefund?: {
    amount: number;
    status: "pending" | "completed" | "failed";
    method?: "cash" | "original_payment" | "bank_transfer" | "pending";
    requestedAt?: Timestamp;
    requestedBy?: string;
    requestedByUid?: string;
    reason?: string;
    confirmedAt?: Timestamp;
    confirmedBy?: string;
    confirmedByUid?: string;
    processedBy?: string;
    notes?: string;
    proofUrl?: string;
  };
  cancelledAt?: Timestamp;
  cancelReason?: string;
  cancelledBy?: string;
  approvedAt?: Timestamp;
  approvedBy?: string;
  rejectedAt?: Timestamp;
  rejectReason?: string;
  rejectedBy?: string;
  discountBreakdown?: DiscountBreakdown;
  // Delivery tracking fields
  deliveryStatus?: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  deliveryStatusUpdatedAt?: Timestamp;
  deliveryStatusUpdatedBy?: string;
  orderSource?: "pos" | "web_storefront";
  /**
   * Older storefront markers. `orderSource` is the intended discriminator, but
   * the MMPAY webhook and COD route also write `source: "online"` and
   * `paymentProvider: "MMPAY"`, and plenty of existing documents carry only
   * those. `onlineOrderService` already filters on them; declaring them here
   * means readers no longer have to cast to `any` to check the channel.
   */
  source?: string;
  paymentProvider?: string;
  customerUid?: string;
  /**
   * Who rang up the sale.
   *
   * Recorded at checkout from the authenticated session. Without this, sales
   * carry no operator attribution at all, which makes sales-per-staff,
   * discount-authorisation rates and refund rates per operator impossible to
   * report — the three analytics most retail businesses rely on for loss
   * prevention.
   *
   * Absent on storefront orders (the customer serves themselves) and on any
   * sale recorded before attribution was introduced; analytics buckets those
   * separately rather than dropping them.
   */
  soldByUid?: string;
  soldByName?: string;
  soldByRole?: "owner" | "manager" | "staff" | "customer";
}

export interface RefundItem {
  itemId: string;
  itemIndex: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

/**
 * One entry of `transactions/{id}.refunds[]` — the single record of a refund.
 * (The separate `refunds` collection is no longer written.)
 */
export interface Refund {
  /** Same as refundId on refunds recorded by the server actions. */
  id?: string;
  transactionId: string;
  refundId: string;
  items: RefundItem[];
  /** Money given back: itemsSubtotal − cartDiscountRefund + taxRefund. */
  totalAmount: number;
  itemsSubtotal?: number; // Subtotal of refunded items before order-level discounts and tax
  cartDiscountRefund?: number; // Proportional order-level discount taken off those items
  /** Tax included in totalAmount (0 unless business_settings refundTaxOnReturns). */
  taxRefund?: number;
  reason?: string;
  processedBy?: string;
  processedByUid?: string;
  createdAt: Timestamp;
  status: "pending" | "completed" | "failed";
  // Refund payment tracking
  refundMethod?: "cash" | "original_payment" | "bank_transfer" | "pending";
  refundedAt?: Timestamp;
  refundedBy?: string;
  refundedByUid?: string;
  refundNotes?: string;
  refundProofUrl?: string; // Receipt or proof of refund
}

export interface TransactionSummary {
  totalTransactions: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  paymentMethodBreakdown: {
    cash: number;
    scan: number;
    wallet: number;
    cod: number;
  };
}

export type RefundPayoutMethod = "cash" | "original_payment" | "bank_transfer";
export type ReturnStatusChoice = "fully_returned" | "partially_returned";

/** One inspected line for `completeReturnInspection`. */
export interface InspectionLine {
  /** Position of the line in `transaction.items`. */
  lineIndex: number;
  /** Units returned on this line. */
  quantity: number;
  result: InspectionResult;
  damageReason?: string;
}

const actionsPath = (transactionId: string) =>
  `/api/transactions/${encodeURIComponent(transactionId)}/actions`;

class TransactionService {
  private collectionName = "transactions";
  private counterCollection = "counters";
  private counterDocId = "transactionCounter";

  /**
   * Allocate the next receipt number (TXN-0000000000001 ...).
   *
   * @deprecated Use `recordSale`, which allocates the number in the same
   * transaction that saves the sale, so an abandoned checkout no longer
   * burns a number. Throws when the counter cannot be advanced; there is no
   * fallback id any more.
   */
  async generateTransactionId(): Promise<string> {
    if (!db) throw new Error("Firestore database is not initialized.");
    const firestore = db;
    const counterRef = doc(firestore, this.counterCollection, this.counterDocId);

    try {
      return await runTransaction(firestore, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const next = this.nextCount(counterDoc.exists() ? counterDoc.data() : null);
        if (next === 1 && !counterDoc.exists()) {
          transaction.set(counterRef, { count: 1, lastUpdated: serverTimestamp() });
        } else {
          transaction.update(counterRef, { count: next, lastUpdated: serverTimestamp() });
        }
        return this.formatReceiptNumber(next);
      });
    } catch (error) {
      console.error("Error generating transaction ID:", error);
      throw new Error(
        `Could not allocate a receipt number: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private nextCount(counter: Record<string, unknown> | null | undefined): number {
    if (!counter) return 1;
    const current = Number(counter.count ?? 0);
    if (!Number.isInteger(current) || current < 0) {
      throw new Error("The receipt counter holds an invalid value.");
    }
    return current + 1;
  }

  private formatReceiptNumber(count: number): string {
    // Format: TXN-0000000000001 (13 digits, zero-padded)
    return `TXN-${count.toString().padStart(13, "0")}`;
  }

  /**
   * Save a confirmed sale, give it its receipt number and take its stock,
   * atomically.
   *
   * In ONE Firestore transaction, reads first: counters/transactionCounter
   * and every product document the cart touches. Then the writes: count + 1
   * (only `count` and `lastUpdated`, as firestore.rules allow; the first sale
   * creates it with count 1), each product's `colorVariants` minus the sold
   * units, and the sale document with `transactionId = TXN-<13 digits>`,
   * `createdAt` and `stockDeductedAt`. If a line cannot be matched to its
   * variant or the shelf is short, it throws a StockAdjustmentError whose
   * message is meant for the cashier (`Only 2 left of "Shirt" (Red / M)`) and
   * nothing is saved: no sale, no stock change, no receipt number used.
   *
   * The cart no longer reserves stock, so this is the only place a POS sale
   * takes it; pending (scan / COD) walk-in sales too. Cancelling or rejecting
   * puts it back through the order actions on the server.
   *
   * Afterwards (best effort): redeem the applied loyalty coupon and ask the
   * server to award loyalty points.
   */
  async recordSale(
    data: Omit<Transaction, "id" | "createdAt" | "transactionId">,
  ): Promise<{ id: string; transactionId: string }> {
    const sale = await this.commitSale(data, null);
    await this.afterSale(data, sale.transactionId, sale.id);
    return sale;
  }

  /**
   * The transaction behind recordSale. With `receiptNumber` null the number
   * is allocated from the counter; otherwise (legacy recordTransaction) the
   * given one is used and the counter is left alone.
   */
  private async commitSale(
    data: Omit<Transaction, "id" | "createdAt" | "transactionId">,
    receiptNumber: string | null,
  ): Promise<{ id: string; transactionId: string }> {
    if (!db) {
      throw new Error(
        "Firestore database is not initialized. Please check your Firebase configuration.",
      );
    }
    const firestore = db;
    const counterRef = doc(firestore, this.counterCollection, this.counterDocId);
    const saleRef = doc(collection(firestore, this.collectionName));
    const sanitized = sanitizeForFirestore(data) as Record<string, unknown>;

    const { byStock, unlinked } = groupLineAdjustments(data.items || [], -1);
    if (unlinked.length > 0) {
      throw new StockAdjustmentError(
        "stock_not_found",
        `"${unlinked[0].groupName || "An item"}" is not linked to a product. Remove it from the cart and add it again.`,
      );
    }
    const stockIds = Array.from(byStock.keys());
    const stockRefs = stockIds.map((stockId) => doc(firestore, "stocks", stockId));

    try {
      const transactionId = await runTransaction(firestore, async (transaction) => {
        // Reads: the counter (when allocating) and every product, before any write.
        const counterDoc = receiptNumber ? null : await transaction.get(counterRef);
        const stockSnaps = await Promise.all(stockRefs.map((ref) => transaction.get(ref)));

        const stockWrites = stockSnaps.map((snap, index) => {
          const stockId = stockIds[index];
          const adjustments = byStock.get(stockId) || [];
          if (!snap.exists()) {
            const notFound = new StockAdjustmentError(
              "stock_not_found",
              `Stock item ${stockId} not found`,
              { stockId, label: adjustments[0]?.label },
            );
            throw new StockAdjustmentError(
              notFound.code,
              saleStockMessage(notFound),
              notFound.details,
            );
          }
          const colorVariants = deductSaleLines(
            (snap.data() as { colorVariants?: ColorVariant[] }).colorVariants,
            stockId,
            adjustments,
          );
          return { ref: stockRefs[index], colorVariants };
        });

        // Writes.
        let receipt = receiptNumber;
        if (!receipt) {
          const next = this.nextCount(counterDoc?.exists() ? counterDoc.data() : null);
          if (!counterDoc?.exists()) {
            transaction.set(counterRef, { count: next, lastUpdated: serverTimestamp() });
          } else {
            transaction.update(counterRef, { count: next, lastUpdated: serverTimestamp() });
          }
          receipt = this.formatReceiptNumber(next);
        }

        for (const write of stockWrites) {
          transaction.update(write.ref, {
            colorVariants: write.colorVariants,
            updatedAt: serverTimestamp(),
          });
        }

        const now = Timestamp.now();
        transaction.set(saleRef, {
          ...sanitized,
          transactionId: receipt,
          createdAt: now,
          stockDeductedAt: now,
        });
        return receipt;
      });
      return { id: saleRef.id, transactionId };
    } catch (error) {
      console.error("TransactionService: Error recording sale:", error);
      // Stock problems already carry a message for the cashier.
      if (isStockAdjustmentError(error)) throw error;
      throw new Error(
        `Failed to record transaction: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    }
  }

  /**
   * Coupon redemption + loyalty points. Never fails or holds up the sale.
   *
   * `transactionId` is the receipt number (what the coupon is redeemed
   * against); `saleDocId` is the Firestore document id the loyalty route
   * takes.
   */
  private async afterSale(
    transactionData: Pick<Transaction, "customer" | "couponId" | "status">,
    transactionId: string,
    saleDocId: string,
  ): Promise<void> {
    // Consume the applied loyalty coupon, which also spends its points.
    // Done before awarding so the new balance reflects the redemption.
    if (transactionData.customer?.uid && transactionData.couponId) {
      try {
        const { LoyaltyService } = await import("./loyaltyService");
        const redeemResult = await LoyaltyService.redeemCoupon({
          customerId: transactionData.customer.uid,
          couponId: transactionData.couponId,
          transactionId,
        });

        if (!redeemResult.success) {
          console.error("Coupon not redeemed:", redeemResult.error);
        }
      } catch (couponError) {
        // Don't fail the sale if coupon bookkeeping fails.
        console.error("Error redeeming coupon:", couponError);
      }
    }

    // Activity log entry for the sale. The server checks the sale is this
    // account's and writes it once; never awaited, never fails the sale.
    if (saleDocId) {
      void logActivity({ action: "sale.complete", transactionDocId: saleDocId });
    }

    // Loyalty points are awarded by the server (idempotent route), and only
    // for a completed sale: pending scan / COD sales earn them on approval.
    // Not awaited, so a slow or failing call never holds up the receipt.
    if (
      transactionData.customer?.uid &&
      transactionData.status === "completed" &&
      saleDocId
    ) {
      void postOrderApi<{ awarded: boolean; points: number }>(
        `/api/transactions/${encodeURIComponent(saleDocId)}/award-loyalty`,
        {},
      )
        .then((result) => {
          console.log("Loyalty points:", result);
        })
        .catch((loyaltyError) => {
          console.error("Error awarding loyalty points:", loyaltyError);
        });
    }
  }

  /**
   * Record a completed transaction.
   *
   * Without a `transactionId` this is `recordSale` (receipt number allocated
   * with the save) and resolves to the new document id. With one (the old
   * generateTransactionId-first flow) the sale is saved under that number,
   * still taking its stock in the same transaction, and gets the same coupon
   * and loyalty follow-up.
   */
  async recordTransaction(
    transactionData: Omit<Transaction, "id" | "createdAt">,
  ): Promise<string> {
    const { transactionId: givenReceipt, ...rest } = transactionData;
    if (!givenReceipt) {
      const sale = await this.recordSale(rest);
      return sale.id;
    }

    const sale = await this.commitSale(rest, givenReceipt);
    await this.afterSale(rest, sale.transactionId, sale.id);
    return sale.id;
  }

  /**
   * Transactions, newest first, filtered and limited by Firestore itself.
   *
   * Index note: `shopId ==` combined with the `createdAt` order/range needs
   * the composite index transactions(shopId ASC, createdAt DESC). Without
   * `shopId` the single-field createdAt index is enough.
   */
  async getTransactions(
    shopId?: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number,
  ): Promise<Transaction[]> {
    try {
      const constraints: QueryConstraint[] = [];
      if (shopId) constraints.push(where("shopId", "==", shopId));
      if (startDate) {
        constraints.push(where("createdAt", ">=", Timestamp.fromDate(startDate)));
      }
      if (endDate) {
        constraints.push(where("createdAt", "<=", Timestamp.fromDate(endDate)));
      }
      constraints.push(orderBy("createdAt", "desc"));
      if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
        constraints.push(limitTo(Math.floor(limit)));
      }

      const querySnapshot = await getDocs(
        query(collection(db!, this.collectionName), ...constraints),
      );
      return querySnapshot.docs.map(
        (snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Transaction,
      );
    } catch (error) {
      console.error("Error fetching transactions:", error);
      throw new Error("Failed to fetch transactions");
    }
  }

  /**
   * Get transaction summary for reporting
   */
  async getTransactionSummary(
    shopId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TransactionSummary> {
    try {
      const transactions = await this.getTransactions(
        shopId,
        startDate,
        endDate,
      );

      const summary: TransactionSummary = {
        totalTransactions: transactions.length,
        totalRevenue: 0,
        totalTax: 0,
        totalDiscount: 0,
        paymentMethodBreakdown: {
          cash: 0,
          scan: 0,
          wallet: 0,
          cod: 0,
        },
      };

      transactions.forEach((transaction) => {
        // Include completed, partially refunded, and refunded transactions
        if (
          transaction.status === "completed" ||
          transaction.status === "partially_refunded" ||
          transaction.status === "refunded"
        ) {
          // Calculate net amounts after refunds
          const refundedAmount =
            transaction.refunds?.reduce(
              (sum, refund) => sum + refund.totalAmount,
              0,
            ) || 0;
          // Ensure net revenue is never negative (safeguard against data inconsistencies)
          const netRevenue = Math.max(0, transaction.total - refundedAmount);
          const netTax =
            netRevenue > 0
              ? transaction.tax * (netRevenue / transaction.total)
              : 0;
          const netDiscount =
            netRevenue > 0
              ? transaction.discount * (netRevenue / transaction.total)
              : 0;

          summary.totalRevenue += netRevenue;
          summary.totalTax += netTax;
          summary.totalDiscount += netDiscount;
          summary.paymentMethodBreakdown[transaction.paymentMethod] +=
            netRevenue;
        }
      });

      return summary;
    } catch (error) {
      console.error("Error generating transaction summary:", error);
      throw new Error("Failed to generate transaction summary");
    }
  }

  /**
   * Get today's transactions
   */
  async getTodaysTransactions(shopId?: string): Promise<Transaction[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getTransactions(shopId, today, tomorrow);
  }

  /**
   * Get transactions for a specific customer
   */
  async getCustomerTransactions(
    customerEmail: string,
    shopId?: string,
  ): Promise<Transaction[]> {
    try {
      let q = query(
        collection(db!, this.collectionName),
        where("customer.email", "==", customerEmail),
        orderBy("createdAt", "desc"),
      );

      if (shopId) {
        q = query(q, where("shopId", "==", shopId));
      }

      const querySnapshot = await getDocs(q);
      const transactions: Transaction[] = [];

      querySnapshot.forEach((doc) => {
        transactions.push({
          id: doc.id,
          ...doc.data(),
        } as Transaction);
      });

      return transactions;
    } catch (error) {
      console.error("Error fetching customer transactions:", error);
      throw new Error("Failed to fetch customer transactions");
    }
  }

  /**
   * Get revenue for a specific date range
   */
  async getRevenue(
    startDate: Date,
    endDate: Date,
    shopId?: string,
  ): Promise<number> {
    try {
      const transactions = await this.getTransactions(
        shopId,
        startDate,
        endDate,
      );
      return transactions
        .filter(
          (t) =>
            t.status === "completed" ||
            t.status === "partially_refunded" ||
            t.status === "refunded",
        )
        .reduce((total, transaction) => {
          const refundedAmount =
            transaction.refunds?.reduce(
              (sum, refund) => sum + refund.totalAmount,
              0,
            ) || 0;
          // Ensure net revenue is never negative (safeguard against data inconsistencies)
          return total + Math.max(0, transaction.total - refundedAmount);
        }, 0);
    } catch (error) {
      console.error("Error calculating revenue:", error);
      throw new Error("Failed to calculate revenue");
    }
  }

  // -------------------------------------------------------------------------
  // Order state changes. Every method below calls a server action
  // (POST /api/transactions/[id]/actions, src/server/orders) that re-reads
  // the order, checks the state machine (src/lib/orderState.ts) and writes
  // everything in one Firestore transaction with an audit entry. The
  // `transaction` snapshot and the "...By" name parameters the pages pass are
  // ignored: the server reads fresh data and records the signed-in caller.
  // -------------------------------------------------------------------------

  /** Run one order action. Throws with the server's message when refused. */
  async runAction(
    transactionId: string,
    input: TransactionActionInput,
  ): Promise<TransactionActionResult> {
    if (!transactionId) throw new Error("Transaction id is required");
    return postOrderApi<TransactionActionResult>(actionsPath(transactionId), input);
  }

  /**
   * Restricted: only "completed" (= approve a pending order) and "cancelled"
   * (= cancel, returning stock) are accepted; refund statuses come from the
   * refund actions.
   * @deprecated No callers; use approveTransaction / cancelTransaction.
   */
  async updateTransactionStatus(
    transactionId: string,
    status: Transaction["status"],
  ): Promise<void> {
    if (status === "refund_rejected") {
      throw new Error("This status can't be set directly.");
    }
    await this.runAction(transactionId, { action: "setStatus", status });
  }

  /**
   * Refund items of a transaction (server action "processRefund").
   *
   * `refundItems` keys are the pages' `${item.id}___${lineIndex}`; values are
   * quantities. The amount is computed on the server from the stored order:
   * line amounts − proportional order-level discount (+ proportional tax only
   * when business_settings refundTaxOnReturns is on); never the delivery fee.
   * Paid orders get a pending refund (confirm it with confirmRefundPayment).
   *
   * @param transaction ignored (the server re-reads the order)
   * @param processedBy ignored (the server records the signed-in user)
   * @param options.approveRefundRequest also mark a pending refundRequest
   *   "approved" in the same transaction (replaces the follow-up updateDoc at
   *   transactions/page.tsx ~L1045 and requests/refunds/page.tsx ~L245)
   * @returns the new refund's id (REF-...)
   */
  async processRefund(
    transactionId: string,
    refundItems: { [key: string]: number },
    transaction: Transaction,
    reason?: string,
    processedBy?: string,
    refundMethod?: RefundPayoutMethod,
    inspectionResults?: { [itemIndex: number]: InspectionResult },
    returnStatus?: "refunded" | "partially_refunded",
    options?: { approveRefundRequest?: boolean },
  ): Promise<string> {
    void transaction;
    void processedBy;

    const byLine = new Map<number, number>();
    for (const [key, quantity] of Object.entries(refundItems)) {
      const lineIndex = lineIndexFromKey(key);
      const qty = Math.floor(Number(quantity));
      if (lineIndex < 0 || !(qty > 0)) continue;
      byLine.set(lineIndex, (byLine.get(lineIndex) || 0) + qty);
    }
    if (byLine.size === 0) throw new Error("No valid items to refund");

    const result = await this.runAction(transactionId, {
      action: "processRefund",
      items: Array.from(byLine.entries()).map(([lineIndex, quantity]) => ({ lineIndex, quantity })),
      reason,
      refundMethod,
      inspectionResults: inspectionResults
        ? Object.entries(inspectionResults).map(([lineIndex, result]) => ({
            lineIndex: Number(lineIndex),
            result,
          }))
        : undefined,
      returnStatus,
      approveRefundRequest: options?.approveRefundRequest,
    });
    return result.refundId ?? "";
  }

  /**
   * Refunds recorded on one transaction (`refunds[]`, newest first).
   * The separate `refunds` collection is no longer written.
   */
  async getTransactionRefunds(transactionId: string): Promise<Refund[]> {
    try {
      const snapshot = await getDoc(doc(db!, this.collectionName, transactionId));
      if (!snapshot.exists()) return [];
      const refunds = ((snapshot.data().refunds as Refund[] | undefined) || []).map(
        (refund) => ({ ...refund, id: refund.id || refund.refundId }),
      );
      return refunds.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
    } catch (error) {
      console.error("Error fetching refunds:", error);
      throw new Error("Failed to fetch refunds");
    }
  }

  /**
   * Refunds across transactions, from each transaction's `refunds[]`,
   * filtered by refund date.
   * @deprecated No callers. Reads every transaction of the shop created up
   * to `endDate`; prefer reading refunds off the transactions already loaded.
   */
  async getRefunds(
    shopId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Refund[]> {
    const transactions = await this.getTransactions(shopId, undefined, endDate);
    const from = startDate?.getTime() ?? -Infinity;
    const to = endDate?.getTime() ?? Infinity;
    return transactions
      .flatMap((transaction) =>
        (transaction.refunds || []).map((refund) => ({
          ...refund,
          id: refund.id || refund.refundId,
        })),
      )
      .filter((refund) => {
        const at = refund.createdAt?.toMillis?.() ?? 0;
        return at >= from && at <= to;
      })
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }

  /**
   * Set the order's return status (orderStatus fully_returned /
   * partially_returned) without touching payment status.
   * @param confirmedBy ignored (the server records the signed-in user)
   */
  async confirmReturnStatus(
    transactionId: string,
    returnStatus: ReturnStatusChoice,
    confirmedBy: string,
  ): Promise<void> {
    void confirmedBy;
    await this.runAction(transactionId, { action: "confirmReturnStatus", returnStatus });
  }

  /**
   * Confirm the payout of a pending refund (refunds[].status pending ->
   * completed) exactly once. status/paymentStatus become refunded or
   * partially_refunded from the recorded refunds; the online order is
   * mirrored and the customer gets a `refund_completed` notification.
   * @param confirmedBy ignored (the server records the signed-in user)
   * @param refundStatus ignored: full vs partial is derived from the refunds
   */
  async confirmRefundPayment(
    transactionId: string,
    refundId: string,
    refundMethod: RefundPayoutMethod,
    confirmedBy: string,
    refundNotes?: string,
    refundProofUrl?: string,
    refundStatus?: "refunded" | "partially_refunded",
  ): Promise<void> {
    void confirmedBy;
    void refundStatus;
    await this.runAction(transactionId, {
      action: "confirmRefundPayment",
      refundId,
      refundMethod,
      notes: refundNotes,
      proofUrl: refundProofUrl,
    });
  }

  /**
   * Cancel an order. Same server action as cancelTransaction: a paid order
   * gets a pending cancellationRefund of total − already refunded (incl. tax
   * and delivery fee); stock not yet returned goes back through the ledger.
   * Refused if already cancelled, fully refunded or delivered.
   * @param transaction ignored · @param cancelledBy ignored
   */
  async cancelPaidTransaction(
    transactionId: string,
    transaction: Transaction,
    reason?: string,
    cancelledBy?: string,
    refundMethod?: RefundPayoutMethod,
  ): Promise<void> {
    void transaction;
    void cancelledBy;
    await this.runAction(transactionId, { action: "cancel", reason, refundMethod });
  }

  /**
   * Confirm a cancellation refund payout exactly once
   * (cancellationRefund.status pending -> completed; status/paymentStatus
   * "refunded"; customer `refund_completed` notification).
   * @param confirmedBy ignored · @param refundStatus ignored
   */
  async confirmCancellationRefund(
    transactionId: string,
    refundMethod: RefundPayoutMethod,
    confirmedBy: string,
    refundNotes?: string,
    refundProofUrl?: string,
    refundStatus?: "refunded" | "partially_refunded",
  ): Promise<void> {
    void confirmedBy;
    void refundStatus;
    await this.runAction(transactionId, {
      action: "confirmCancellationRefund",
      refundMethod,
      notes: refundNotes,
      proofUrl: refundProofUrl,
    });
  }

  /**
   * Cancel an order (see cancelPaidTransaction; one server action for both).
   * @param transaction ignored · @param cancelledBy ignored
   */
  async cancelTransaction(
    transactionId: string,
    transaction: Transaction,
    reason?: string,
    cancelledBy?: string,
  ): Promise<void> {
    void transaction;
    void cancelledBy;
    await this.runAction(transactionId, { action: "cancel", reason });
  }

  /**
   * Approve an order awaiting approval (status pending -> completed).
   * Refused for anything else, e.g. a cancelled or refunded order.
   * @param approvedBy ignored
   */
  async approveTransaction(transactionId: string, approvedBy?: string): Promise<void> {
    void approvedBy;
    await this.runAction(transactionId, { action: "approve" });
  }

  /**
   * Reject an order awaiting approval: status and orderStatus "cancelled",
   * stock returned through the ledger.
   * @param transaction ignored · @param rejectedBy ignored
   */
  async rejectTransaction(
    transactionId: string,
    transaction: Transaction,
    reason?: string,
    rejectedBy?: string,
  ): Promise<void> {
    void transaction;
    void rejectedBy;
    await this.runAction(transactionId, { action: "reject", reason });
  }

  /**
   * "Delete" a transaction (owner only): moved to transactions_archive/{id}
   * with an audit entry. Nothing is destroyed.
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    const result = await this.archiveTransactions([transactionId]);
    const failed = result.results.find((r) => !r.ok);
    if (failed && !failed.ok) throw new Error(failed.error);
  }

  /**
   * Move delivery forward (pending -> confirmed -> shipped -> delivered).
   * "delivered" completes an order still awaiting approval but leaves a
   * refunded/partially refunded one as it is; "cancelled" runs the cancel
   * path (stock back, cancellation refund for a paid order). Re-sending the
   * current status is a no-op.
   * @param updatedBy ignored
   */
  async updateDeliveryStatus(
    transactionId: string,
    deliveryStatus: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled",
    updatedBy?: string,
  ): Promise<void> {
    void updatedBy;
    await this.runAction(transactionId, { action: "updateDeliveryStatus", deliveryStatus });
  }

  /** Bulk "delete" (archive), one transaction per id. */
  async deleteTransactions(
    transactionIds: string[],
  ): Promise<{ successCount: number; failCount: number }> {
    if (transactionIds.length === 0) return { successCount: 0, failCount: 0 };
    try {
      const result = await this.archiveTransactions(transactionIds);
      return { successCount: result.successCount, failCount: result.failCount };
    } catch (error) {
      console.error("Failed to delete transactions:", error);
      return { successCount: 0, failCount: transactionIds.length };
    }
  }

  /**
   * Archive transactions (owner only) via POST /api/transactions/archive.
   * Each id is moved to transactions_archive/{id} in its own Firestore
   * transaction, with archivedAt/By/ByRole, `reason` and an audit entry.
   */
  async archiveTransactions(
    transactionIds: string[],
    reason?: string,
  ): Promise<BulkResult<ArchiveResult>> {
    return postOrderApi<BulkResult<ArchiveResult>>("/api/transactions/archive", {
      ids: transactionIds,
      reason,
    });
  }

  // -------------------------------------------------------------------------
  // Customer request handling (replaces the pages' direct updateDoc calls)
  // -------------------------------------------------------------------------

  /**
   * Approve a customer's cancellation request: cancels the order (stock back
   * through the ledger; a paid order gets a pending cancellationRefund of
   * total − already refunded and an owner `refund_payment` notification) AND
   * sets cancellationRequest.status "approved" / approvedAt / approvedBy, in
   * one transaction. Reason = the customer's request reason.
   *
   * Replaces: requests/cancellations/page.tsx ~L108-L133 (cancelPaidTransaction
   * or cancelTransaction, then updateDoc cancellationRequest.status
   * "approved") and sales/transactions/page.tsx ~L3241-L3256 (cancelTransaction
   * then the same updateDoc).
   */
  async approveCancellationRequest(
    transactionId: string,
    options: { refundMethod?: RefundPayoutMethod } = {},
  ): Promise<TransactionActionResult> {
    return this.runAction(transactionId, {
      action: "approveCancellationRequest",
      refundMethod: options.refundMethod,
    });
  }

  /**
   * Reject a pending cancellation request (cancellationRequest.status
   * "rejected", rejectedAt, rejectionReason, rejectedBy).
   *
   * Replaces: requests/cancellations/page.tsx ~L166 and
   * sales/transactions/page.tsx ~L3280 (updateDoc cancellationRequest {...,
   * status: "rejected"}).
   */
  async rejectCancellationRequest(
    transactionId: string,
    reason: string,
  ): Promise<TransactionActionResult> {
    return this.runAction(transactionId, { action: "rejectCancellationRequest", reason });
  }

  /**
   * Approve a pending refund request (refundRequest.status "approved",
   * approvedAt, approvedBy).
   *   - type "return": the customer may now bring the items back (no refund yet).
   *   - type "cancellation" (an order cancelled without a recorded refund):
   *     also records the pending cancellationRefund (total − already refunded)
   *     and the owner `refund_payment` notification.
   *
   * Replaces: requests/refunds/page.tsx ~L120 (handleApproveReturn's updateDoc).
   * For a "cancellation"-type request on a cancelled order use this instead
   * of processRefund (which refuses cancelled orders).
   */
  async approveRefundRequest(transactionId: string): Promise<TransactionActionResult> {
    return this.runAction(transactionId, { action: "approveRefundRequest" });
  }

  /**
   * Reject a refund request (pending, or an approved return whose items were
   * not received yet): refundRequest.status "rejected", rejectedAt,
   * rejectionReason, rejectedBy.
   *
   * Replaces: requests/refunds/page.tsx ~L714 and sales/transactions/page.tsx
   * ~L3355 (updateDoc refundRequest {..., status: "rejected"}).
   */
  async rejectRefundRequest(
    transactionId: string,
    reason: string,
  ): Promise<TransactionActionResult> {
    return this.runAction(transactionId, { action: "rejectRefundRequest", reason });
  }

  /**
   * The customer brought the items back: refundRequest.returnReceived true,
   * returnReceivedAt/By, returnStatus; orderStatus = returnStatus; the
   * online order's status/orderStatus mirrored.
   *
   * Replaces: requests/refunds/page.tsx ~L322-L341 (handleMarkReturnReceived's
   * two updateDoc calls).
   */
  async markReturnReceived(
    transactionId: string,
    returnStatus: ReturnStatusChoice,
  ): Promise<TransactionActionResult> {
    return this.runAction(transactionId, { action: "markReturnReceived", returnStatus });
  }

  /**
   * Finish the inspection of returned items in ONE transaction:
   * confirmReturnStatus + inspection results + either
   *   - all damaged: status/paymentStatus "refund_rejected",
   *     refundRequest.status "completed_no_refund", customer `refund_rejected`
   *     notification; or
   *   - some accepted: a pending refund for the accepted units only,
   *     paymentStatus "pending_refund", refundRequest.status "completed",
   *     owner `refund_payment` notification, and a customer
   *     `partial_refund_with_damaged_items` notification when some were damaged.
   * Accepted units are restocked; damaged units are written off in the ledger.
   * `outcome` in the result says which branch ran.
   *
   * Build `lines` from the page's state: for each inspected line index,
   * `{ lineIndex, quantity: <requested quantity>, result: inspectionResults[i],
   * damageReason: damageReasons[i] }`.
   *
   * Replaces: requests/refunds/page.tsx handleCompleteInspection ~L501-L670
   * (confirmReturnStatus, updateDoc ~L512/~L525 or ~L581/~L593, notification
   * addDoc ~L554/~L602/~L670 and processRefund ~L633).
   */
  async completeReturnInspection(
    transactionId: string,
    params: { lines: InspectionLine[]; returnStatus?: ReturnStatusChoice },
  ): Promise<TransactionActionResult> {
    return this.runAction(transactionId, {
      action: "completeReturnInspection",
      lines: params.lines,
      returnStatus: params.returnStatus,
    });
  }
}

export const transactionService = new TransactionService();
export default transactionService;
