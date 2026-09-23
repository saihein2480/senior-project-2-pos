/**
 * Retail analytics aggregations.
 *
 * Pure functions over the shapes already stored in Firestore, kept out of the
 * dashboard component so the same numbers can be reused by reports, exports and
 * tests without being recomputed slightly differently each time.
 *
 * ## Why this file exists
 *
 * Profit was being calculated two different ways in the app: the dashboard used
 * `item.unitPrice - item.originalPrice`, while `sales/reports` used
 * `(item.discountedPrice || item.unitPrice) - item.originalPrice`. Those
 * disagree on every discounted line item, so the same sale produced two
 * different profit figures depending on which page you opened.
 *
 * `getSellingPrice` below is the single answer: the price the customer actually
 * paid, which is `discountedPrice` when a discount was applied and `unitPrice`
 * otherwise. Every margin number in this module derives from it.
 *
 * ## Currency
 *
 * `transactions` mixes THB and MMK in one collection. The monetary base fields
 * (`total`, `subtotal`, `items[].unitPrice`, `items[].originalPrice`) are stored
 * in THB; `sellingTotal` carries the MMK figure and `exchangeRate` relates them.
 * Everything here is computed in **THB base** so series are additive, and the
 * caller formats for display. Do not mix `sellingTotal` into these totals.
 */

import type { Transaction } from "@/services/transactionService";
import type { CartItem } from "@/types/cart";
import type { StockItem } from "@/types/stock";

/** Statuses that represent money actually earned. Mirrors the existing cards. */
const REVENUE_STATUSES: ReadonlyArray<Transaction["status"]> = [
  "completed",
  "partially_refunded",
  "refunded",
];

/** Label used when a sale carries no cashier attribution. */
export const UNATTRIBUTED_LABEL = "Unattributed";

/** Sales made by the customer through the storefront, with no cashier. */
export const SELF_SERVICE_LABEL = "Online (self-service)";

export function isRevenueTransaction(transaction: Transaction): boolean {
  return REVENUE_STATUSES.includes(transaction.status);
}

/**
 * The price the customer actually paid for one unit.
 *
 * `discountedPrice` is written by the cart whenever a group, variant or
 * wholesale discount applies; `unitPrice` is the undiscounted ticket price.
 * Using `unitPrice` alone overstates margin on every promoted sale.
 */
export function getSellingPrice(item: CartItem): number {
  return item.discountedPrice ?? item.unitPrice;
}

/** Total refunded against a transaction, from the embedded refunds array. */
export function getRefundedAmount(transaction: Transaction): number {
  return (
    transaction.refunds?.reduce((sum, refund) => sum + refund.totalAmount, 0) ||
    0
  );
}

/**
 * Units refunded per line item, keyed by the item's index in `items`.
 *
 * Refunds reference their line by `itemIndex`, not by id, because the same
 * product can appear twice in one basket at different prices.
 */
export function getRefundedQuantities(
  transaction: Transaction,
): Map<number, number> {
  const refunded = new Map<number, number>();

  transaction.refunds?.forEach((refund) => {
    refund.items.forEach((refundItem) => {
      refunded.set(
        refundItem.itemIndex,
        (refunded.get(refundItem.itemIndex) || 0) + refundItem.quantity,
      );
    });
  });

  return refunded;
}

/** Revenue net of refunds, floored at zero. */
export function getNetRevenue(transaction: Transaction): number {
  return Math.max(0, transaction.total - getRefundedAmount(transaction));
}

/**
 * Gross profit net of refunds, using net quantities per line.
 *
 * Deducting refunded units rather than recomputing a refunded-profit total
 * avoids double counting when a line is partially returned more than once.
 */
export function getNetProfit(transaction: Transaction): number {
  const refunded = getRefundedQuantities(transaction);

  return transaction.items.reduce((sum, item, index) => {
    const netQuantity = Math.max(0, item.quantity - (refunded.get(index) || 0));
    return sum + (getSellingPrice(item) - item.originalPrice) * netQuantity;
  }, 0);
}

/**
 * Value of the loyalty coupon redeemed on a transaction, in THB.
 *
 * The two channels use different field names for the same thing: the till
 * writes `couponDiscount`, the storefront writes `couponDiscountTHB`. Reading
 * only one silently reports half the programme's cost.
 *
 * These are never both set, so this picks whichever is present rather than
 * adding them.
 */
export function getCouponCost(transaction: Transaction): number {
  const value = transaction.couponDiscount ?? transaction.couponDiscountTHB ?? 0;
  return Math.max(0, Number(value) || 0);
}

/**
 * Total promotional value given away on a transaction.
 *
 * The coupon needs care, because `discount` and `discountBreakdown` disagree
 * about whether it is already counted:
 *
 * - `discountBreakdown.cartDiscount` holds only the manual cart discount, with
 *   the coupon excluded (`ShoppingCartModal` builds it that way), so when a
 *   breakdown exists the coupon must be added on top.
 * - `Transaction.discount` already *includes* the coupon. The till folds it in
 *   (`discountForPayment` adds `couponDiscountDisplay`), and on the QR path
 *   `discount` and `couponDiscountTHB` are literally the same number — the
 *   storefront documents the field as "same as couponDiscountTHB".
 *
 * So on documents with no breakdown (MMPay transactions, and anything legacy)
 * adding the coupon to `discount` counts it twice. Those take the larger of the
 * two instead of the sum, which can never double count and never silently
 * reports zero if one field is missing.
 */
