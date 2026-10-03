import {
  collection,
  getDocs,
  doc,
  serverTimestamp,
  Timestamp,
  getDoc,
  onSnapshot,
  runTransaction,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction as FirestoreTransaction,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { Cart, CartItem } from '@/types/cart';
import type { ColorVariant } from '@/types/stock';
import { applyAdjustments, groupLineAdjustments } from '@/lib/stockMath';

const COLLECTION_NAME = 'carts';
const STOCKS_COLLECTION = 'stocks';

/** Pending cart writes per user, so they commit in the order they were made. */
const writeQueues = new Map<string, Promise<void>>();

/** Run `task` after every earlier write for this user. `task` must not reject. */
function enqueueCartWrite<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(userId) ?? Promise.resolve();
  const next = previous.then(task);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(userId, settled);
  void settled.finally(() => {
    if (writeQueues.get(userId) === settled) writeQueues.delete(userId);
  });
  return next;
}

/**
 * Marker on `carts/{uid}`: this cart holds no stock.
 *
 * Until this change the till took stock when an item went into the cart and
 * gave it back on removal, so every cart saved before it (no `stockMode`)
 * still holds the stock of its lines. That stock is given back exactly once,
 * in the same transaction that sets the marker (releaseLegacyCartStock, and
 * saveCart / clearCart when they find such a cart). Every save writes it.
 */
export const CART_STOCK_MODE = 'deduct_at_payment' as const;

/**
 * Recursively drop keys whose value is `undefined`.
 *
 * Firestore rejects `undefined` outright, and optional fields on the cart
 * (a customer with no photo, a coupon with no recorded points cost) would
 * otherwise fail the whole write. Only plain objects and arrays are traversed so
 * Firestore sentinels like serverTimestamp() and Timestamps pass through intact.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as unknown as T;
  }

  if (
    value &&
    typeof value === 'object' &&
    (value as object).constructor === Object
  ) {
    const result: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      result[key] = stripUndefined(entry);
    });

    return result as T;
  }

  return value;
}

export interface DatabaseCart extends Cart {
  id?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  /** CART_STOCK_MODE on carts that hold no stock; absent on legacy carts. */
  stockMode?: string;
}

/** What giving back a legacy cart's stock did. */
export interface LegacyStockRelease {
  /** Units put back on the shelf. */
  restoredUnits: number;
  /** Lines (or parts of lines) that matched no product, variant or size. */
  skippedLines: number;
}

/** Shape a stored cart document back into a Cart. */
function mapCartData(data: Record<string, unknown>): Cart {
  const selectedCustomer = (data.selectedCustomer as Cart['selectedCustomer']) || null;
  const appliedCoupon = (data.appliedCoupon as Cart['appliedCoupon']) || null;

  return {
    items: (data.items as Cart['items']) || [],
    totalItems: (data.totalItems as number) || 0,
    totalAmount: (data.totalAmount as number) || 0,
    currency: (data.currency as Cart['currency']) || 'THB',
    selectedCustomer,
    // A coupon only makes sense alongside the customer it belongs to.
    appliedCoupon:
      appliedCoupon &&
      selectedCustomer &&
      appliedCoupon.customerUid === selectedCustomer.uid
        ? appliedCoupon
        : null,
  };
}

/** A stored cart saved before the marker, with lines whose stock it still holds. */
function holdsLegacyStock(data: DocumentData | undefined): boolean {
  if (!data || data.stockMode === CART_STOCK_MODE) return false;
  const items = Array.isArray(data.items) ? (data.items as CartItem[]) : [];
  return items.some((item) => Number(item?.quantity) > 0);
}

interface PreparedLegacyRelease {
  stockWrites: Array<{ ref: DocumentReference; colorVariants: ColorVariant[] }>;
  summary: LegacyStockRelease;
}

/**
 * Read phase of giving a legacy cart's stock back: reads every product its
 * lines name and works out the restored `colorVariants`. Writes nothing.
 *
 * Lines that no longer match a product, variant or size are skipped and
 * logged rather than put on a guessed variant.
 */
