import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
  getDoc,
  runTransaction,
  type DocumentReference,
  type DocumentData,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  StockItem,
  CreateStockRequest,
  WholesaleTier,
  ColorVariant,
} from "@/types/stock";
import {
  applyAdjustments,
  isStockAdjustmentError,
  mergeOwnerEdit,
  planOrderLineReturns,
  StockAdjustmentError,
  type ApplyAdjustmentsResult,
  type EditedVariant,
  type OrderLineReturn,
  type ReturnLedgerSource,
  type StockAdjustment,
} from "@/lib/stockMath";
import { generateEAN13, generateId } from "@/lib/stockIds";

/** A line to put back on the shelf (refund, cancellation, rejected order). */
export interface StockRestoreItem {
  stockId: string;
  colorName: string;
  size: string;
  quantity: number;
  variantHint?: string;
}

const COLLECTION_NAME = "stocks";

export class StockService {
  static async createStock(
    stockData: CreateStockRequest,
    userId: string,
  ): Promise<StockItem> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      // Generate IDs for wholesale tiers and color variants
      const wholesaleTiers: WholesaleTier[] = stockData.wholesaleTiers.map(
        (tier) => ({
          ...tier,
          id: generateId(),
        }),
      );

      const colorVariants: ColorVariant[] = (stockData.colorVariants || []).map(
        (variant) => ({
          ...variant,
          id: generateId(),
          barcode:
            variant.barcode && variant.barcode.toString().trim() !== ""
              ? variant.barcode
              : generateEAN13(),
        }),
      );