export function getPromotionDiscount(transaction: Transaction): number {
  const breakdown = transaction.discountBreakdown;
  const couponCost = getCouponCost(transaction);

  if (breakdown) {
    const itemLevel =
      (breakdown.wholesaleSavings || 0) +
      (breakdown.groupPercentSavings || 0) +
      (breakdown.groupFixedTotal || 0) +
      (breakdown.variantPercentSavings || 0) +
      (breakdown.variantFixedTotal || 0);

    return Math.max(0, itemLevel + (breakdown.cartDiscount || 0) + couponCost);
  }

  return Math.max(0, transaction.discount || 0, couponCost);
}

/** ISO date key (YYYY-MM-DD), UTC, used for day-level bucketing. */
export function toDateKey(value: string | Date): string {
  return new Date(value).toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Time bucketing
// ---------------------------------------------------------------------------

/**
 * How finely a time series is bucketed.
 *
 * Every series here used to seed one bucket per day regardless of range. Over a
 * multi-year range that produces thousands of points in a 300px-tall chart:
 * bars collapse below one pixel wide, axis labels overprint into a grey smear,
 * and the trend the chart exists to show becomes invisible. Aggregating to a
 * coarser grain is the fix — nobody reads eight years of retail performance one
 * day at a time.
 */
export type TimeGrain = "day" | "week" | "month" | "quarter" | "year";

const MS_PER_DAY = 86_400_000;

/** Inclusive day count between two dates. */
export function daysInRange(startDate: Date, endDate: Date): number {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

/**
 * Pick a grain that keeps the series readable.
 *
 * Thresholds are chosen so the result never exceeds roughly 60 plotted points,
 * which is about as many bars as fit legibly in a dashboard-width chart.
 */
export function chooseTimeGrain(startDate: Date, endDate: Date): TimeGrain {
  const days = daysInRange(startDate, endDate);

  if (days <= 62) return "day"; // up to ~2 months
  if (days <= 183) return "week"; // up to ~6 months -> <=27 points
  if (days <= 1100) return "month"; // up to ~3 years -> <=36 points
  if (days <= 4400) return "quarter"; // up to ~12 years -> <=48 points
  return "year";
}

/** Start of the bucket containing `date`, in UTC to match `toDateKey`. */
function startOfBucket(date: Date, grain: TimeGrain): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  switch (grain) {
    case "week": {
      const start = new Date(Date.UTC(year, month, day));
      // Weeks start Monday: getUTCDay is 0 for Sunday, so shift the index.
      const daysSinceMonday = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - daysSinceMonday);
      return start;
    }
    case "month":
      return new Date(Date.UTC(year, month, 1));
    case "quarter":
      return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1));
    case "year":
      return new Date(Date.UTC(year, 0, 1));
    case "day":
    default:
      return new Date(Date.UTC(year, month, day));
  }
}

/**
 * Key for a bucket start.
 *
 * Every format is lexicographically sortable, which is what lets the series
 * sort on the key instead of on a formatted label. The old code sorted on the
 * label — and `new Date("Mar 10")` resolves to the year 2001, so on any
 * multi-year range the year was silently discarded and points came out in
 * arbitrary order.
 */
function keyForBucketStart(start: Date, grain: TimeGrain): string {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();

  switch (grain) {
    case "month":
      return `${year}-${String(month + 1).padStart(2, "0")}`;
    case "quarter":
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case "year":
      return String(year);
    case "day":
    case "week":
    default:
      return start.toISOString().split("T")[0];
  }
}

/** Bucket key for an arbitrary timestamp. */
export function bucketKey(value: string | Date, grain: TimeGrain): string {
  return keyForBucketStart(startOfBucket(new Date(value), grain), grain);
}

/**
 * Axis label for a bucket key.
 *
 * Month, quarter and year labels carry the year, because the whole point of a
 * long range is comparing across years and "Mar" alone appears once per year.
 */
