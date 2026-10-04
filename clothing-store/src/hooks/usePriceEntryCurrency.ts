"use client";

import { useCallback } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { SettingsService } from "@/services/settingsService";
import { CurrencyCode, convertMoney } from "@/lib/money";

/**
 * Currency used to show and enter stock prices (stock list, new / edit stock).
 *
 * Stock prices are always stored in the business's default currency. The
 * form lets the owner type prices in whatever currency is selected in the top
 * nav bar, and converts to the default currency on the way in.
 *
 * If no exchange rate is configured, conversion is impossible, so entry falls
 * back to the default currency (and `rateMissing` is true) instead of
 * labelling default-currency numbers with the wrong symbol.
 */
export function usePriceEntryCurrency() {
  const { selectedCurrency, defaultCurrency, currencyRate } = useCurrency();

  const hasRate = Number.isFinite(currencyRate) && currencyRate > 0;
  const entryCurrency: CurrencyCode = hasRate ? selectedCurrency : defaultCurrency;
  const rateMissing = !hasRate && selectedCurrency !== defaultCurrency;

  /** Stored (default-currency) amount -> amount shown in the form. */
  const toEntry = useCallback(
    (baseAmount: number) =>
      convertMoney(
        baseAmount,
        defaultCurrency,
        entryCurrency,
        currencyRate,
        defaultCurrency,
      ),
    [defaultCurrency, entryCurrency, currencyRate],
  );

  /** Amount typed in the form -> stored (default-currency) amount. */
  const toBase = useCallback(
    (entryAmount: number) =>
      convertMoney(
        entryAmount,
        entryCurrency,
        defaultCurrency,
        currencyRate,
        defaultCurrency,
      ),
    [defaultCurrency, entryCurrency, currencyRate],
  );

  /** Stored (default-currency) amount -> "฿1,234.5" / "Ks 1,235" in the shown currency. */
  const formatPrice = useCallback(
    (baseAmount: number) =>
      SettingsService.formatPrice(toEntry(baseAmount), entryCurrency),
    [toEntry, entryCurrency],
  );

  return {
    entryCurrency,
    defaultCurrency,
    currencyRate,
    rateMissing,
    entrySymbol: SettingsService.getCurrencyInfo(entryCurrency).symbol,
    defaultSymbol: SettingsService.getCurrencyInfo(defaultCurrency).symbol,
    toEntry,
    toBase,
    formatPrice,
  };
}