      const stockItem: Omit<StockItem, "id"> = {
        ...stockData,
        wholesaleTiers,
        colorVariants,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userId,
      };

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...stockItem,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        id: docRef.id,
        ...stockItem,
      };
    } catch (error) {
      console.error("Error creating stock:", error);
      throw new Error("Failed to create stock item");
    }
  }

  static async getAllStocks(): Promise<StockItem[]> {
    if (!db || !isFirebaseConfigured) {
      // Return mock data when Firebase is not configured
      return this.getMockStocks();
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const stocks: StockItem[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        stocks.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as StockItem);
      });

      return stocks;
    } catch (error) {
      console.error("Error fetching stocks:", error);
      throw new Error("Failed to fetch stocks");
    }
  }

  static async getRecentStocks(limitCount: number = 10): Promise<StockItem[]> {
    if (!db || !isFirebaseConfigured) {
      // Return mock data when Firebase is not configured
      return this.getMockStocks().slice(0, limitCount);
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        orderBy("createdAt", "desc"),
        limit(limitCount),
      );

      const querySnapshot = await getDocs(q);
      const stocks: StockItem[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        stocks.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as StockItem);
      });

      return stocks;
    } catch (error) {
      console.error("Error fetching recent stocks:", error);
      throw new Error("Failed to fetch recent stocks");
    }
  }

  static async getStocksByShop(shop: string): Promise<StockItem[]> {
    if (!db || !isFirebaseConfigured) {
      return this.getMockStocks().filter((stock) => stock.shop === shop);
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("shop", "==", shop),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const stocks: StockItem[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        stocks.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        } as StockItem);
      });

      return stocks;
    } catch (error) {
      console.error("Error fetching stocks by shop:", error);
      throw new Error("Failed to fetch stocks by shop");
    }
  }

  static async updateStock(
    id: string,
    updates: Partial<StockItem>,
  ): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      // If colorVariants are provided in updates, ensure each has a barcode
      if (updates.colorVariants && Array.isArray(updates.colorVariants)) {
        updates.colorVariants = updates.colorVariants.map((variant) => ({
          ...variant,
          barcode:
            variant.barcode && variant.barcode.toString().trim() !== ""
              ? variant.barcode
              : generateEAN13(),
        })) as unknown as ColorVariant[];
      }

      const stockRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(stockRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating stock:", error);
      throw new Error("Failed to update stock item");
    }
  }

  static async getStockById(id: string): Promise<StockItem | null> {
    if (!db || !isFirebaseConfigured) {
      // Return mock data when Firebase is not configured
      const mockStocks = this.getMockStocks();
      return mockStocks.find((stock) => stock.id === id) || null;
    }

    try {
      const stockRef = doc(db, COLLECTION_NAME, id);
      const stockDoc = await getDoc(stockRef);

      if (!stockDoc.exists()) {
        return null;
      }

      const data = stockDoc.data();
      return {
        id: stockDoc.id,
        ...data,
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate().toISOString()
            : data.createdAt,
        updatedAt:
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toDate().toISOString()
            : data.updatedAt,
      } as StockItem;
    } catch (error) {
      console.error("Error fetching stock by ID:", error);
      throw new Error("Failed to fetch stock item");
    }
  }

  static async deleteStock(id: string): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      console.error("Error deleting stock:", error);
      throw new Error("Failed to delete stock item");
    }
  }

  // Mock data for when Firebase is not configured
  private static getMockStocks(): StockItem[] {
    return [
      {
        id: "1",
        groupName: "Summer T-Shirt Collection",
        unitPrice: 25.99,
        originalPrice: 35.99,
        releaseDate: "2024-01-15",
        shop: "1",
        isColorless: false,
        groupImage: "/api/placeholder/200/250",
        wholesaleTiers: [
          { id: "wt1", minQuantity: 10, price: 20.99 },
          { id: "wt2", minQuantity: 50, price: 18.99 },
        ],
        colorVariants: [
          {
            id: "cv1",
            color: "Red",
            colorCode: "#FF0000",
            barcode: "1234567890123",
            image: "/api/placeholder/150/150",
            sizeQuantities: [
              { size: "S", quantity: 20 },
              { size: "M", quantity: 50 },
              { size: "L", quantity: 30 },
            ],
          },
          {
            id: "cv2",
            color: "Blue",
            colorCode: "#0000FF",
            barcode: "1234567890124",
            image: "/api/placeholder/150/150",
            sizeQuantities: [
              { size: "S", quantity: 15 },
              { size: "M", quantity: 25 },
              { size: "L", quantity: 30 },
              { size: "XL", quantity: 10 },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "mock-user-id",
      },
      {
        id: "2",
        groupName: "Winter Jacket Collection",
        unitPrice: 89.99,
        originalPrice: 120.99,
        releaseDate: "2024-01-10",
        shop: "2",
        isColorless: false,
        groupImage: "/api/placeholder/200/250",
        wholesaleTiers: [],
        colorVariants: [
          {
            id: "cv3",
            color: "Black",
            colorCode: "#000000",
            barcode: "1234567890125",
            image: "/api/placeholder/150/150",
            sizeQuantities: [
              { size: "M", quantity: 15 },
              { size: "L", quantity: 20 },
              { size: "XL", quantity: 25 },
              { size: "2XL", quantity: 10 },
            ],
          },
        ],
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        createdBy: "mock-user-id",
      },
    ];
  }

  /**
   * Change quantities on one stock document atomically.
   *
   * Reads the document inside a transaction, applies the deltas to whatever
   * is stored *now* and writes the result. If another writer commits in
   * between, Firestore retries the whole function against the newer data, so
   * concurrent sales, restocks and restores all add up instead of the last
   * writer erasing the others.
   *
   * Throws `StockAdjustmentError` with code `insufficient_stock` when a
   * negative delta would take a size below zero.
   */
  static async adjustStock(
    stockId: string,
    adjustments: StockAdjustment[],
    options: { allowAddSize?: boolean; skipUnresolvable?: boolean } = {},
  ): Promise<ApplyAdjustmentsResult> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    const firestore = db;
    const stockRef = doc(firestore, COLLECTION_NAME, stockId);

    return runTransaction(firestore, async (tx) => {
      const snap = await tx.get(stockRef);
      if (!snap.exists()) {
        throw new StockAdjustmentError(
          "stock_not_found",
          `Stock item ${stockId} not found`,
          { stockId },
        );
      }

      const data = snap.data() as Partial<StockItem>;
      const result = applyAdjustments(
        data.colorVariants,
        stockId,
        adjustments,
        options,
      );

      if (result.applied.length > 0) {
        tx.update(stockRef, {
          colorVariants: result.colorVariants,
          updatedAt: serverTimestamp(),
        });
      }

      return result;
    });
  }

  /**
   * Save the owner's edit form without undoing sales made while it was open.
   *
   * `baseVariants` is the `colorVariants` array the form was loaded from.
   * Quantities are merged as deltas against the current document (see
   * `mergeOwnerEdit`); everything else on the product is written as given.
   */
  static async updateStockWithMerge(
    id: string,
    updates: Partial<Omit<StockItem, "colorVariants">>,
    editedVariants: EditedVariant[],
    baseVariants: ColorVariant[],
  ): Promise<ColorVariant[]> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    const firestore = db;
    const stockRef = doc(firestore, COLLECTION_NAME, id);

    return runTransaction(firestore, async (tx) => {
      const snap = await tx.get(stockRef);
      if (!snap.exists()) {
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
      ).map((variant) => ({
        ...variant,
        barcode:
          variant.barcode && variant.barcode.trim() !== ""
            ? variant.barcode
            : generateEAN13(),
      }));

      tx.update(stockRef, {
        ...updates,
        colorVariants: merged,
        updatedAt: serverTimestamp(),
      });

      return merged;
    });
  }

  /**
   * Put an order's stock back through its returns ledger.
   *
   * The ledger (`stockReturnLedger` on the order document) records how many
   * units of each line have already come back. It is read, checked and
   * updated in the same transaction as the stock writes, so refunds,
   * cancellations and online-order status changes can be used in any
   * combination — or by two people at once — and an order is never restocked
   * beyond what was sold.
   *
   * `requireField` (normally `stockDeductedAt`) skips orders whose stock was
   * never taken, such as COD orders placed before the storefront started
   * deducting them.
   */
  static async returnOrderLines(
    lines: OrderLineReturn[],
    guard: {
      collection: "onlineOrders" | "transactions";
      docId: string;
      source: ReturnLedgerSource;
      requireField?: string;
      /** Extra fields to write once every line is fully back. */
      extraUpdatesWhenComplete?: (
        guardData: DocumentData,
      ) => Record<string, unknown>;
    },
  ): Promise<{ restocked: number; accounted: number; skippedReason?: string }> {
    if (!db || !isFirebaseConfigured) {
      console.warn("Firebase not configured, skipping inventory restoration");
      return { restocked: 0, accounted: 0, skippedReason: "not_configured" };
    }

    const firestore = db;
    const guardRef = doc(firestore, guard.collection, guard.docId);

    return runTransaction(firestore, async (tx) => {
      const guardSnap = await tx.get(guardRef);
      if (!guardSnap.exists()) {
        return { restocked: 0, accounted: 0, skippedReason: "order_not_found" };
      }

      const guardData = guardSnap.data();
      if (guard.requireField && !guardData[guard.requireField]) {
        return {
          restocked: 0,
          accounted: 0,
          skippedReason: "stock_never_deducted",
        };
      }

      const plan = planOrderLineReturns(guardData, guard.source, lines);
      if (plan.skippedReason) {
        return { restocked: 0, accounted: 0, skippedReason: plan.skippedReason };
      }
      if (plan.accounted === 0) {
        return {
          restocked: 0,
          accounted: 0,
          skippedReason: "nothing_left_to_return",
        };
      }

      // Firestore transactions need every read before the first write.
      const stockSnaps = await Promise.all(
        Array.from(plan.adjustmentsByStock.keys()).map(async (stockId) => {
          const ref = doc(firestore, COLLECTION_NAME, stockId);
          return { stockId, ref, snap: await tx.get(ref) };
        }),
      );

      const writes: Array<{
        ref: DocumentReference;
        colorVariants: ColorVariant[];
      }> = [];

      for (const { stockId, ref, snap } of stockSnaps) {
        if (!snap.exists()) {
          console.error(`Stock item ${stockId} not found; skipping restore`);
          continue;
        }

        const result = applyAdjustments(
          (snap.data() as Partial<StockItem>).colorVariants,
          stockId,
          plan.adjustmentsByStock.get(stockId) || [],
          { allowAddSize: true, skipUnresolvable: true },
        );

        if (result.skipped.length > 0) {
          console.error(
            `Could not match ${result.skipped.length} line(s) to a variant of stock ${stockId}; they were not restored`,
            result.skipped.map((s) => s.adjustment),
          );
        }
        if (result.applied.length > 0) {
          writes.push({ ref, colorVariants: result.colorVariants });
        }
      }

      for (const write of writes) {
        tx.update(write.ref, {
          colorVariants: write.colorVariants,
          updatedAt: serverTimestamp(),
        });
      }

      // `stockRestoredAt` keeps its old meaning — the whole order is back —
      // because the storefront reads it to decide whether a paid-late order
      // still holds its stock.
      const completesNow = plan.complete && !guardData.stockRestoredAt;
      tx.update(guardRef, {
        stockReturnLedger: plan.ledger,
        ...(completesNow
          ? {
              stockRestoredAt: new Date().toISOString(),
              ...(guard.extraUpdatesWhenComplete
                ? guard.extraUpdatesWhenComplete(guardData)
                : {}),
            }
          : {}),
      });

      return { restocked: plan.restocked, accounted: plan.accounted };
    });
  }

  /**
   * Restore inventory for a specific item, color, and size
   */
  static async restoreInventory(
    stockId: string,
    colorName: string,
    size: string,
    quantity: number,
    variantHint?: string,
  ): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      console.warn("Firebase not configured, skipping inventory restoration");
      return;
    }

    if (!stockId || !(quantity > 0)) return;

    try {
      // Runs as a transaction on the latest document, so a sale or restock
      // landing at the same moment is kept rather than overwritten.
      const result = await this.adjustStock(
        stockId,
        [{ variantId: variantHint, color: colorName, size, delta: quantity }],
        { allowAddSize: true, skipUnresolvable: true },
      );

      if (result.skipped.length > 0) {
        console.error(
          `Color variant "${colorName}" not found in stock item ${stockId}; nothing restored`,
        );
        return;
      }

      console.log(
        `✓ Restored ${quantity} units of ${stockId} (${colorName}, ${size})`,
      );
    } catch (error) {
      if (isStockAdjustmentError(error) && error.code === "stock_not_found") {
        console.error(`Stock item ${stockId} not found`);
        return;
      }
      console.error("Error restoring inventory:", error);
      throw new Error("Failed to restore inventory");
    }
  }

  /**
   * Restore inventory for multiple items (used for transaction cancellation)
   */
  static async restoreMultipleItems(
    items: Array<{
      stockId: string;
      colorName: string;
      size: string;
      quantity: number;
      variantHint?: string; // Added optional variantHint field
    }>,
  ): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      console.warn("Firebase not configured, skipping inventory restoration");
      return;
    }

    try {
      console.log(`Restoring inventory for ${items.length} items:`, items);

      // Group items by stockId to avoid race conditions
      const itemsByStockId = items.reduce(
        (groups, item) => {
          if (!groups[item.stockId]) {
            groups[item.stockId] = [];
          }
          groups[item.stockId].push(item);
          return groups;
        },
        {} as Record<string, typeof items>,
      );

      console.log(
        `Grouped items into ${Object.keys(itemsByStockId).length} stock groups:`,
        Object.entries(itemsByStockId).map(([stockId, items]) => ({
          stockId,
          count: items.length,
        })),
      );

      // One transaction per stock document: every line for that product is
      // applied together to the latest data.
      const restorationResults: Array<{
        success: boolean;
        item: {
          stockId: string;
          colorName: string;
          size: string;
          quantity: number;
        };
        error?: unknown;
      }> = [];

      for (const [stockId, stockItems] of Object.entries(itemsByStockId)) {
        const restorable = stockItems.filter((item) => item.quantity > 0);
        if (restorable.length === 0) continue;

        try {
          const result = await this.adjustStock(
            stockId,
            restorable.map((item) => ({
              variantId: item.variantHint,
              color: item.colorName,
              size: item.size,
              delta: item.quantity,
            })),
            { allowAddSize: true, skipUnresolvable: true },
          );

          if (result.skipped.length > 0) {
            console.error(
              `Could not match ${result.skipped.length} line(s) to a variant of stock ${stockId}; they were not restored`,
              result.skipped.map((s) => s.adjustment),
            );
          }
          restorable.forEach((item) =>
            restorationResults.push({ success: true, item }),
          );
        } catch (error) {
          if (
            isStockAdjustmentError(error) &&
            error.code === "stock_not_found"
          ) {
            // Matches the old per-item behaviour: a deleted product is logged,
            // not treated as a failed restoration.
            console.error(`Stock item ${stockId} not found`);
            restorable.forEach((item) =>
              restorationResults.push({ success: true, item }),
            );
            continue;
          }
          console.error(`✗ Failed to restore stock ${stockId}:`, error);
          restorable.forEach((item) =>
            restorationResults.push({ success: false, item, error }),
          );
        }
      }

      // Count successful and failed restorations
      const successful = restorationResults.filter(
        (result) => result.success,
      ).length;
      const failed = restorationResults.filter(
        (result) => !result.success,
      ).length;

      console.log(
        `Inventory restoration completed: ${successful} successful, ${failed} failed out of ${items.length} items`,
      );

      // Log failed items for debugging
      if (failed > 0) {
        const failedItems = restorationResults
          .filter((result) => !result.success)
          .map((result) => result.item);
        console.warn("Failed to restore these items:", failedItems);
      }

      // Only throw error if ALL items failed
      if (successful === 0 && failed > 0) {
        throw new Error(
          `Failed to restore inventory for all ${items.length} items`,
        );
      }
    } catch (error) {
      console.error("Error restoring multiple items:", error);
      throw new Error("Failed to restore inventory for multiple items");
    }
  }
}