export function bucketLabel(key: string, grain: TimeGrain): string {
  switch (grain) {
    case "month": {
      const [year, month] = key.split("-");
      return new Date(
        Date.UTC(Number(year), Number(month) - 1, 1),
      ).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    case "quarter": {
      const [year, quarter] = key.split("-");
      return `${quarter} ${year}`;
    }
    case "year":
      return key;
    case "day":
    case "week":
    default:
      return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
  }
}

/** Human-readable name for the grain, for a "showing monthly totals" badge. */
export function grainLabel(grain: TimeGrain): string {
  switch (grain) {
    case "week":
      return "Weekly";
    case "month":
      return "Monthly";
    case "quarter":
      return "Quarterly";
    case "year":
      return "Yearly";
    case "day":
    default:
      return "Daily";
  }
}

/**
 * Every bucket key in the range, in order.
 *
 * Empty buckets are seeded so gaps render as zero rather than being interpolated
 * over, which would imply trade on days the shop was shut.
 */
export function enumerateBucketKeys(
  startDate: Date,
  endDate: Date,
  grain: TimeGrain,
): string[] {
  const keys: string[] = [];
  let cursor = startOfBucket(startDate, grain);
  const last = startOfBucket(endDate, grain);

  // Hard stop: a bad date would otherwise spin forever.
  for (let guard = 0; cursor <= last && guard < 10_000; guard += 1) {
    keys.push(keyForBucketStart(cursor, grain));

    const next = new Date(cursor);
    switch (grain) {
      case "week":
        next.setUTCDate(next.getUTCDate() + 7);
        break;
      case "month":
        next.setUTCMonth(next.getUTCMonth() + 1);
        break;
      case "quarter":
        next.setUTCMonth(next.getUTCMonth() + 3);
        break;
      case "year":
        next.setUTCFullYear(next.getUTCFullYear() + 1);
        break;
      case "day":
      default:
        next.setUTCDate(next.getUTCDate() + 1);
        break;
    }
    cursor = next;
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Size ordering
// ---------------------------------------------------------------------------

/**
 * Apparel sizes must sort by garment order, not alphabetically — otherwise the
 * axis reads L, M, S, XL and the chart is unreadable. Numeric sizes (waist,
 * EU shoe) sort numerically. Anything unrecognised falls to the end, sorted
 * alphabetically, so bad data stays visible instead of being dropped.
 */
const SIZE_ORDER: Record<string, number> = {
  XXXS: 0,
  XXS: 1,
  XS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  XXL: 7,
  "2XL": 7,
  XXXL: 8,
  "3XL": 8,
  XXXXL: 9,
  "4XL": 9,
  "5XL": 10,
  ONESIZE: 11,
  FREE: 11,
  FREESIZE: 11,
};

function sizeRank(size: string): number | null {
  const key = size.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (key in SIZE_ORDER) return SIZE_ORDER[key];
  return null;
}

export function compareSizes(a: string, b: string): number {
  const rankA = sizeRank(a);
  const rankB = sizeRank(b);

  if (rankA !== null && rankB !== null) return rankA - rankB;
  if (rankA !== null) return -1;
  if (rankB !== null) return 1;

  const numA = Number.parseFloat(a);
  const numB = Number.parseFloat(b);
  const bothNumeric = Number.isFinite(numA) && Number.isFinite(numB);
  if (bothNumeric) return numA - numB;

  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Sell-through by size
// ---------------------------------------------------------------------------

export interface SizeSellThrough {
  size: string;
  unitsSold: number;
  unitsRemaining: number;
  /** Sold / (sold + remaining), as a percentage. */
  sellThroughRate: number;
  revenue: number;
}

/**
 * Sell-through per size: how much of everything we ever held in a size has
 * actually sold.
 *
 * This is the core apparel merchandising number. A size at 90% is being
 * under-bought; a size at 15% is capital sitting on a rail. Denominator is
 * units sold plus units still on hand, which approximates original buy
 * quantity — the app does not store received quantities separately, so this is
 * the closest honest proxy.
 */
export function calculateSellThroughBySize(
  transactions: Transaction[],
  stocks: StockItem[],
): SizeSellThrough[] {
  const sold = new Map<string, { units: number; revenue: number }>();
  const remaining = new Map<string, number>();

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const refunded = getRefundedQuantities(transaction);

    transaction.items.forEach((item, index) => {
      const size = (item.selectedSize || "").trim();
      if (!size) return;

      const netQuantity = Math.max(
        0,
        item.quantity - (refunded.get(index) || 0),
      );
      if (netQuantity === 0) return;

      const entry = sold.get(size) || { units: 0, revenue: 0 };
      entry.units += netQuantity;
      entry.revenue += getSellingPrice(item) * netQuantity;
      sold.set(size, entry);
    });
  });

  stocks.forEach((stock) => {
    stock.colorVariants?.forEach((variant) => {
      variant.sizeQuantities?.forEach((sizeQuantity) => {
        const size = (sizeQuantity.size || "").trim();
        if (!size) return;
        remaining.set(
          size,
          (remaining.get(size) || 0) + (sizeQuantity.quantity || 0),
        );
      });
    });
  });

  const sizes = new Set<string>([...sold.keys(), ...remaining.keys()]);

  return Array.from(sizes)
    .map((size) => {
      const soldEntry = sold.get(size) || { units: 0, revenue: 0 };
      const unitsRemaining = remaining.get(size) || 0;
      const held = soldEntry.units + unitsRemaining;

      return {
        size,
        unitsSold: soldEntry.units,
        unitsRemaining,
        sellThroughRate: held > 0 ? (soldEntry.units / held) * 100 : 0,
        revenue: soldEntry.revenue,
      };
    })
    .filter((row) => row.unitsSold > 0 || row.unitsRemaining > 0)
    .sort((a, b) => compareSizes(a.size, b.size));
}

// ---------------------------------------------------------------------------
// Inventory aging / dead stock
// ---------------------------------------------------------------------------

export type StockHealth = "new" | "healthy" | "slow" | "dead";

export interface StockAging {
  id: string;
  name: string;
  category: string;
  daysSinceRelease: number;
  unitsSold: number;
  unitsRemaining: number;
  /** Cost value of unsold units — the cash actually tied up. */
  capitalTied: number;
  sellThroughRate: number;
  health: StockHealth;
}

/**
 * Classify a line by age and sell-through.
 *
 * Thresholds follow common apparel practice: a season is roughly 90 days, and
 * anything under a quarter sold by the end of one is a markdown candidate.
 */
function classifyHealth(
  daysSinceRelease: number,
  sellThroughRate: number,
): StockHealth {
  if (daysSinceRelease < 30) return "new";
  if (sellThroughRate >= 50) return "healthy";
  if (daysSinceRelease >= 90 && sellThroughRate < 25) return "dead";
  if (sellThroughRate < 25) return "slow";
  return "healthy";
}

/**
 * Inventory aging: which stock lines are old, unsold, and holding cash.
 *
 * Sales are joined to stock on `item.stockId`. Storefront orders set `stockId`
 * to the product id, so online and till sales both attribute correctly.
 */
export function calculateStockAging(
  transactions: Transaction[],
  stocks: StockItem[],
  asOf: Date = new Date(),
): StockAging[] {
  const soldByStock = new Map<string, number>();

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const refunded = getRefundedQuantities(transaction);

    transaction.items.forEach((item, index) => {
      if (!item.stockId) return;
      const netQuantity = Math.max(
        0,
        item.quantity - (refunded.get(index) || 0),
      );
      soldByStock.set(
        item.stockId,
        (soldByStock.get(item.stockId) || 0) + netQuantity,
      );
    });
  });

  return stocks
    .map((stock) => {
      const unitsRemaining =
        stock.colorVariants?.reduce(
          (variantSum, variant) =>
            variantSum +
            (variant.sizeQuantities?.reduce(
              (sizeSum, sizeQuantity) => sizeSum + (sizeQuantity.quantity || 0),
              0,
            ) || 0),
          0,
        ) || 0;

      const unitsSold = soldByStock.get(stock.id) || 0;
      const held = unitsSold + unitsRemaining;
      const sellThroughRate = held > 0 ? (unitsSold / held) * 100 : 0;

      // Fall back to createdAt when releaseDate is missing or unparseable, so a
      // blank field does not silently age the item to day zero.
      const referenceDate = stock.releaseDate || stock.createdAt;
      const released = new Date(referenceDate);
      const daysSinceRelease = Number.isFinite(released.getTime())
        ? Math.max(
            0,
            Math.floor(
              (asOf.getTime() - released.getTime()) / (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

      return {
        id: stock.id,
        name: stock.groupName,
        category: stock.category || "Uncategorised",
        daysSinceRelease,
        unitsSold,
        unitsRemaining,
        capitalTied: unitsRemaining * (stock.originalPrice || 0),
        sellThroughRate,
        health: classifyHealth(daysSinceRelease, sellThroughRate),
      };
    })
    .filter((row) => row.unitsRemaining > 0 || row.unitsSold > 0);
}

export interface StockAgingSummary {
  buckets: Array<{
    health: StockHealth;
    lines: number;
    units: number;
    capitalTied: number;
  }>;
  totalCapitalTied: number;
  deadCapitalTied: number;
  /** Lines to consider marking down, worst offender first. */
  markdownCandidates: StockAging[];
}

export function summariseStockAging(rows: StockAging[]): StockAgingSummary {
  const order: StockHealth[] = ["new", "healthy", "slow", "dead"];

  const buckets = order.map((health) => {
    const matching = rows.filter((row) => row.health === health);
    return {
      health,
      lines: matching.length,
      units: matching.reduce((sum, row) => sum + row.unitsRemaining, 0),
      capitalTied: matching.reduce((sum, row) => sum + row.capitalTied, 0),
    };
  });

  return {
    buckets,
    totalCapitalTied: rows.reduce((sum, row) => sum + row.capitalTied, 0),
    deadCapitalTied: rows
      .filter((row) => row.health === "dead")
      .reduce((sum, row) => sum + row.capitalTied, 0),
    markdownCandidates: rows
      .filter((row) => row.health === "dead" || row.health === "slow")
      .sort((a, b) => b.capitalTied - a.capitalTied)
      .slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export interface SizeReturnRate {
  size: string;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number;
  refundValue: number;
}

/**
 * Return rate per size.
 *
 * A return rate concentrated in one size points at a fit or sizing-chart
 * problem, which is fixable. A rate spread evenly across sizes points at
 * quality or expectation, which is a different fix. Separating the two is the
 * whole reason to cut returns by size rather than reporting one blended number.
 *
 * Denominator is gross units sold, so the rate is "of everything that went out
 * in this size, how much came back".
 */
export function calculateReturnRateBySize(
  transactions: Transaction[],
): SizeReturnRate[] {
  const bySize = new Map<
    string,
    { sold: number; returned: number; refundValue: number }
  >();

  const ensure = (size: string) => {
    const existing = bySize.get(size);
    if (existing) return existing;
    const created = { sold: 0, returned: 0, refundValue: 0 };
    bySize.set(size, created);
    return created;
  };

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    transaction.items.forEach((item) => {
      const size = (item.selectedSize || "").trim();
      if (!size) return;
      ensure(size).sold += item.quantity;
    });

    transaction.refunds?.forEach((refund) => {
      refund.items.forEach((refundItem) => {
        const item = transaction.items[refundItem.itemIndex];
        const size = (item?.selectedSize || "").trim();
        if (!size) return;
        const entry = ensure(size);
        entry.returned += refundItem.quantity;
        entry.refundValue += refundItem.totalAmount;
      });
    });
  });

  return Array.from(bySize.entries())
    .map(([size, data]) => ({
      size,
      unitsSold: data.sold,
      unitsReturned: data.returned,
      returnRate: data.sold > 0 ? (data.returned / data.sold) * 100 : 0,
      refundValue: data.refundValue,
    }))
    .filter((row) => row.unitsSold > 0)
    .sort((a, b) => compareSizes(a.size, b.size));
}

// ---------------------------------------------------------------------------
// Net margin (profit against operating expenses)
// ---------------------------------------------------------------------------

export interface ExpenseRecord {
  date: string;
  currency?: string;
  amount?: number;
}

export interface DailyNetMargin {
  date: string;
  dateKey: string;
  profit: number;
  expense: number;
  net: number;
  /** Net as a percentage of revenue — the number that decides solvency. */
  netMarginRate: number;
  revenue: number;
}

function normaliseCurrency(value?: string): "THB" | "MMK" {
  if (!value) return "THB";
  const upper = String(value).trim().toUpperCase();
  if (upper === "MMK" || upper === "KS" || upper.includes("KYAT")) return "MMK";
  return "THB";
}

/**
 * Daily gross profit against operating expenses, in THB.
 *
 * MMK expenses are converted at `currencyRate` so the two sides of the
 * subtraction share a unit. Without that the net line is meaningless, which is
 * why this takes the rate explicitly rather than defaulting silently.
 */
export function calculateDailyNetMargin(
  transactions: Transaction[],
  expenses: ExpenseRecord[],
  startDate: Date,
  endDate: Date,
  currencyRate: number,
  grain: TimeGrain = chooseTimeGrain(startDate, endDate),
): DailyNetMargin[] {
  const buckets = new Map<
    string,
    { profit: number; expense: number; revenue: number }
  >();

  enumerateBucketKeys(startDate, endDate, grain).forEach((key) => {
    buckets.set(key, { profit: 0, expense: 0, revenue: 0 });
  });

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const entry = buckets.get(bucketKey(transaction.timestamp, grain));
    if (!entry) return;
    entry.profit += getNetProfit(transaction);
    entry.revenue += getNetRevenue(transaction);
  });

  const safeRate = currencyRate > 0 ? currencyRate : 1;

  (expenses || []).forEach((expense) => {
    if (!expense?.date) return;
    const entry = buckets.get(bucketKey(expense.date, grain));
    if (!entry) return;

    const amount = expense.amount || 0;
    entry.expense +=
      normaliseCurrency(expense.currency) === "MMK" ? amount / safeRate : amount;
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => {
      const net = data.profit - data.expense;
      return {
        dateKey,
        date: bucketLabel(dateKey, grain),
        profit: data.profit,
        expense: data.expense,
        net,
        revenue: data.revenue,
        netMarginRate: data.revenue > 0 ? (net / data.revenue) * 100 : 0,
      };
    });
}

// ---------------------------------------------------------------------------
// Staff performance
// ---------------------------------------------------------------------------

export interface StaffPerformance {
  name: string;
  orders: number;
  revenue: number;
  profit: number;
  /** Promotional value this person authorised. */
  discountGiven: number;
  discountRate: number;
  averageBasket: number;
  refundedOrders: number;
  refundRate: number;
  /** True for the bucket holding sales recorded before attribution existed. */
  isUnattributed: boolean;
}

/**
 * Who sold what.
 *
 * Beyond ranking staff, the point is the discount and refund columns: discount
 * authorisation and refund processing are the two routine ways margin leaves a
 * till, and a rate well above the team average is the signal worth a
 * conversation. Reported alongside revenue so a high discount rate on high
 * volume is not mistaken for abuse.
 *
 * Sales predating cashier attribution collect in an `Unattributed` bucket
 * rather than being dropped, so the totals still reconcile with revenue.
 */
export function calculateStaffPerformance(
  transactions: Transaction[],
): StaffPerformance[] {
  const byStaff = new Map<
    string,
    {
      orders: number;
      revenue: number;
      profit: number;
      discount: number;
      refundedOrders: number;
    }
  >();

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const isOnline =
      transaction.orderSource === "web_storefront" ||
      transaction.source === "online";

    const name =
      transaction.soldByName?.trim() ||
      (isOnline ? SELF_SERVICE_LABEL : UNATTRIBUTED_LABEL);

    const entry =
      byStaff.get(name) ||
      { orders: 0, revenue: 0, profit: 0, discount: 0, refundedOrders: 0 };

    entry.orders += 1;
    entry.revenue += getNetRevenue(transaction);
    entry.profit += getNetProfit(transaction);
    entry.discount += getPromotionDiscount(transaction);
    if ((transaction.refunds?.length || 0) > 0) entry.refundedOrders += 1;

    byStaff.set(name, entry);
  });

  return Array.from(byStaff.entries())
    .map(([name, data]) => {
      const gross = data.revenue + data.discount;
      return {
        name,
        orders: data.orders,
        revenue: data.revenue,
        profit: data.profit,
        discountGiven: data.discount,
        discountRate: gross > 0 ? (data.discount / gross) * 100 : 0,
        averageBasket: data.orders > 0 ? data.revenue / data.orders : 0,
        refundedOrders: data.refundedOrders,
        refundRate: data.orders > 0 ? (data.refundedOrders / data.orders) * 100 : 0,
        isUnattributed: name === UNATTRIBUTED_LABEL,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Sales channel split
// ---------------------------------------------------------------------------

export interface ChannelSplitPoint {
  date: string;
  dateKey: string;
  pos: number;
  online: number;
  onlineShare: number;
}

/**
 * Revenue split between the till and the storefront over time.
 *
 * Both apps write to the same Firestore project, so this needs no joining.
 * `orderSource` is the intended discriminator but older storefront documents
 * carry only `source: "online"`, so both are checked.
 */
export function calculateChannelSplit(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
  grain: TimeGrain = chooseTimeGrain(startDate, endDate),
): ChannelSplitPoint[] {
  const buckets = new Map<string, { pos: number; online: number }>();

  enumerateBucketKeys(startDate, endDate, grain).forEach((key) => {
    buckets.set(key, { pos: 0, online: 0 });
  });

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const entry = buckets.get(bucketKey(transaction.timestamp, grain));
    if (!entry) return;

    const isOnline =
      transaction.orderSource === "web_storefront" ||
      transaction.source === "online";

    if (isOnline) entry.online += getNetRevenue(transaction);
    else entry.pos += getNetRevenue(transaction);
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => {
      const total = data.pos + data.online;
      return {
        dateKey,
        date: bucketLabel(dateKey, grain),
        pos: data.pos,
        online: data.online,
        onlineShare: total > 0 ? (data.online / total) * 100 : 0,
      };
    });
}

// ---------------------------------------------------------------------------
// Membership / loyalty economics
// ---------------------------------------------------------------------------

/**
 * Minimal view of a customer needed for loyalty reporting.
 *
 * Deliberately narrower than `Customer` so this module does not depend on the
 * customer type, and so callers are forced to notice that `totalSpent` and
 * `totalPurchases` are *not* used here — no POS code path ever increments them
 * (they are seeded to 0 at creation and only ever displayed), so spend has to be
 * aggregated from `transactions` instead.
 */
export interface LoyaltyCustomer {
  uid: string;
  isMember?: boolean;
  memberSince?: Date | string | { toDate?: () => Date } | null;
  loyaltyPoints?: number;
  totalPointsEarned?: number;
  coupons?: Array<{
    status: "active" | "used" | "expired";
    pointsCost?: number;
    discountType?: "percentage" | "fixed";
    discountValue?: number;
    expiresAt?: Date | string | { toDate?: () => Date } | null;
    usedAt?: Date | string | { toDate?: () => Date } | null;
  }>;
}

/** Firestore Timestamps, ISO strings and Dates all arrive here; normalise. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (
    typeof value === "object" &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Build a "was this person a member when they bought?" test.
 *
 * Shared so every loyalty figure classifies sales the same way. Current
 * membership alone is not enough: someone who joined last week has purchase
 * history from before they joined, and crediting that to the programme would
 * flatter it with revenue it had nothing to do with.
 */
export function buildMembershipIndex(customers: LoyaltyCustomer[]) {
  const joined = new Map<string, Date | null>();
  const enrolled = new Map<string, boolean>();

  customers.forEach((customer) => {
    if (!customer.uid) return;
    enrolled.set(customer.uid, !!customer.isMember);
    joined.set(customer.uid, toDate(customer.memberSince));
  });

  return function wasMemberAt(uid: string | undefined, soldAt: Date): boolean {
    if (!uid || !enrolled.get(uid)) return false;
    const since = joined.get(uid) ?? null;
    return !since || soldAt >= since;
  };
}

export interface CohortEconomics {
  label: string;
  customers: number;
  orders: number;
  revenue: number;
  grossProfit: number;
  /** Coupon value redeemed. Zero by definition for the non-member cohort. */
  loyaltyCost: number;
  /** Gross profit less loyalty cost. */
  netProfit: number;
  averageBasket: number;
  /** Orders per distinct customer — the frequency half of loyalty value. */
  ordersPerCustomer: number;
  grossMarginRate: number;
  netMarginRate: number;
}

export interface LoyaltyEconomics {
  member: CohortEconomics;
  nonMember: CohortEconomics;
  /** Member average basket vs non-member, as a percentage difference. */
  basketUplift: number;
  /** Member orders-per-customer vs non-member, as a percentage difference. */
  frequencyUplift: number;
  /** Loyalty cost as a share of member revenue — the programme's take rate. */
  loyaltyCostRate: number;
  /** Sales that could not be classified because no customer was attached. */
  unattributedOrders: number;
  unattributedRevenue: number;
}

function emptyCohort(label: string): CohortEconomics {
  return {
    label,
    customers: 0,
    orders: 0,
    revenue: 0,
    grossProfit: 0,
    loyaltyCost: 0,
    netProfit: 0,
    averageBasket: 0,
    ordersPerCustomer: 0,
    grossMarginRate: 0,
    netMarginRate: 0,
  };
}

function finaliseCohort(
  cohort: CohortEconomics,
  customerIds: Set<string>,
): CohortEconomics {
  cohort.customers = customerIds.size;
  cohort.netProfit = cohort.grossProfit - cohort.loyaltyCost;
  cohort.averageBasket = cohort.orders > 0 ? cohort.revenue / cohort.orders : 0;
  cohort.ordersPerCustomer =
    cohort.customers > 0 ? cohort.orders / cohort.customers : 0;
  cohort.grossMarginRate =
    cohort.revenue > 0 ? (cohort.grossProfit / cohort.revenue) * 100 : 0;
  cohort.netMarginRate =
    cohort.revenue > 0 ? (cohort.netProfit / cohort.revenue) * 100 : 0;
  return cohort;
}

/**
 * Member versus non-member economics — whether the loyalty programme earns more
 * than it gives away.
 *
 * `Transaction` carries no membership flag, so sales are classified by joining
 * `customer.uid` (falling back to `customerUid`) against the customer list.
 * A sale is only counted as a member sale if it happened on or after that
 * customer's `memberSince`, otherwise early purchases by someone who joined
 * later would be credited to the programme retroactively and inflate it.
 *
 * Walk-in sales with no customer attached cannot be classified either way and
 * are reported separately rather than being lumped into non-member, which would
 * understate non-member basket size.
 *
 * IMPORTANT for interpretation: this measures correlation, not causation.
 * Frequent shoppers are the ones who join loyalty programmes, so members would
 * out-spend non-members even if the programme did nothing. Treat a positive
 * uplift as "the member cohort is worth more", not "the programme created this".
 */
export function calculateLoyaltyEconomics(
  transactions: Transaction[],
  customers: LoyaltyCustomer[],
): LoyaltyEconomics {
  const wasMemberAt = buildMembershipIndex(customers);

  const member = emptyCohort("member");
  const nonMember = emptyCohort("nonMember");
  const memberIds = new Set<string>();
  const nonMemberIds = new Set<string>();

  let unattributedOrders = 0;
  let unattributedRevenue = 0;

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const uid = transaction.customer?.uid || transaction.customerUid;
    const revenue = getNetRevenue(transaction);
    const profit = getNetProfit(transaction);
    const couponCost = getCouponCost(transaction);

    if (!uid) {
      unattributedOrders += 1;
      unattributedRevenue += revenue;
      return;
    }

    const wasMemberAtSale = wasMemberAt(uid, new Date(transaction.timestamp));

    const cohort = wasMemberAtSale ? member : nonMember;
    const ids = wasMemberAtSale ? memberIds : nonMemberIds;

    ids.add(uid);
    cohort.orders += 1;
    cohort.revenue += revenue;
    cohort.grossProfit += profit;
    cohort.loyaltyCost += couponCost;
  });

  finaliseCohort(member, memberIds);
  finaliseCohort(nonMember, nonMemberIds);

  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

  return {
    member,
    nonMember,
    basketUplift: pct(member.averageBasket, nonMember.averageBasket),
    frequencyUplift: pct(member.ordersPerCustomer, nonMember.ordersPerCustomer),
    loyaltyCostRate:
      member.revenue > 0 ? (member.loyaltyCost / member.revenue) * 100 : 0,
    unattributedOrders,
    unattributedRevenue,
  };
}

export interface LoyaltyCostPoint {
  date: string;
  dateKey: string;
  loyaltyCost: number;
  memberRevenue: number;
  /** Coupon value as a share of member revenue that day. */
  costRate: number;
  redemptions: number;
}

/**
 * Loyalty cost against the member revenue it bought, over time.
 *
 * The cost rate is the number to watch. Retail loyalty programmes are usually
 * run at a low single-digit percentage of revenue; a rate climbing well past
 * that means the reward tiers are priced too generously for the margin.
 */
export function calculateLoyaltyCostTrend(
  transactions: Transaction[],
  customers: LoyaltyCustomer[],
  startDate: Date,
  endDate: Date,
  grain: TimeGrain = chooseTimeGrain(startDate, endDate),
): LoyaltyCostPoint[] {
  // Same classification as calculateLoyaltyEconomics, so the cost rate here and
  // the cohort table there are computed off the same member revenue.
  const wasMemberAt = buildMembershipIndex(customers);

  const buckets = new Map<
    string,
    { loyaltyCost: number; memberRevenue: number; redemptions: number }
  >();

  enumerateBucketKeys(startDate, endDate, grain).forEach((key) => {
    buckets.set(key, { loyaltyCost: 0, memberRevenue: 0, redemptions: 0 });
  });

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const entry = buckets.get(bucketKey(transaction.timestamp, grain));
    if (!entry) return;

    const uid = transaction.customer?.uid || transaction.customerUid;
    const couponCost = getCouponCost(transaction);

    if (wasMemberAt(uid, new Date(transaction.timestamp))) {
      entry.memberRevenue += getNetRevenue(transaction);
    }

    if (couponCost > 0) {
      entry.loyaltyCost += couponCost;
      entry.redemptions += 1;
    }
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => ({
      dateKey,
      date: bucketLabel(dateKey, grain),
      loyaltyCost: data.loyaltyCost,
      memberRevenue: data.memberRevenue,
      redemptions: data.redemptions,
      costRate:
        data.memberRevenue > 0
          ? (data.loyaltyCost / data.memberRevenue) * 100
          : 0,
    }));
}

