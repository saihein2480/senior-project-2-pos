/**
 * stocks collection through the Admin SDK (server only).
 *
 * Mirrors the StockService methods /api/stocks uses, with the same return
 * shapes. Quantity merging reuses the pure helpers in @/lib/stockMath.
 */

import {
  FieldValue,
  type DocumentSnapshot,
  type QuerySnapshot,
} from "firebase-admin/firestore";
import type {
  ColorVariant,
  CreateStockRequest,
  StockItem,
  WholesaleTier,
} from "@/types/stock";
import {
  mergeOwnerEdit,
  StockAdjustmentError,
  type EditedVariant,
} from "@/lib/stockMath";
import { z } from "zod";
import { generateEAN13, generateId } from "@/lib/stockIds";
import { getAdminDb } from "./adminDb";
import { stripUndefined, timestampToIso, toClientJson } from "./serialize";

const COLLECTION_NAME = "stocks";

// ---- Request validation (POST /api/stocks, PUT /api/stocks/[id]) --------

const MISSING_STOCK_FIELDS =
  "Missing required fields: groupName, unitPrice, originalPrice";
const INVALID_STOCK_PRICES =
  "unitPrice and originalPrice must be non-negative numbers";

/** Parse a price field: a finite number >= 0, or null if invalid. */
function parsePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * Present in the old truthy sense: 0, "" and null count as missing, as they
 * always have for unitPrice/originalPrice (a zero price is refused).
 */
const presentValue = z.unknown().refine((value) => Boolean(value), {
  message: MISSING_STOCK_FIELDS,
});

const wholesaleTierSchema = z.looseObject({
  minQuantity: z.number().min(0),
  price: z.number().min(0),
});

const sizeQuantitySchema = z.looseObject({
  size: z.string(),
  quantity: z.number().int().min(0),
});

const colorVariantSchema = z.looseObject({
  color: z.string(),
  colorCode: z.string(),
  // Blank barcodes are filled in by withBarcode() on write.
  barcode: z.string(),
  sizeQuantities: z.array(sizeQuantitySchema),
  image: z
    .string()
    .nullish()
    .transform((image) => image ?? undefined),
  /** Edit form only: index of the loaded variant this one came from. */
  sourceIndex: z.number().int().min(0).nullish(),
});

/**
 * Body shared by create and edit. Field presence is checked before the price
 * values, matching the order the routes always reported problems in. Variant
 * and tier objects keep any extra fields (e.g. an existing tier `id`); only
 * the fields the stock maths depends on are type-checked.
 */
export const stockRequestSchema = z
  .object({
    groupName: z
      .string({
        error: (issue) =>
          issue.input === undefined || issue.input === null
            ? MISSING_STOCK_FIELDS
            : "groupName must be text",
      })
      .trim()
      .min(1, MISSING_STOCK_FIELDS),
    unitPrice: presentValue,
    originalPrice: presentValue,
    category: z.string().nullish(),
    releaseDate: z.string().optional(),
    shop: z.string().nullish(),
    isColorless: z.boolean().nullish(),
    groupImage: z.string().nullish(),
    wholesaleTiers: z.array(wholesaleTierSchema).nullish(),
    colorVariants: z.array(colorVariantSchema).nullish(),
    /** Edit form only: the variants as loaded, for the quantity merge. */
    baseColorVariants: z.array(z.looseObject({})).nullish(),
  })
  .transform((body, ctx) => {
    const unitPrice = parsePrice(body.unitPrice);
    const originalPrice = parsePrice(body.originalPrice);
    if (unitPrice === null || originalPrice === null) {
      ctx.addIssue({ code: "custom", message: INVALID_STOCK_PRICES });
      return z.NEVER;
    }
    return { ...body, unitPrice, originalPrice };
  });

export type StockRequestBody = z.output<typeof stockRequestSchema>;

function stocks() {
  return getAdminDb().collection(COLLECTION_NAME);
}

function mapStock(doc: DocumentSnapshot): StockItem {
  const data = doc.data() ?? {};
  return toClientJson({
    id: doc.id,
    ...data,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  }) as StockItem;
}

function mapStocks(snapshot: QuerySnapshot): StockItem[] {
  return snapshot.docs.map(mapStock);
}

function withBarcode<T extends { barcode?: string }>(variant: T): T {
  return {
    ...variant,
    barcode:
      variant.barcode && variant.barcode.toString().trim() !== ""
        ? variant.barcode
        : generateEAN13(),
  };
}

export async function getAllStocks(): Promise<StockItem[]> {
  return mapStocks(await stocks().orderBy("createdAt", "desc").get());
}

export async function getRecentStocks(limitCount = 10): Promise<StockItem[]> {
  return mapStocks(
    await stocks().orderBy("createdAt", "desc").limit(limitCount).get(),
  );
}

export async function getStocksByShop(shop: string): Promise<StockItem[]> {
  return mapStocks(
    await stocks()
      .where("shop", "==", shop)
      .orderBy("createdAt", "desc")
      .get(),
  );
}

export async function getStockById(id: string): Promise<StockItem | null> {
  const snapshot = await stocks().doc(id).get();
  return snapshot.exists ? mapStock(snapshot) : null;
}

export async function createStock(
  stockData: CreateStockRequest,
  userId: string,
): Promise<StockItem> {
  const wholesaleTiers: WholesaleTier[] = (stockData.wholesaleTiers || []).map(
    (tier) => ({ ...tier, id: generateId() }),
  );

  const colorVariants: ColorVariant[] = (stockData.colorVariants || []).map(
    (variant) => withBarcode({ ...variant, id: generateId() }),
  );

  const stockItem: Omit<StockItem, "id"> = {
    ...stockData,
    wholesaleTiers,
    colorVariants,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: userId,
  };

  const docRef = await stocks().add({
    ...stripUndefined(stockItem),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docRef.id, ...stockItem };
}

/** Whole-document update (legacy callers without a base snapshot). */
export async function updateStock(
  id: string,
  updates: Partial<StockItem>,
): Promise<void> {
  const payload: Partial<StockItem> = { ...updates };
  if (Array.isArray(payload.colorVariants)) {
    payload.colorVariants = payload.colorVariants.map(withBarcode);
  }

  await stocks()
    .doc(id)
    .update({
      ...stripUndefined(payload),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Save the edit form without undoing sales made while it was open.
 * See StockService.updateStockWithMerge and mergeOwnerEdit.
 */
export async function updateStockWithMerge(
  id: string,
  updates: Partial<Omit<StockItem, "colorVariants">>,
  editedVariants: EditedVariant[],
  baseVariants: ColorVariant[],
): Promise<ColorVariant[]> {
  const db = getAdminDb();
  const stockRef = db.collection(COLLECTION_NAME).doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(stockRef);
    if (!snap.exists) {
      throw new StockAdjustmentError(
        "stock_not_found",
        "This product no longer exists. It may have been deleted.",
        { stockId: id },
      );
    }

    const current = (snap.data() as Partial<StockItem>).colorVariants;
    const merged = mergeOwnerEdit(
      current,
      baseVariants,
      editedVariants,
      generateId,
    ).map(withBarcode);

    tx.update(stockRef, {
      ...stripUndefined(updates),
      colorVariants: stripUndefined(merged),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return merged;
  });
}

export async function deleteStock(id: string): Promise<void> {
  await stocks().doc(id).delete();
}
