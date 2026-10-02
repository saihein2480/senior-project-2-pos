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
   * The variant as the caller knows it: a stored id, or one synthesised by a
   * screen for a variant that has none (`cv1-<stockId>`, `variant-0`).
   */
  variantId?: string;
  /** Colour name, colour code or barcode — whatever the caller recorded. */
  color?: string;
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

/**
 * Index encoded in an id that a screen synthesised for a variant stored
 * without one. The POS till uses `cv<n>-<stockId>` (1-based) and the edit and
 * till screens use `variant-<n>` (0-based).
 */
function synthesisedIndex(candidate: string, stockId: string): number | null {
  const tillMatch = /^cv(\d+)-(.+)$/.exec(candidate);
  if (tillMatch && tillMatch[2] === stockId) {
    return Number(tillMatch[1]) - 1;
  }
  const screenMatch = /^variant-(\d+)$/.exec(candidate);
  if (screenMatch) return Number(screenMatch[1]);
  return null;
}

/**
 * Find the variant an adjustment refers to.
 *
 * `mode` matters for the loose fallbacks: when taking stock we refuse to guess
 * between several candidates, because guessing wrong sells the wrong item.
 * Putting stock back keeps the historical, more forgiving behaviour of
 * `restoreInventory`.
 */
export function resolveVariantIndex(
  variants: ColorVariant[],
  stockId: string,
  hint: { variantId?: string; color?: string; size?: string },
  mode: "take" | "give",
): number {
  const variantId = (hint.variantId || "").trim();
  const color = (hint.color || "").trim();
  const size = (hint.size || "").trim();
  const idCandidates = [variantId, color].filter(Boolean);

  // 1. A stored id.
  for (const candidate of idCandidates) {
    const idx = variants.findIndex(
      (v) => !!v.id && norm(v.id) === norm(candidate),
    );
    if (idx >= 0) return idx;
  }

  // 2. An id synthesised from the variant's position. Positions move when the
  //    owner adds or removes variants, so when we also know the colour, only
  //    accept the position if the colour there still matches.
  for (const candidate of idCandidates) {
    const idx = synthesisedIndex(candidate, stockId);
    if (idx === null || idx < 0 || idx >= variants.length) continue;

    const colourHint = candidate === variantId ? color : "";
    const colourHintIsPlain =
      !!colourHint && synthesisedIndex(colourHint, stockId) === null;
    if (
      colourHintIsPlain &&
      norm(variants[idx].color) !== norm(colourHint) &&
      norm(variants[idx].colorCode) !== norm(colourHint)
    ) {
      continue;
    }
    return idx;
  }

  if (color) {
    // 3. Colour name. Two variants can share a name; prefer the one that
    //    actually carries the size.
    const byName = variants
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => norm(v.color) === norm(color));
    if (byName.length === 1) return byName[0].idx;
    if (byName.length > 1) {
      const withSize = byName.find(
        ({ v }) => size && quantityOf(v, size) !== undefined,
      );
      return (withSize || byName[0]).idx;
    }

    // 4. Barcode, 5. colour code.
    const byBarcode = variants.findIndex(
      (v) => !!v.barcode && String(v.barcode).trim() === color,
    );
    if (byBarcode >= 0) return byBarcode;

    const byCode = variants.findIndex(
      (v) => !!v.colorCode && norm(v.colorCode) === norm(color),
    );
    if (byCode >= 0) return byCode;

    // 6. Legacy restore heuristic: an id that merely contains the colour.
    if (mode === "give") {
      const byIdFragment = variants.findIndex(
        (v) => !!v.id && v.id.includes(color),
      );
      if (byIdFragment >= 0) return byIdFragment;
    }
  }

  // 7. The size alone.
  if (size) {
    const withSize = variants
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => quantityOf(v, size) !== undefined);
    if (withSize.length === 1) return withSize[0].idx;
    if (withSize.length > 1 && mode === "give") return withSize[0].idx;
  }

  // 8. Only one variant to choose from.
  if (variants.length === 1) return 0;

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

    const variantIndex = resolveVariantIndex(
      variants,
      stockId,
      adjustment,
      delta < 0 ? "take" : "give",
    );

    if (variantIndex < 0) {
      if (options.skipUnresolvable) {
        skipped.push({ adjustment, reason: "variant_not_found" });
        continue;
      }
      throw new StockAdjustmentError(
        "variant_not_found",
        `Variant not found for ${describe(stockId, adjustment)}`,
        { stockId, color: adjustment.color, size: adjustment.size },
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
        { stockId, color: variant.color, size: adjustment.size },
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
        },
      );
    }

    sizes[sizeIndex] = { ...sizes[sizeIndex], quantity: next };
    variants[variantIndex] = { ...variant, sizeQuantities: sizes };
    applied.push(adjustment);
  }

  return { colorVariants: variants, applied, skipped };
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
