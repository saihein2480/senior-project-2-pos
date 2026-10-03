import type { Cart } from "@/types/cart";

/**
 * Key-order-independent form of a value, for comparing carts.
 *
 * Firestore hands map fields back in its own (sorted) order and drops
 * `undefined`, so a plain JSON.stringify of the stored cart never matched
 * the cart this browser had just saved: every echo of our own save looked
 * like an edit from another device, and a late echo of an older save put
 * removed items back in the cart. Timestamps and Dates compare by instant.
 */
export function stableCartValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(stableCartValue);
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object") {
    const withMillis = value as { toMillis?: unknown };
    if (typeof withMillis.toMillis === "function") {
      return (withMillis.toMillis as () => number).call(value);
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      out[key] = stableCartValue(entry);
    }
    return out;
  }
  return value;
}

/**
 * What every browser signed in as the same user must agree on.
 *
 * `currency` is intentionally excluded: it is a per-browser display choice,
 * not shared state; including it would stop two browsers viewing different
 * currencies from ever agreeing.
 */
export function cartSignature(
  value: Pick<Cart, "items" | "totalItems" | "totalAmount" | "selectedCustomer" | "appliedCoupon">,
): string {
  return JSON.stringify(
    stableCartValue({
      items: value.items,
      totalItems: value.totalItems,
      totalAmount: value.totalAmount,
      selectedCustomer: value.selectedCustomer ?? null,
      appliedCoupon: value.appliedCoupon ?? null,
    }),
  );
}
