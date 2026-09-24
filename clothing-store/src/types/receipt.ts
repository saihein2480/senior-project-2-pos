/**
 * Receipt / invoice presentation types.
 *
 * The cart is where every price decision actually happens: wholesale tiers,
 * group and variant discounts (percentage and fixed), a cart-wide discount, a
 * loyalty coupon, then tax. By the time a sale reaches the transaction document
 * those seven inputs have been collapsed into two numbers (`subtotal` and
 * `discount`), which is enough for accounting but not enough to print a receipt
 * a customer can check.
 *
 * `ReceiptBreakdown` carries the un-collapsed version from the cart to the
 * receipt so the printed document can show *why* the total is what it is.
 *
 * Every amount is in the business's base currency (`defaultCurrency`). The
 * receipt converts to the selling currency at render time, exactly as the rest
 * of the POS does, so a single breakdown prints correctly in either currency.
 *
 * The figures are internally consistent by construction, and they reconcile at
 * two levels so a customer can check the receipt line by line:
 *
 *   sum of lines[].lineOriginalTotal = grossSubtotal
 *     - (wholesaleSavings + groupPercentSavings + groupFixedTotal
 *        + variantPercentSavings + variantFixedTotal)
 *   = itemsTotal = sum of lines[].lineFinalTotal
 *     - cartDiscount
 *   = subtotalAfterDiscounts
 *     - couponDiscount
 *   = taxableBase
 *     + tax
 *   = total
 */

/** Why a single cart line costs what it costs. */
export interface ReceiptLineDetail {
  /** Matches `CartItem.id`, so the receipt can pair detail with its line. */
  itemId: string;
  /** Catalogue price per unit, before any discount at all. */
  originalUnitPrice: number;
  /** Price per unit actually charged, after every line-level discount. */
  finalUnitPrice: number;
  /** `originalUnitPrice * quantity`. */
  lineOriginalTotal: number;
  /** `finalUnitPrice * quantity`. */
  lineFinalTotal: number;
  /** `lineOriginalTotal - lineFinalTotal`; zero when nothing was discounted. */
  lineSavings: number;
  /**
   * Human-readable reasons for the saving, e.g. "Wholesale", "Group -10%",
   * "Variant -5%", "Fixed -฿20". Printed under the line so the customer can see
   * which promotion applied rather than just a smaller number.
   */
  discountLabels: string[];
}

/** The complete money story for one sale, ready to print. */
export interface ReceiptBreakdown {
  /** Sum of every line at its undiscounted catalogue price. */
  grossSubtotal: number;

  /**
   * Savings that belong to individual lines, and so are shown on those lines.
   *
   * Wholesale tiers and group/variant discounts all price a specific item, which
   * is why they are reported per line as well as totalled here. The cart discount
   * and the coupon apply to the order as a whole and are kept separate below.
   */
  wholesaleSavings: number;
  /** Percentage discounts applied to a whole product group. */
  groupPercentSavings: number;
  /** Fixed-amount discounts applied to a whole product group. */
  groupFixedTotal: number;
  /** Percentage discounts applied to a specific colour/size variant. */
  variantPercentSavings: number;
  /** Fixed-amount discounts applied to a specific colour/size variant. */
  variantFixedTotal: number;
  /** Cart-wide discount, either a percentage or a fixed amount. */
  cartDiscount: number;
  /** The percentage behind `cartDiscount`, or 0 when a fixed amount was used. */
  cartDiscountPercent: number;

  /**
   * What the lines add up to once their own discounts are applied: `grossSubtotal`
   * minus the five line-level savings above, and equal to the sum of
   * `lines[].lineFinalTotal`.
   *
   * This is the figure the printed item lines visibly reconcile with, which the
   * gross subtotal alone cannot do once anything is discounted.
   */
  itemsTotal: number;

  /** `itemsTotal` minus the cart discount; the base the coupon is taken off. */
  subtotalAfterDiscounts: number;

  /** Loyalty coupon code, when one was redeemed at the till. */
  couponCode?: string;
  /** Value of that coupon; applied after all other discounts, before tax. */
  couponDiscount: number;

  /** Amount tax was charged on: `subtotalAfterDiscounts - couponDiscount`. */
  taxableBase: number;
  /** Tax rate as a percentage, e.g. 7 for 7%. */
  taxRate: number;
  /** Tax charged. */
  tax: number;

  /** What the customer owes. */
  total: number;
  /** Every discount and the coupon added together. */
  totalSavings: number;

  /** Per-line detail, in cart order. */
  lines: ReceiptLineDetail[];
}