export interface RedemptionFunnel {
  /** Members holding at least one point or coupon. */
  enrolledMembers: number;
  pointsOutstanding: number;
  pointsEarnedLifetime: number;
  couponsIssued: number;
  couponsUsed: number;
  couponsActive: number;
  couponsExpired: number;
  /** Issued coupons that expired unused, as a percentage — programme breakage. */
  breakageRate: number;
  redemptionRate: number;
  /**
   * Face value of unused, unexpired coupons.
   *
   * Only meaningful for fixed-value coupons; percentage coupons have no value
   * until applied to a basket, so they are excluded and counted here instead.
   */
  outstandingFixedValue: number;
  percentageCouponsOutstanding: number;
}

/**
 * Redemption and breakage across the whole member base.
 *
 * Coupon status is re-derived from `expiresAt` rather than trusted, because
 * `LoyaltyService.expireOldCoupons` only ever runs per-customer on demand —
 * there is no scheduler — so stale coupons sit in Firestore still marked
 * `active` and would otherwise be reported as live liability.
 */
export function calculateRedemptionFunnel(
  customers: LoyaltyCustomer[],
  asOf: Date = new Date(),
): RedemptionFunnel {
  let enrolledMembers = 0;
  let pointsOutstanding = 0;
  let pointsEarnedLifetime = 0;
  let couponsIssued = 0;
  let couponsUsed = 0;
  let couponsActive = 0;
  let couponsExpired = 0;
  let outstandingFixedValue = 0;
  let percentageCouponsOutstanding = 0;

  customers.forEach((customer) => {
    const points = customer.loyaltyPoints || 0;
    const lifetime = customer.totalPointsEarned || 0;
    const coupons = customer.coupons || [];

    if (customer.isMember || points > 0 || lifetime > 0) enrolledMembers += 1;

    pointsOutstanding += points;
    pointsEarnedLifetime += lifetime;

    coupons.forEach((coupon) => {
      couponsIssued += 1;

      if (coupon.status === "used") {
        couponsUsed += 1;
        return;
      }

      const expiresAt = toDate(coupon.expiresAt);
      const hasLapsed = expiresAt ? expiresAt < asOf : false;

      if (coupon.status === "expired" || hasLapsed) {
        couponsExpired += 1;
        return;
      }

      couponsActive += 1;

      if (coupon.discountType === "fixed") {
        outstandingFixedValue += Number(coupon.discountValue) || 0;
      } else {
        percentageCouponsOutstanding += 1;
      }
    });
  });

  const settled = couponsUsed + couponsExpired;

  return {
    enrolledMembers,
    pointsOutstanding,
    pointsEarnedLifetime,
    couponsIssued,
    couponsUsed,
    couponsActive,
    couponsExpired,
    breakageRate: settled > 0 ? (couponsExpired / settled) * 100 : 0,
    redemptionRate: couponsIssued > 0 ? (couponsUsed / couponsIssued) * 100 : 0,
    outstandingFixedValue,
    percentageCouponsOutstanding,
  };
}