async function readLegacyRelease(
  tx: FirestoreTransaction,
  firestore: Firestore,
  cartData: DocumentData,
): Promise<PreparedLegacyRelease> {
  const items = Array.isArray(cartData.items) ? (cartData.items as CartItem[]) : [];
  const { byStock, unlinked } = groupLineAdjustments(items, 1);
  const stockIds = Array.from(byStock.keys());
  const refs = stockIds.map((stockId) => doc(firestore, STOCKS_COLLECTION, stockId));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

  const summary: LegacyStockRelease = { restoredUnits: 0, skippedLines: unlinked.length };
  const stockWrites: PreparedLegacyRelease['stockWrites'] = [];

  snaps.forEach((snap, index) => {
    const stockId = stockIds[index];
    const adjustments = byStock.get(stockId) || [];
    if (!snap.exists()) {
      console.warn(`Legacy cart: stock item ${stockId} not found; its lines were not restored`);
      summary.skippedLines += adjustments.length;
      return;
    }

    const result = applyAdjustments(
      (snap.data() as { colorVariants?: ColorVariant[] }).colorVariants,
      stockId,
      adjustments,
      { allowAddSize: true, skipUnresolvable: true },
    );
    if (result.skipped.length > 0) {
      console.warn(
        `Legacy cart: ${result.skipped.length} line(s) of stock ${stockId} matched no variant/size and were not restored`,
        result.skipped.map((entry) => entry.adjustment),
      );
      summary.skippedLines += result.skipped.length;
    }
    summary.restoredUnits += result.applied.reduce((sum, entry) => sum + entry.delta, 0);
    if (result.applied.length > 0) {
      stockWrites.push({ ref: refs[index], colorVariants: result.colorVariants });
    }
  });

  return { stockWrites, summary };
}

function writeLegacyRelease(tx: FirestoreTransaction, prepared: PreparedLegacyRelease): void {
  for (const write of prepared.stockWrites) {
    tx.update(write.ref, {
      colorVariants: write.colorVariants,
      updatedAt: serverTimestamp(),
    });
  }
}

function logRelease(userId: string, summary: LegacyStockRelease | null): void {
  if (!summary) return;
  console.info(
    `Cart ${userId}: returned ${summary.restoredUnits} unit(s) held by a cart saved before stock moved to payment` +
      (summary.skippedLines > 0 ? `; ${summary.skippedLines} line(s) could not be matched` : ''),
  );
}

export class CartService {
  /**
   * Watch a user's cart and report every change.
   *
   * The cart lives in Firestore rather than localStorage so the same till
   * session stays in sync across browsers and devices in real time. Returns the
   * unsubscribe function. `info.holdsLegacyStock` is true for a cart saved
   * before stock moved to payment; call releaseLegacyCartStock for it.
   */
  static subscribeToCart(
    userId: string,
    onCart: (cart: Cart | null, info: { holdsLegacyStock: boolean }) => void,
    onError?: (error: Error) => void,
  ): () => void {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, cart will not sync');
      return () => {};
    }

    const cartRef = doc(db, COLLECTION_NAME, userId);

