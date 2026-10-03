/**
 * Pure stock arithmetic shared by every POS code path that changes quantities.
 *
 * Quantities live inside `stocks/{id}.colorVariants[].sizeQuantities[]`, so
 * Firestore's `increment()` cannot reach them. Every writer therefore has to
 * read the document, compute the new array and write it back — and the only
 * safe way to do that is inside a transaction, applying *changes* (deltas)
 * rather than absolute numbers captured earlier. These helpers do the
 * computing; `StockService` wraps them in `runTransaction`.
 *
 * Nothing in here touches Firestore, so it can be exercised directly.
 */

import type { ColorVariant, SizeQuantity } from "@/types/stock";

/** One change to one size of one variant. */
export interface StockAdjustment {
  /**
   * The variant as the caller knows it: its stored id, or the till's
   * positional stand-in (`cv<n>-<stockId>`) for a variant stored without one.
   */
  variantId?: string;
  /**
   * Colour name as recorded on the line. POS cart lines and sales keep the
   * variant id in `selectedColor`, so an id is accepted here too.
   */
  color?: string;
  /** Hex colour code recorded on the line; confirms a positional stand-in id. */
  colorCode?: string;
  size: string;
  /** Positive puts stock back, negative takes it. */
  delta: number;
  /** Human-readable name for error messages. */
  label?: string;
}

export type StockErrorCode =
  | "stock_not_found"
  | "variant_not_found"
  | "size_not_found"
  | "insufficient_stock"
  | "structure_changed";

export class StockAdjustmentError extends Error {
  readonly code: StockErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: StockErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "StockAdjustmentError";
    this.code = code;
    this.details = details;
  }
}