export interface PointsLiability {
  pointsOutstanding: number;
  /** Cheapest tier the outstanding balance could be spent on. */
  pointsPerReward: number;
  rewardsRedeemable: number;
  /** Estimated cost if every redeemable point were spent. */
  estimatedLiability: number;
  /** True when tiers are percentage-based, making the estimate basket-dependent. */
  isEstimate: boolean;
}

/**
 * What the outstanding points balance could cost if it were all spent.
 *
 * Unredeemed points are a real obligation, not a free marketing gesture — the
 * business has already promised the discount and simply has not paid it yet.
 * Nothing in the app currently shows it.
 *
 * Valued at the cheapest enabled tier, which is the most conservative
 * assumption a customer could make. `averageBasket` is required for
 * percentage-based tiers because a "10% off" reward has no fixed cost until it
 * meets a basket.
 */
export function calculatePointsLiability(
  customers: LoyaltyCustomer[],
  tiers: Array<{
    pointsRequired: number;
    discountType: "percentage" | "fixed";
    discountValue: number;
    enabled?: boolean;
  }>,
  averageBasket: number,
): PointsLiability {
  const pointsOutstanding = customers.reduce(
    (sum, customer) => sum + (customer.loyaltyPoints || 0),
    0,
  );

  const usable = tiers
    .filter((tier) => tier.enabled !== false && Number(tier.pointsRequired) > 0)
    .sort((a, b) => Number(a.pointsRequired) - Number(b.pointsRequired));

  const cheapest = usable[0];

  if (!cheapest) {
    return {
      pointsOutstanding,
      pointsPerReward: 0,
      rewardsRedeemable: 0,
      estimatedLiability: 0,
      isEstimate: false,
    };
  }

  const pointsPerReward = Number(cheapest.pointsRequired);
  const rewardsRedeemable = Math.floor(pointsOutstanding / pointsPerReward);

  const rewardValue =
    cheapest.discountType === "fixed"
      ? Number(cheapest.discountValue) || 0
      : (averageBasket * (Number(cheapest.discountValue) || 0)) / 100;

  return {
    pointsOutstanding,
    pointsPerReward,
    rewardsRedeemable,
    estimatedLiability: rewardsRedeemable * rewardValue,
    isEstimate: cheapest.discountType === "percentage",
  };
}

