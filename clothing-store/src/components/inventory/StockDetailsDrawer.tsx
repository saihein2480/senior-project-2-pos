"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Barcode,
  CalendarDays,
  Layers,
  Palette,
  Pencil,
  Store,
  Tag,
  X,
} from "lucide-react";
import type { StockGroupDisplay } from "@/types/stock";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePriceEntryCurrency } from "@/hooks/usePriceEntryCurrency";

/** Same threshold the table and the POS terminal use for "low". */
const LOW_STOCK_THRESHOLD = 10;

type StockLevel = "in" | "low" | "out";

const levelOf = (quantity: number): StockLevel =>
  quantity <= 0 ? "out" : quantity <= LOW_STOCK_THRESHOLD ? "low" : "in";

const LEVEL_CLASSES: Record<StockLevel, { chip: string; dot: string; text: string }> = {
  in: { chip: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700" },
  low: { chip: "border-amber-200 bg-amber-50", dot: "bg-amber-500", text: "text-amber-700" },
  out: { chip: "border-gray-200 bg-gray-50", dot: "bg-gray-300", text: "text-gray-400" },
};

interface StockDetailsDrawerProps {
  group: StockGroupDisplay | null;
  shopName: string;
  onClose: () => void;
  /** Shown only when the viewer may edit products. */
  onEdit?: () => void;
  /** Original price, margin and stock value; hidden from roles without stock-value access. */
  showCostFigures?: boolean;
}

/**
 * Slide-over with everything about one product: selling and original price,
 * every colour with its per-size stock, and the wholesale tiers.
 *
 * Wholesale tiers are read the way checkout applies them
 * (ShoppingCartModal): `price` is the total for `minQuantity` items, so the
 * per-item price is `price / minQuantity`.
 */
export function StockDetailsDrawer({
  group,
  shopName,
  onClose,
  onEdit,
  showCostFigures = false,
}: StockDetailsDrawerProps) {
  const { t } = useLanguage();
  const { formatPrice } = usePriceEntryCurrency();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus starts on the close button; the page stops scrolling.
  useEffect(() => {
    if (!group) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [group, onClose]);

  const tiers = useMemo(
    () =>
      [...(group?.wholesaleTiers ?? [])]
        .filter((tier) => tier.minQuantity > 0)
        .sort((a, b) => a.minQuantity - b.minQuantity),
    [group],
  );

  if (!group) return null;

  const totalLevel = levelOf(group.totalQuantity);
  const margin =
    group.unitPrice > 0
      ? ((group.unitPrice - group.originalPrice) / group.unitPrice) * 100
      : 0;
  const lowOrOutSizes = group.variants.reduce(
    (count, variant) =>
      count + variant.sizes.filter((size) => size.quantity <= LOW_STOCK_THRESHOLD).length,
    0,
  );

  const stats: { label: string; value: string; sub?: string; tone?: string }[] = [
    {
      label: t.totalStock,
      value: `${group.totalQuantity.toLocaleString()}`,
      sub: t.unitsLabel,
      tone: LEVEL_CLASSES[totalLevel].text,
    },
    {
      label: t.colorVariants,
      value: `${group.variants.length}`,
      sub: group.sizeSummary || undefined,
    },
    { label: t.sellingPrice, value: formatPrice(group.unitPrice) },
    ...(showCostFigures
      ? [
          {
            label: t.originalPrice,
            value: formatPrice(group.originalPrice),
            sub: `${margin.toFixed(0)}% ${t.marginLabel}`,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-details-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t.stockDetails}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Product */}
          <section className="flex gap-4">
            <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
              <Image
                src={group.groupImage}
                alt={group.groupName}
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="stock-details-title" className="text-lg font-bold leading-6 text-gray-900">
                {group.groupName}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.category && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {group.category}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  <Store className="h-3 w-3" aria-hidden="true" />
                  {shopName}
                </span>
                {group.formattedReleaseDate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    {group.formattedReleaseDate}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate font-mono text-[11px] text-gray-400" title={group.groupId}>
                ID: {group.groupId}
              </p>
            </div>
          </section>

          {/* Key figures */}
          <section className={`grid gap-2.5 ${stats.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-gray-200/80 bg-white px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {stat.label}
                </p>
                <p className={`mt-1 text-lg font-bold tabular ${stat.tone ?? "text-gray-900"}`}>
                  {stat.value}
                </p>
                {stat.sub && <p className="truncate text-xs text-gray-500">{stat.sub}</p>}
              </div>
            ))}
            {showCostFigures && (
              <div className="col-span-full flex items-center justify-between rounded-2xl bg-rose-50/60 px-3.5 py-2.5 text-sm">
                <span className="text-gray-600">{t.stockValueLabel}</span>
                <span className="font-bold text-gray-900 tabular">
                  {formatPrice(group.totalQuantity * group.unitPrice)}
                </span>
              </div>
            )}
          </section>

          {/* Variants & stock */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Palette className="h-4 w-4 text-rose-500" aria-hidden="true" />
                {t.variantsAndStock}
                {lowOrOutSizes > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {lowOrOutSizes} {t.lowStock.toLowerCase()}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                {(["in", "low", "out"] as StockLevel[]).map((level) => (
                  <span key={level} className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${LEVEL_CLASSES[level].dot}`} aria-hidden="true" />
                    {level === "in" ? t.inStock : level === "low" ? t.lowStock : t.outOfStock}
                  </span>
                ))}
              </div>
            </div>

            {group.variants.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                {t.noVariantsYet}
              </p>
            ) : (
              <ul className="space-y-3">
                {group.variants.map((variant, variantIndex) => {
                  const variantLevel = levelOf(variant.totalQuantity);
                  return (
                    <li
                      key={variant.variantId || variantIndex}
                      className="rounded-2xl border border-gray-200/80 bg-white p-3.5"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                          <Image
                            src={variant.image || group.groupImage}
                            alt={`${group.groupName} - ${variant.color}`}
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        </div>
                        <span
                          className="h-5 w-5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                          style={variant.colorStyle}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {variant.color}
                          </p>
                          {variant.barcode && (
                            <p className="flex items-center gap-1 font-mono text-[11px] text-gray-500">
                              <Barcode className="h-3 w-3" aria-hidden="true" />
                              {variant.barcode}
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold tabular ${
                            variantLevel === "out"
                              ? "bg-gray-100 text-gray-500"
                              : variantLevel === "low"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {variant.totalQuantity} {t.unitsLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                        {variant.sizes.map((size, sizeIndex) => {
                          const level = levelOf(size.quantity);
                          return (
                            <div
                              key={`${size.size}-${sizeIndex}`}
                              title={`${size.size}: ${size.quantity}`}
                              className={`flex flex-col items-center rounded-xl border px-1.5 py-1.5 ${LEVEL_CLASSES[level].chip}`}
                            >
                              <span
                                className={`text-xs font-semibold ${
                                  level === "out" ? "text-gray-400 line-through" : "text-gray-700"
                                }`}
                              >
                                {size.size}
                              </span>
                              <span className={`text-sm font-bold tabular ${LEVEL_CLASSES[level].text}`}>
                                {size.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Wholesale tiers */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Layers className="h-4 w-4 text-rose-500" aria-hidden="true" />
              {t.wholesalePricingTiers}
              {tiers.length > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  {tiers.length}
                </span>
              )}
            </h3>

            {tiers.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                {t.noWholesaleTiers}
              </p>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-gray-200/80">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th scope="col" className="px-3.5 py-2.5 text-left">{t.buyLabel}</th>
                        <th scope="col" className="px-3.5 py-2.5 text-right">{t.bundlePrice}</th>
                        <th scope="col" className="px-3.5 py-2.5 text-right">{t.perItem}</th>
                        <th scope="col" className="px-3.5 py-2.5 text-right">{t.savesLabel}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tiers.map((tier, index) => {
                        const perItem = tier.price / tier.minQuantity;
                        const regular = group.unitPrice * tier.minQuantity;
                        const saving = regular > 0 ? ((regular - tier.price) / regular) * 100 : 0;
                        return (
                          <tr key={tier.id || `${tier.minQuantity}-${index}`}>
                            <td className="px-3.5 py-2.5 font-semibold text-gray-900 tabular">
                              {tier.minQuantity} {t.unitsLabel}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-semibold text-gray-900 tabular">
                              {formatPrice(tier.price)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-gray-600 tabular">
                              {formatPrice(perItem)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right tabular">
                              {saving > 0 ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  {saving.toFixed(0)}%
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-gray-400">{t.wholesaleExactNote}</p>
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {t.close}
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-brand hover:bg-brand-strong"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t.editProduct}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
