import { roundMoney } from "@/lib/money";

/**
 * The delivery fee a sale or order recorded, in THB (0 when none).
 *
 * Written on POS COD sales (Payment Clearance) and storefront orders, always
 * already included in `total`, never taxed. Older records have no field.
 */
export function deliveryFeeOf(
  record: { deliveryFee?: unknown } | null | undefined,
): number {
  const fee = Number(record?.deliveryFee);
  return Number.isFinite(fee) && fee > 0 ? roundMoney(fee, "THB") : 0;
}

/** Sum of the delivery fees of many records, rounded to satang. */
export function totalDeliveryFees(
  records: ReadonlyArray<{ deliveryFee?: unknown } | null | undefined>,
): number {
  return roundMoney(
    records.reduce((sum, record) => sum + deliveryFeeOf(record), 0),
    "THB",
  );
}