// ---------------------------------------------------------------------------
// Revenue and promotion series
// ---------------------------------------------------------------------------

export interface RevenueSeriesPoint {
  date: string;
  dateKey: string;
  revenue: number;
  profit: number;
  orders: number;
}

/**
 * Revenue, profit and order count over time.
 *
 * Moved here from the dashboard, which computed it inline with two defects: it
 * sorted on the formatted label (losing the year on any multi-year range) and
 * it measured profit from `unitPrice`, disagreeing with the reports page on
 * every discounted line. Both are fixed by bucketing on sortable keys and
 * using `getNetProfit`.
 */
export function calculateRevenueSeries(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
  grain: TimeGrain = chooseTimeGrain(startDate, endDate),
): RevenueSeriesPoint[] {
  const buckets = new Map<
    string,
    { revenue: number; profit: number; orders: number }
  >();

  enumerateBucketKeys(startDate, endDate, grain).forEach((key) => {
    buckets.set(key, { revenue: 0, profit: 0, orders: 0 });
  });

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const entry = buckets.get(bucketKey(transaction.timestamp, grain));
    if (!entry) return;

    entry.revenue += getNetRevenue(transaction);
    entry.profit += getNetProfit(transaction);
    entry.orders += 1;
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => ({
      dateKey,
      date: bucketLabel(dateKey, grain),
      revenue: data.revenue,
      profit: data.profit,
      orders: data.orders,
    }));
}

