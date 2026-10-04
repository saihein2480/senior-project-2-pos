"use client";

import { InputHTMLAttributes, useState } from "react";
import { usePriceEntryCurrency } from "@/hooks/usePriceEntryCurrency";

interface CurrencyPriceInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Price in the business default currency (what gets stored). */
  value: number | null;
  /** Called with the new price in the default currency, or null when cleared. */
  onChange: (value: number | null) => void;
}

/**
 * Number input that shows and accepts a price in the top-nav currency while
 * the parent keeps the value in the default currency.
 *
 * The typed text is kept as-is while the owner is typing ("12." stays "12."),
 * and is only re-derived from `value` when the value changes from outside or
 * the entry currency / rate changes. A price that is never touched therefore
 * goes back to the server exactly as it was loaded, with no round-trip
 * rounding through the other currency.
 */
export function CurrencyPriceInput({
  value,
  onChange,
  ...inputProps
}: CurrencyPriceInputProps) {
  const { entryCurrency, defaultCurrency, currencyRate, toEntry, toBase } =
    usePriceEntryCurrency();

  const format = (base: number | null) =>
    base === null || !Number.isFinite(base) ? "" : String(toEntry(base));

  const [synced, setSynced] = useState(() => ({
    value,
    entryCurrency,
    defaultCurrency,
    currencyRate,
    text: format(value),
  }));

  // Re-derive the text during render when the inputs it depends on change
  // (React's recommended alternative to syncing state in an effect). 0 and
  // null are treated alike: forms store "empty" as 0 and pass it back as null,
  // and that must not wipe what the owner is in the middle of typing.
  if (
    (synced.value || null) !== (value || null) ||
    synced.entryCurrency !== entryCurrency ||
    synced.defaultCurrency !== defaultCurrency ||
    synced.currencyRate !== currencyRate
  ) {
    setSynced({
      value,
      entryCurrency,
      defaultCurrency,
      currencyRate,
      text: format(value),
    });
  }

  const handleChange = (raw: string) => {
    const parsed = raw.trim() === "" ? NaN : parseFloat(raw);
    const nextBase = Number.isFinite(parsed) ? toBase(parsed) : null;
    setSynced({
      value: nextBase,
      entryCurrency,
      defaultCurrency,
      currencyRate,
      text: raw,
    });
    onChange(nextBase);
  };

  return (
    <input
      {...inputProps}
      type="number"
      min={inputProps.min ?? "0"}
      step={inputProps.step ?? (entryCurrency === "MMK" ? "1" : "0.01")}
      value={synced.text}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
