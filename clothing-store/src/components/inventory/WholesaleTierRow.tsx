"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { WholesaleTier } from "@/types/stock";
import { usePriceEntryCurrency } from "@/hooks/usePriceEntryCurrency";
import { roundMoney } from "@/lib/money";

interface WholesaleTierRowProps {
  /** `price` is the total for `minQuantity` items, in the default currency. */
  tier: WholesaleTier;
  onChange: (tier: WholesaleTier) => void;
  onRemove: () => void;
  /** Regular selling price per item (default currency), for the savings hint. */
  unitPrice?: number | null;
}

/** Parsed non-negative number, or null for blank / invalid input. */
function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * One wholesale tier: Min Quantity | Price per item | Total Price.
 *
 * Price per item and Total Price fill each other in (total = per item x
 * quantity). Only the total is stored, as `tier.price`, because that is what
 * checkout charges for the bundle (ShoppingCartModal divides it by the
 * quantity to get the per-item price). Changing the quantity keeps the
 * per-item price and recalculates the total.
 *
 * Amounts are typed in the top-nav currency and stored in the default one,
 * like every other price on the stock forms (see usePriceEntryCurrency).
 */
export function WholesaleTierRow({
  tier,
  onChange,
  onRemove,
  unitPrice,
}: WholesaleTierRowProps) {
  const {
    entryCurrency,
    entrySymbol,
    defaultCurrency,
    currencyRate,
    toEntry,
    toBase,
    formatPrice,
  } = usePriceEntryCurrency();

  const round = (value: number) => roundMoney(value, entryCurrency);
  const toText = (value: number | null) =>
    value === null || !Number.isFinite(value) ? "" : String(value);

  /** Both boxes, worked out from the stored tier. */
  const textsFromTier = () => {
    const total = tier.price > 0 ? round(toEntry(tier.price)) : null;
    const perItem =
      total !== null && tier.minQuantity > 0 ? round(total / tier.minQuantity) : null;
    return { total: toText(total), perItem: toText(perItem) };
  };

  // What is in the two price boxes. Kept as typed ("12." stays "12."), and
  // re-derived only when the currency the prices are shown in changes.
  const [texts, setTexts] = useState(() => ({
    ...textsFromTier(),
    entryCurrency,
    defaultCurrency,
    currencyRate,
  }));
  if (
    texts.entryCurrency !== entryCurrency ||
    texts.defaultCurrency !== defaultCurrency ||
    texts.currencyRate !== currencyRate
  ) {
    setTexts({ ...textsFromTier(), entryCurrency, defaultCurrency, currencyRate });
  }

  const priceFromTotal = (total: number | null) =>
    total === null ? 0 : toBase(total);

  const handleQuantityChange = (raw: string) => {
    const quantity = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
    const perItem = parseAmount(texts.perItem);
    let total = parseAmount(texts.total);

    if (quantity > 0 && perItem !== null) {
      // Keep the per-item price; the bundle total follows the quantity.
      total = round(perItem * quantity);
      setTexts((prev) => ({ ...prev, total: toText(total) }));
    } else if (quantity > 0 && total !== null) {
      setTexts((prev) => ({ ...prev, perItem: toText(round(total! / quantity)) }));
    }

    onChange({ ...tier, minQuantity: quantity, price: priceFromTotal(total) });
  };

  const handlePerItemChange = (raw: string) => {
    const perItem = parseAmount(raw);
    const total =
      perItem !== null && tier.minQuantity > 0
        ? round(perItem * tier.minQuantity)
        : perItem === null
          ? null
          : parseAmount(texts.total);
    setTexts((prev) => ({
      ...prev,
      perItem: raw,
      total: perItem === null ? "" : tier.minQuantity > 0 ? toText(total) : prev.total,
    }));
    onChange({ ...tier, price: priceFromTotal(total) });
  };

  const handleTotalChange = (raw: string) => {
    const total = parseAmount(raw);
    const perItem =
      total !== null && tier.minQuantity > 0 ? round(total / tier.minQuantity) : null;
    setTexts((prev) => ({
      ...prev,
      total: raw,
      perItem: total === null ? "" : perItem !== null ? toText(perItem) : prev.perItem,
    }));
    onChange({ ...tier, price: priceFromTotal(total) });
  };

  // Savings against the regular price, so a tier that costs more is obvious.
  const perItemValue = parseAmount(texts.perItem);
  const regular = unitPrice && unitPrice > 0 ? toEntry(unitPrice) : null;
  const saving =
    regular && perItemValue !== null && perItemValue > 0
      ? ((regular - perItemValue) / regular) * 100
      : null;

  const step = entryCurrency === "MMK" ? "1" : "0.01";
  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100";
  const idBase = `tier-${tier.id}`;

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-end gap-3 sm:gap-4">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div>
            <label htmlFor={`${idBase}-qty`} className="mb-1 block text-sm font-medium text-gray-700">
              Min Quantity
            </label>
            <input
              id={`${idBase}-qty`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={tier.minQuantity === 0 ? "" : tier.minQuantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-each`} className="mb-1 block text-sm font-medium text-gray-700">
              Price per item ({entrySymbol})
            </label>
            <input
              id={`${idBase}-each`}
              type="number"
              min="0"
              step={step}
              inputMode="decimal"
              placeholder={entryCurrency === "MMK" ? "0" : "0.00"}
              value={texts.perItem}
              onChange={(e) => handlePerItemChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-total`} className="mb-1 block text-sm font-medium text-gray-700">
              Total Price ({entrySymbol})
            </label>
            <input
              id={`${idBase}-total`}
              type="number"
              min="0"
              step={step}
              inputMode="decimal"
              placeholder={entryCurrency === "MMK" ? "0" : "0.00"}
              value={texts.total}
              onChange={(e) => handleTotalChange(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <button
          type="button"
          title="Remove wholesale tier"
          aria-label="Remove wholesale tier"
          onClick={onRemove}
          className="mb-0.5 rounded-md p-2 text-red-600 hover:bg-red-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* One line explaining what the tier means at checkout */}
      {tier.minQuantity > 0 && tier.price > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {tier.minQuantity} items for{" "}
          <span className="font-semibold text-gray-700">{formatPrice(tier.price)}</span>
          {saving !== null &&
            (saving > 0 ? (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                Saves {saving.toFixed(0)}% vs regular
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                Not lower than the regular price ({formatPrice(unitPrice!)})
              </span>
            ))}
        </p>
      )}
    </div>
  );
}