export interface PromotionSeriesPoint {
  date: string;
  dateKey: string;
  promotionDiscount: number;
  revenue: number;
  discountedOrders: number;
  totalOrders: number;
  discountRate: number;
}

/** Promotional giveaway against revenue over time. */
export function calculatePromotionSeries(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
  grain: TimeGrain = chooseTimeGrain(startDate, endDate),
): PromotionSeriesPoint[] {
  const buckets = new Map<
    string,
    {
      promotionDiscount: number;
      revenue: number;
      discountedOrders: number;
      totalOrders: number;
    }
  >();

  enumerateBucketKeys(startDate, endDate, grain).forEach((key) => {
    buckets.set(key, {
      promotionDiscount: 0,
      revenue: 0,
      discountedOrders: 0,
      totalOrders: 0,
    });
  });

  transactions.filter(isRevenueTransaction).forEach((transaction) => {
    const entry = buckets.get(bucketKey(transaction.timestamp, grain));
    if (!entry) return;

    const promotionDiscount = getPromotionDiscount(transaction);

    entry.revenue += getNetRevenue(transaction);
    entry.promotionDiscount += promotionDiscount;
    entry.totalOrders += 1;
    if (promotionDiscount > 0) entry.discountedOrders += 1;
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => {
      const gross = data.revenue + data.promotionDiscount;
      return {
        dateKey,
        date: bucketLabel(dateKey, grain),
        promotionDiscount: data.promotionDiscount,
        revenue: data.revenue,
        discountedOrders: data.discountedOrders,
        totalOrders: data.totalOrders,
        discountRate: gross > 0 ? (data.promotionDiscount / gross) * 100 : 0,
      };
    });
}

/**
 * Pearson correlation between promotional spend and revenue per bucket.
 *
 * Needs at least three active buckets to mean anything, and returns null rather
 * than a misleading number when either series has no variance.
 */
export function calculatePromotionCorrelation(
  points: PromotionSeriesPoint[],
): number | null {
  const active = points.filter(
    (point) => point.totalOrders > 0 || point.promotionDiscount > 0,
  );
  if (active.length < 3) return null;

  const n = active.length;
  const meanX =
    active.reduce((sum, point) => sum + point.promotionDiscount, 0) / n;
  const meanY = active.reduce((sum, point) => sum + point.revenue, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  active.forEach((point) => {
    const dx = point.promotionDiscount - meanX;
    const dy = point.revenue - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  });

  if (varianceX === 0 || varianceY === 0) return null;

  return covariance / Math.sqrt(varianceX * varianceY);
}
