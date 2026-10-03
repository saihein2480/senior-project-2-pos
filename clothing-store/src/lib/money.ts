/**
 * Money helpers shared by the POS browser code and its server routes.
 *
 * Amounts are stored as JavaScript numbers in the currency's major unit (THB,
 * MMK), which is what every existing document already holds. Floating-point
 * error is contained by rounding to the currency's minor unit at every step
 * that produces a stored or compared figure, rather than only when displaying.
 *
 *   THB: 2 decimals (satang)
 *   MMK: 0 decimals (kyat has no minor unit in practice)
 *
 * Pure: no Firebase or React imports.
 */

export type CurrencyCode = "THB" | "MMK";

export const CURRENCY_DECIMALS: Record<CurrencyCode, number> = {
  THB: 2,
  MMK: 0,
};

/** Round to `decimals` places. Non-finite input becomes 0. */
export function roundTo(value: number, decimals: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  // EPSILON nudges values like 1.005 that sit just below the half-way point
  // because of binary representation.
  return Math.round((n + Math.sign(n) * Number.EPSILON) * factor) / factor;
}

/** Round to the currency's minor unit (THB by default). */
export function roundMoney(value: number, currency: CurrencyCode = "THB"): number {
  return roundTo(value, CURRENCY_DECIMALS[currency] ?? 2);
}

/** Sum and round in one step, so the sum itself carries no float residue. */
export function sumMoney(values: number[], currency: CurrencyCode = "THB"): number {
  return roundMoney(
    values.reduce((sum, v) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0),
    currency,
  );
}

/** Equal within half a minor unit. Use instead of `===` / `>=` on money. */
export function sameMoney(a: number, b: number, currency: CurrencyCode = "THB"): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const halfUnit = 0.5 / 10 ** (CURRENCY_DECIMALS[currency] ?? 2);
  return Math.abs(x - y) < halfUnit;
}

/** `a > b` by at least one minor unit (so 100.000001 is not "more than" 100). */
export function exceedsMoney(a: number, b: number, currency: CurrencyCode = "THB"): boolean {
  return roundMoney(a, currency) > roundMoney(b, currency) && !sameMoney(a, b, currency);
}

/** Never negative, rounded. */
export function nonNegativeMoney(value: number, currency: CurrencyCode = "THB"): number {
  return Math.max(0, roundMoney(value, currency));
}

/** a / b, or `fallback` when b is 0 or either side is not a finite number. */
export function safeDivide(a: number, b: number, fallback = 0): number {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return fallback;
  const result = x / y;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Convert between THB and MMK. `rate` is "1 base = rate other", where base is
 * the business's default currency (the convention SettingsService uses). A
 * missing or non-positive rate returns the amount unchanged instead of
 * Infinity/NaN, so a misconfigured rate can never produce an infinite price.
 */
export function convertMoney(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: number,
  baseCurrency: CurrencyCode = "THB",
): number {
  if (from === to) return roundMoney(amount, to);
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return roundMoney(amount, to);

  const converted =
    from === baseCurrency ? Number(amount) * r : safeDivide(Number(amount), r, 0);
  return roundMoney(converted, to);
}

/** "฿1,234.50" / "Ks 1,235". Uses the currency's own number of decimals. */
export function formatMoney(value: number, currency: CurrencyCode = "THB"): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const amount = roundMoney(value, currency).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency === "MMK" ? `Ks ${amount}` : `฿${amount}`;
}