    return onSnapshot(
      cartRef,
      (snapshot) => {
        // Skip our own not-yet-acknowledged writes: the local state is already
        // correct, and echoing it back would bounce between browsers.
        if (snapshot.metadata.hasPendingWrites) return;

        const data = snapshot.exists() ? snapshot.data() : undefined;
        onCart(data ? mapCartData(data) : null, {
          holdsLegacyStock: holdsLegacyStock(data),
        });
      },
      (error) => {
        console.error('Error watching cart:', error);
        onError?.(error);
      },
    );
  }

  /**
   * Give back, exactly once, the stock a legacy cart still holds.
   *
   * One transaction: read the cart; if it has no marker, read the products
   * its lines name, add each line's quantity back and set the marker. The
   * items stay in the cart (they are only checked against the shelf now).
   * Running it twice, or in two browsers at once, restores nothing the
   * second time. Resolves to what was done, or null when nothing was held.
   */
  static async releaseLegacyCartStock(userId: string): Promise<LegacyStockRelease | null> {
    if (!db || !isFirebaseConfigured) return null;

    const firestore = db;
    const cartRef = doc(firestore, COLLECTION_NAME, userId);

    const summary = await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(cartRef);
      if (!snap.exists() || snap.data().stockMode === CART_STOCK_MODE) return null;

      const data = snap.data();
      const prepared = holdsLegacyStock(data)
        ? await readLegacyRelease(tx, firestore, data)
        : null;
      if (prepared) writeLegacyRelease(tx, prepared);
      tx.update(cartRef, {
        stockMode: CART_STOCK_MODE,
        ...(prepared ? { legacyStockReleasedAt: serverTimestamp() } : {}),
      });
      return prepared?.summary ?? null;
    });

    logRelease(userId, summary);
    return summary;
  }

  /**
   * Save cart to database. Always writes the CART_STOCK_MODE marker.
   *
   * A transaction rather than a blind overwrite: if the stored cart is a
   * legacy one still holding stock (first save after the upgrade, or a tab
   * still running the old build wrote it), that stock is given back in the
   * same transaction before the new cart replaces it. Overwriting it first
   * would lose that stock for good.
   *
   * Saves for one user run one after another: two overlapping transactions
   * could otherwise commit out of order and leave the older cart stored.
   * Never rejects; resolves to false when the save failed (logged; a
   * transaction needs a connection), so the caller can try again.
   */
  static saveCart(userId: string, cart: Cart): Promise<boolean> {
    return enqueueCartWrite(userId, () => this.writeCart(userId, cart));
  }

  private static async writeCart(userId: string, cart: Cart): Promise<boolean> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, cart will not be saved');
      return true;
    }

    const firestore = db;
    const cartRef = doc(firestore, COLLECTION_NAME, userId);

    try {
      const cartData = stripUndefined({
        ...cart,
        userId,
        stockMode: CART_STOCK_MODE,
      });

      const summary = await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(cartRef);
        const prepared =
          snap.exists() && holdsLegacyStock(snap.data())
            ? await readLegacyRelease(tx, firestore, snap.data())
            : null;
        if (prepared) writeLegacyRelease(tx, prepared);

        tx.set(cartRef, {
          ...cartData,
          ...(prepared ? { legacyStockReleasedAt: serverTimestamp() } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return prepared?.summary ?? null;
      });

      logRelease(userId, summary);
      return true;
    } catch (error) {
      console.error('Error saving cart to database:', error);
      // Don't throw: the till keeps working with the cart in memory.
      return false;
    }
  }

  /**
   * Load cart from database (giving back legacy-held stock first).
   */
  static async loadCart(userId: string): Promise<Cart | null> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, no stored cart to load');
      return null;
    }

    try {
      await this.releaseLegacyCartStock(userId);
    } catch (error) {
      console.error('Error releasing stock held by a legacy cart:', error);
    }

    try {
      const cartRef = doc(db, COLLECTION_NAME, userId);
      const cartDoc = await getDoc(cartRef);

      if (cartDoc.exists()) {
        const cart = mapCartData(cartDoc.data());
        console.log('Cart loaded from database successfully');
        return cart;
      } else {
        console.log('No cart found in database for user');
        return null;
      }
    } catch (error) {
      console.error('Error loading cart from database:', error);
      return null;
    }
  }

  /**
   * Clear cart from database. A legacy cart's stock is given back in the
   * same transaction that deletes it. Queued behind pending saves.
   */
  static clearCart(userId: string): Promise<void> {
    return enqueueCartWrite(userId, () => this.deleteCart(userId));
  }

  private static async deleteCart(userId: string): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, cart will only be cleared locally');
      return;
    }

    const firestore = db;
    const cartRef = doc(firestore, COLLECTION_NAME, userId);

    try {
      const summary = await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(cartRef);
        if (!snap.exists()) return null;
        const prepared = holdsLegacyStock(snap.data())
          ? await readLegacyRelease(tx, firestore, snap.data())
          : null;
        if (prepared) writeLegacyRelease(tx, prepared);
        tx.delete(cartRef);
        return prepared?.summary ?? null;
      });
      logRelease(userId, summary);
      console.log('Cart cleared from database successfully');
    } catch (error) {
      console.error('Error clearing cart from database:', error);
      // Don't throw error - allow app to continue
    }
  }

  /**
   * Update specific cart item in database
   */
  static async updateCartItem(userId: string, cart: Cart): Promise<void> {
    // For now, just save the entire cart
    // In the future, we could optimize this to update specific items
    await this.saveCart(userId, cart);
  }

  /**
   * Get all carts (admin function)
   */
  static async getAllCarts(): Promise<DatabaseCart[]> {
    if (!db || !isFirebaseConfigured) {
      throw new Error('Firebase is not configured');
    }

    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const carts: DatabaseCart[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        carts.push({
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
        } as DatabaseCart);
      });

      return carts;
    } catch (error) {
      console.error('Error fetching carts:', error);
      throw new Error('Failed to fetch carts');
    }
  }
}