export function isStockAdjustmentError(
  error: unknown,
): error is StockAdjustmentError {
  return (
    error instanceof StockAdjustmentError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "StockAdjustmentError")
  );
}

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toQuantity(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function sizesOf(variant: ColorVariant | undefined): SizeQuantity[] {
  const sizes = variant?.sizeQuantities;
  return Array.isArray(sizes) ? sizes : [];
}

function quantityOf(
  variant: ColorVariant | undefined,
  size: string,
): number | undefined {
  const entry = sizesOf(variant).find((sq) => norm(sq.size) === norm(size));
  return entry ? toQuantity(entry.quantity) : undefined;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Position encoded in the till's stand-in id for a variant stored without an
 * id: `cv<n>-<stockId>`, 1-based (see transformStockData in
 * src/app/owner/home/page.tsx). Such variants are real: before the
 * merge-based edit form, saving a product wrote `colorVariants` without ids,
 * and the till put these stand-ins into carts and sales.
 */
function tillPositionalIndex(candidate: string, stockId: string): number | null {
  const match = /^cv(\d+)-(.+)$/.exec(candidate);
  if (!match || match[2] !== stockId) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * Ids made up by a screen, never stored: the till's `cv<n>-<stockId>`, the
 * edit form's `variant-<n>` and the storefront's bare index (`"0"`).
 */
function isPlaceholderId(candidate: string, stockId: string): boolean {
  return (
    tillPositionalIndex(candidate, stockId) !== null ||
    /^variant-\d+$/.test(candidate) ||
    /^\d{1,3}$/.test(candidate)
  );
}

/**
 * Find the variant a line refers to, or -1. Strict on purpose: taking or
 * returning stock on the wrong variant is worse than reporting the line as
 * unresolved.
 *
 *  1. A stored variant id, exactly (checked against `variantId` and against
 *     `color`, where POS lines keep the id).
 *  2. The till's `cv<n>-<stockId>` stand-in, only if the variant at that
 *     position still has the colour the line recorded (name or hex code):
 *     positions move when variants are added or removed.
 *  3. Lines without a variant id (legacy data): the colour name, trimmed and
 *     case-insensitive, and only a variant that has the size. More than one
 *     candidate is ambiguous and resolves to nothing.
 *
 * There is no "size only" or "the only variant" fallback.
 */
export function resolveVariantIndex(
  variants: ColorVariant[],
  stockId: string,
  hint: { variantId?: string; color?: string; colorCode?: string; size?: string },
): number {
  const list = Array.isArray(variants) ? variants : [];
  const variantId = clean(hint.variantId);
  const color = clean(hint.color);
  const colorCode = clean(hint.colorCode);
  const size = clean(hint.size);
  const idCandidates = [variantId, color].filter(Boolean);

  // 1. Stored id.
  for (const candidate of idCandidates) {
    const idx = list.findIndex((v) => clean(v?.id) !== "" && clean(v.id) === candidate);
    if (idx >= 0) return idx;
  }

  // A colour *name* on the line, as opposed to a stand-in id in that field.
  const colourName = color && !isPlaceholderId(color, stockId) ? color : "";

  // 2. Till stand-in, confirmed by colour.
  for (const candidate of idCandidates) {
    const idx = tillPositionalIndex(candidate, stockId);
    if (idx === null || idx >= list.length) continue;
    const variant = list[idx];
    const nameHint = candidate === color ? "" : colourName;
    const sameName = !!nameHint && norm(variant?.color) === norm(nameHint);
    const sameCode = !!colorCode && norm(variant?.colorCode) === norm(colorCode);
    if (sameName || sameCode) return idx;
  }

  // 3. Legacy line without a variant id: colour name + size, unambiguous.
  const hasVariantId =
    !!variantId &&
    !isPlaceholderId(variantId, stockId) &&
    norm(variantId) !== norm(color);
  if (!hasVariantId && colourName) {
    const matches = list
      .map((v, idx) => ({ v, idx }))
      .filter(
        ({ v }) =>
          norm(v?.color) === norm(colourName) &&
          (!size || quantityOf(v, size) !== undefined),
      );
    if (matches.length === 1) return matches[0].idx;
  }

  return -1;
}

function describe(stockId: string, adjustment: StockAdjustment): string {
  const parts = [adjustment.label || stockId];
  if (adjustment.color) parts.push(adjustment.color);
  if (adjustment.size) parts.push(adjustment.size);
  return parts.join(" / ");
}

export interface ApplyAdjustmentsResult {
  colorVariants: ColorVariant[];
  applied: StockAdjustment[];
  skipped: Array<{ adjustment: StockAdjustment; reason: StockErrorCode }>;
}

/**
 * Apply deltas to a freshly read `colorVariants` array.
 *
 * Throws `insufficient_stock` rather than clamping: if the shelf no longer has
 * what the caller wants to take, the caller has to find out.
 */
export function applyAdjustments(
  colorVariants: ColorVariant[] | undefined,
  stockId: string,
  adjustments: StockAdjustment[],
  options: {
    /** Create the size when putting stock back to a size that is missing. */
    allowAddSize?: boolean;
    /** Skip adjustments whose variant or size cannot be found instead of throwing. */
    skipUnresolvable?: boolean;
  } = {},
): ApplyAdjustmentsResult {
  const variants = JSON.parse(
    JSON.stringify(Array.isArray(colorVariants) ? colorVariants : []),
  ) as ColorVariant[];

  const applied: StockAdjustment[] = [];
  const skipped: ApplyAdjustmentsResult["skipped"] = [];

  for (const adjustment of adjustments) {
    const delta = toQuantity(adjustment.delta);
    if (delta === 0) continue;

    const variantIndex = resolveVariantIndex(variants, stockId, adjustment);

    if (variantIndex < 0) {
      if (options.skipUnresolvable) {
        skipped.push({ adjustment, reason: "variant_not_found" });
        continue;
      }
      throw new StockAdjustmentError(
        "variant_not_found",
        `Variant not found for ${describe(stockId, adjustment)}`,
        {
          stockId,
          color: adjustment.color,
          size: adjustment.size,
          label: adjustment.label,
        },
      );
    }

    const variant = variants[variantIndex];
    const sizes = sizesOf(variant).map((sq) => ({ ...sq }));
    let sizeIndex = sizes.findIndex(
      (sq) => norm(sq.size) === norm(adjustment.size),
    );
    if (sizeIndex < 0 && !adjustment.size && sizes.length === 1) sizeIndex = 0;

    if (sizeIndex < 0) {
      if (delta > 0 && options.allowAddSize && adjustment.size) {
        sizes.push({ size: adjustment.size, quantity: delta });
        variants[variantIndex] = { ...variant, sizeQuantities: sizes };
        applied.push(adjustment);
        continue;
      }
      if (options.skipUnresolvable) {
        skipped.push({ adjustment, reason: "size_not_found" });
        continue;
      }
      throw new StockAdjustmentError(
        "size_not_found",
        `Size not found for ${describe(stockId, adjustment)}`,
        {
          stockId,
          color: variant.color,
          size: adjustment.size,
          label: adjustment.label,
        },
      );
    }

    const available = toQuantity(sizes[sizeIndex].quantity);
    const next = available + delta;
    if (next < 0) {
      throw new StockAdjustmentError(
        "insufficient_stock",
        `Not enough stock for ${describe(stockId, {
          ...adjustment,
          color: variant.color || adjustment.color,
        })}: wanted ${-delta}, only ${available} left`,
        {
          stockId,
          color: variant.color,
          size: sizes[sizeIndex].size,
          requested: -delta,
          available,
          label: adjustment.label,
        },
      );
    }

    sizes[sizeIndex] = { ...sizes[sizeIndex], quantity: next };
    variants[variantIndex] = { ...variant, sizeQuantities: sizes };
    applied.push(adjustment);
  }

  return { colorVariants: variants, applied, skipped };
}

// ---------------------------------------------------------------------------
// Till lines: availability checks, the sale's deduction, legacy carts
// ---------------------------------------------------------------------------
//
// The till no longer takes stock when an item goes into the cart. Adding only
// checks the shelf; `transactionService.recordSale` takes the stock in the
// same Firestore transaction that saves the sale.

/** A POS cart or sale line, as far as stock is concerned (a CartItem). */
export interface StockLine {
  stockId?: string;
  /** The variant id as the till showed it (stored id or `cv<n>-<stockId>`). */
  selectedColor?: string;
  colorCode?: string;
  selectedSize?: string;
  quantity?: number;
  groupName?: string;
}

/** How a till line points at its variant. */
export function lineVariantHint(line: StockLine): {
  variantId: string;
  colorCode: string;
  size: string;
} {
  return {
    variantId: clean(line.selectedColor),
    colorCode: clean(line.colorCode),
    size: clean(line.selectedSize),
  };
}

/** Same product, variant and size: one cart line. */
export function isSameStockLine(a: StockLine, b: StockLine): boolean {
  return (
    clean(a.stockId) === clean(b.stockId) &&
    clean(a.selectedColor) === clean(b.selectedColor) &&
    clean(a.selectedSize) === clean(b.selectedSize)
  );
}

/** Units of this line already in the cart. */
export function quantityInCart(lines: StockLine[], line: StockLine): number {
  return (Array.isArray(lines) ? lines : [])
    .filter((entry) => isSameStockLine(entry, line))
    .reduce((sum, entry) => sum + Math.max(0, toQuantity(entry.quantity)), 0);
}

/**
 * What the shelf holds for a line's variant and size, from a freshly read
 * `colorVariants`. Null when the line no longer matches a variant and size.
 */
export function shelfQuantity(
  colorVariants: ColorVariant[] | undefined,
  stockId: string,
  line: StockLine,
): { quantity: number; variant: ColorVariant } | null {
  const variants = Array.isArray(colorVariants) ? colorVariants : [];
  const hint = lineVariantHint(line);
  const index = resolveVariantIndex(variants, stockId, hint);
  if (index < 0) return null;
  const quantity = quantityOf(variants[index], hint.size);
  if (quantity === undefined) return null;
  return { quantity: Math.max(0, quantity), variant: variants[index] };
}

/** Units that may still go into the cart: shelf minus what the cart holds. */
export function availableToAdd(shelf: number, alreadyInCart: number): number {
  return Math.max(
    0,
    Math.max(0, toQuantity(shelf)) - Math.max(0, toQuantity(alreadyInCart)),
  );
}

/** A product's shelf as last read: does it exist, and its variants. */
export interface ShelfSnapshot {
  exists: boolean;
  colorVariants: ColorVariant[];
}

/** One cart line that `trimLinesToShelf` cut down or removed. */
export interface ShelfTrim<T> {
  item: T;
  /** Units left on the line (0 = removed). */
  kept: number;
  /** The variant's colour name, when the line still matches one. */
  colour?: string;
  reason: "product_gone" | "variant_gone" | "short";
}

/**
 * The cart's lines for `stockId`, cut down to what the shelf holds. Lines
 * for the same variant and size share the shelf; earlier lines keep their
 * units first, so the most recent addition is what gets trimmed. Pure (same
 * input, same output), so it is safe inside a React state updater.
 */
export function trimLinesToShelf<T extends StockLine & { quantity: number }>(
  items: T[],
  stockId: string,
  shelf: ShelfSnapshot,
): { items: T[]; changes: ShelfTrim<T>[] } {
  const remainingByLine = new Map<string, number>();
  const next: T[] = [];
  const changes: ShelfTrim<T>[] = [];

  for (const item of items) {
    if (clean(item.stockId) !== stockId) {
      next.push(item);
      continue;
    }

    const match = shelf.exists
      ? shelfQuantity(shelf.colorVariants, stockId, item)
      : null;
    const key = `${clean(item.selectedColor)}|${clean(item.selectedSize)}`;
    const remaining = remainingByLine.get(key) ?? (match ? match.quantity : 0);
    const quantity = Math.max(0, toQuantity(item.quantity));
    const kept = Math.max(0, Math.min(quantity, remaining));
    remainingByLine.set(key, remaining - kept);

    if (kept < quantity) {
      changes.push({
        item,
        kept,
        colour: match?.variant.color,
        reason: !shelf.exists ? "product_gone" : !match ? "variant_gone" : "short",
      });
    }
    if (kept > 0) next.push(kept === quantity ? item : { ...item, quantity: kept });
  }

  return { items: next, changes };
}

/**
 * Group till lines into per-product adjustments of `sign × quantity`. Lines
 * for the same variant and size are merged, so a check sees the total asked
 * of each shelf. Lines without a product id come back in `unlinked`.
 */
export function groupLineAdjustments(
  lines: StockLine[],
  sign: 1 | -1,
): { byStock: Map<string, StockAdjustment[]>; unlinked: StockLine[] } {
  const grouped = new Map<string, Map<string, StockAdjustment>>();
  const unlinked: StockLine[] = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const quantity = Math.max(0, toQuantity(line?.quantity));
    if (quantity === 0) continue;
    const stockId = clean(line.stockId);
    if (!stockId) {
      unlinked.push(line);
      continue;
    }

    const hint = lineVariantHint(line);
    const key = [hint.variantId, norm(hint.colorCode), norm(hint.size)].join("|");
    const perStock = grouped.get(stockId) ?? new Map<string, StockAdjustment>();
    const existing = perStock.get(key);
    if (existing) {
      existing.delta += sign * quantity;
    } else {
      perStock.set(key, {
        ...(hint.variantId ? { variantId: hint.variantId } : {}),
        ...(hint.colorCode ? { colorCode: hint.colorCode } : {}),
        size: hint.size,
        delta: sign * quantity,
        ...(clean(line.groupName) ? { label: clean(line.groupName) } : {}),
      });
    }
    grouped.set(stockId, perStock);
  }

  const byStock = new Map<string, StockAdjustment[]>();
  grouped.forEach((perStock, stockId) =>
    byStock.set(stockId, Array.from(perStock.values())),
  );
  return { byStock, unlinked };
}

/** The message a cashier sees when a sale cannot take its stock. */
export function saleStockMessage(error: StockAdjustmentError): string {
  const details = error.details || {};
  const name = `"${clean(details.label) || "This item"}"`;
  const colour = clean(details.color);
  const size = clean(details.size);

  switch (error.code) {
    case "insufficient_stock": {
      const detail = [colour, size].filter(Boolean).join(" / ");
      const what = detail ? `${name} (${detail})` : name;
      const available = Math.max(0, toQuantity(details.available));
      return available > 0
        ? `Only ${available} left of ${what}`
        : `${what} is sold out`;
    }
    case "variant_not_found":
      return `${name}${size ? ` (size ${size})` : ""}: that colour is no longer on the product. Remove it from the cart and add it again.`;
    case "size_not_found":
      return `${name}${colour ? ` (${colour})` : ""}: size ${size || "?"} is no longer on the product. Remove it from the cart and add it again.`;
    case "stock_not_found":
      return `${name} is no longer in the catalogue. Remove it from the cart.`;
    default:
      return error.message;
  }
}

/**
 * Take a sale's lines off one product's freshly read `colorVariants`.
 * Unresolved lines and short shelves throw a StockAdjustmentError whose
 * message is meant for the cashier (see saleStockMessage).
 */
export function deductSaleLines(
  colorVariants: ColorVariant[] | undefined,
  stockId: string,
  adjustments: StockAdjustment[],
): ColorVariant[] {
  try {
    return applyAdjustments(colorVariants, stockId, adjustments).colorVariants;
  } catch (error) {
    if (!isStockAdjustmentError(error)) throw error;
    throw new StockAdjustmentError(
      error.code,
      saleStockMessage(error),
      error.details,
    );
  }
}

/** A variant as submitted by the owner's edit form. */
export interface EditedVariant {
  /** Position in the snapshot the form was loaded from, or null if new. */
  sourceIndex: number | null;
  color: string;
  colorCode: string;
  barcode: string;
  image?: string;
  sizeQuantities: SizeQuantity[];
}

/**
 * The parts of `colorVariants` that only an owner edit changes: which variants
 * exist, their colour, and which sizes they carry. Sales change quantities
 * only, so they leave this alone.
 */
export function variantStructureSignature(
  variants: ColorVariant[] | undefined,
): string {
  return JSON.stringify(
    (Array.isArray(variants) ? variants : []).map((v) => ({
      id: v.id || "",
      color: norm(v.color),
      sizes: sizesOf(v)
        .map((sq) => norm(sq.size))
        .sort(),
    })),
  );
}

/**
 * Merge an owner's edit into the document as it is *now*.
 *
 * The form was filled from `base`, possibly minutes ago. Sales and restocks
 * that happened since then are in `current`. For every size the owner kept,
 * the stored quantity moves by what the owner changed (form value minus the
 * value they started from) instead of being overwritten, so a sale made while
 * the form was open is not undone.
 *
 * If somebody else changed the structure (added, removed or recoloured a
 * variant, or changed its sizes) the positions in the form no longer line up
 * with the document, so this refuses and the owner reloads.
 */
export function mergeOwnerEdit(
  current: ColorVariant[] | undefined,
  base: ColorVariant[] | undefined,
  edited: EditedVariant[],
  makeId: () => string,
): ColorVariant[] {
  const currentVariants = Array.isArray(current) ? current : [];
  const baseVariants = Array.isArray(base) ? base : [];

  if (
    variantStructureSignature(currentVariants) !==
    variantStructureSignature(baseVariants)
  ) {
    throw new StockAdjustmentError(
      "structure_changed",
      "This product was changed by someone else while you were editing it. Reload the page to get the latest version, then make your changes again.",
    );
  }

  const usedSources = new Set<number>();

  return edited.map((variant) => {
    const sizeQuantities = Array.isArray(variant.sizeQuantities)
      ? variant.sizeQuantities
      : [];
    const source = variant.sourceIndex;
    const isExisting =
      typeof source === "number" &&
      Number.isInteger(source) &&
      source >= 0 &&
      source < baseVariants.length &&
      !usedSources.has(source);

    const common = {
      color: String(variant.color ?? ""),
      colorCode: String(variant.colorCode ?? ""),
      barcode: String(variant.barcode ?? ""),
      ...(variant.image !== undefined && variant.image !== null
        ? { image: String(variant.image) }
        : {}),
    };

    if (!isExisting) {
      return {
        id: makeId(),
        ...common,
        sizeQuantities: sizeQuantities.map((sq) => ({
          size: String(sq.size),
          quantity: Math.max(0, toQuantity(sq.quantity)),
        })),
      };
    }

    usedSources.add(source);
    const baseVariant = baseVariants[source];
    const currentVariant = currentVariants[source];

    const mergedSizes = sizeQuantities.map((sq) => {
      const target = Math.max(0, toQuantity(sq.quantity));
      const startedFrom = quantityOf(baseVariant, sq.size) ?? 0;
      const now = quantityOf(currentVariant, sq.size) ?? 0;
      const next = now + (target - startedFrom);

      if (next < 0) {
        const label = [common.color, sq.size].filter(Boolean).join(" / ");
        throw new StockAdjustmentError(
          "insufficient_stock",
          `${label}: you lowered the quantity by ${startedFrom - target}, but only ${now} are left because ${startedFrom - now} sold while you were editing. Reload the page and enter the quantity again.`,
          {
            color: common.color,
            size: sq.size,
            requested: startedFrom - target,
            available: now,
          },
        );
      }

      return { size: String(sq.size), quantity: next };
    });

    return {
      id: currentVariant?.id || makeId(),
      ...common,
      sizeQuantities: mergedSizes,
    };
  });
}

// ---------------------------------------------------------------------------
// Returns ledger
// ---------------------------------------------------------------------------
//
// An order's stock can come back through several doors: a refund (possibly
// partial, possibly with damaged units that are written off), a cancellation
// from the transactions page, an approved cancellation request, or a status
// change on the online-orders page. Each used to put stock back on its own
// say-so, so using two of them on one order restocked it twice.
//
// The ledger records, per order line, how many units have already been dealt
// with (restocked or written off). Every door goes through it inside the same
// transaction as the stock write, and none can return more than was ordered.

/** One order line coming back. */
export interface OrderLineReturn {
  /** Position of the line in the order (transaction `items` / online `cartItems`). */
  lineIndex: number;
  /** Units this event covers. */
  quantity: number;
  /** False for units written off (e.g. damaged on return): counted, not shelved. */
  restock: boolean;
  stockId: string;
  colorName: string;
  size: string;
  variantHint?: string;
  /**
   * Hex colour code recorded on the line (POS `items[].colorCode`). Needed to
   * confirm the till's `cv<n>-<stockId>` stand-in ids; without it such lines
   * are reported as unresolved instead of being restocked by position alone.
   */
  colorCode?: string;
}

/** Which document the ledger lives on. */
export type ReturnLedgerSource = "onlineOrder" | "transaction";

/** Quantity ordered on each line of the ledger document. */
export function orderedQuantities(
  data: Record<string, unknown>,
  source: ReturnLedgerSource,
): number[] {
  const read = (rows: unknown): number[] =>
    Array.isArray(rows)
      ? rows.map((row) =>
          Math.max(0, toQuantity((row as { quantity?: unknown })?.quantity)),
        )
      : [];

  if (source === "transaction") return read(data.items);

  const cartItems = read(data.cartItems);
  if (cartItems.length > 0) return cartItems;

  const product = data.product as { quantity?: unknown } | undefined;
  return product ? [Math.max(0, toQuantity(product.quantity))] : [];
}

export interface ReturnPlan {
  /** Stock changes to apply, grouped by product. */
  adjustmentsByStock: Map<string, StockAdjustment[]>;
  /** The ledger after this event, to write back. */
  ledger: Record<string, number>;
  /** Units newly counted by this event (restocked + written off). */
  accounted: number;
  /** Units newly put back on the shelf. */
  restocked: number;
  /** Every line is now fully accounted for. */
  complete: boolean;
  skippedReason?: "already_restored";
}

/**
 * Work out what an incoming return may actually do, given the ledger stored
 * on the order. Pure: the caller reads the document and writes the result
 * inside one transaction.
 */
export function planOrderLineReturns(
  guardData: Record<string, unknown>,
  source: ReturnLedgerSource,
  lines: OrderLineReturn[],
): ReturnPlan {
  const storedLedger =
    guardData.stockReturnLedger && typeof guardData.stockReturnLedger === "object"
      ? (guardData.stockReturnLedger as Record<string, unknown>)
      : null;

  const empty: ReturnPlan = {
    adjustmentsByStock: new Map(),
    ledger: {},
    accounted: 0,
    restocked: 0,
    complete: false,
  };

  // Restored before the ledger existed (or released by the storefront, which
  // only ever releases whole orders): there is nothing left to give back.
  if (guardData.stockRestoredAt && !storedLedger) {
    return { ...empty, complete: true, skippedReason: "already_restored" };
  }

  const ordered = orderedQuantities(guardData, source);
  const ledger: Record<string, number> = {};
  for (const [key, value] of Object.entries(storedLedger || {})) {
    ledger[key] = Math.max(0, toQuantity(value));
  }

  const adjustmentsByStock = new Map<string, StockAdjustment[]>();
  let accounted = 0;
  let restocked = 0;

  for (const line of lines) {
    const requested = Math.max(0, toQuantity(line.quantity));
    if (requested === 0 || !Number.isInteger(line.lineIndex) || line.lineIndex < 0) {
      continue;
    }

    const key = String(line.lineIndex);
    const already = ledger[key] || 0;
    // When the document does not say how many were ordered, cap at what this
    // event asks for, so repeating the same event still does nothing.
    const cap = ordered[line.lineIndex] ?? requested;
    const allowed = Math.max(0, Math.min(requested, cap - already));
    if (allowed === 0) continue;

    ledger[key] = already + allowed;
    accounted += allowed;

    if (line.restock && line.stockId) {
      const list = adjustmentsByStock.get(line.stockId) || [];
      list.push({
        variantId: line.variantHint,
        color: line.colorName,
        ...(line.colorCode ? { colorCode: line.colorCode } : {}),
        size: line.size,
        delta: allowed,
      });
      adjustmentsByStock.set(line.stockId, list);
      restocked += allowed;
    }
  }

  const complete =
    ordered.length > 0 &&
    ordered.every((qty, index) => qty <= 0 || (ledger[String(index)] || 0) >= qty);

  return { adjustmentsByStock, ledger, accounted, restocked, complete };
}
