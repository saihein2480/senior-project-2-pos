import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { Cart, CartItem } from '@/types/cart';

const COLLECTION_NAME = 'carts';

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

export class CartService {
  /**
   * Watch a user's cart and report every change.
   *
   * The cart lives in Firestore rather than localStorage so the same till
   * session stays in sync across browsers and devices in real time. Returns the
   * unsubscribe function.
   */
  static subscribeToCart(
    userId: string,
    onCart: (cart: Cart | null) => void,
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

        onCart(snapshot.exists() ? mapCartData(snapshot.data()) : null);
      },
      (error) => {
        console.error('Error watching cart:', error);
        onError?.(error);
      },
    );
  }

  /**
   * Save cart to database
   */
  static async saveCart(userId: string, cart: Cart): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, cart will only be saved locally');
      return;
    }

    try {
      const cartData: Omit<DatabaseCart, 'id'> = {
        ...cart,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Use userId as document ID to ensure one cart per user
      const cartRef = doc(db, COLLECTION_NAME, userId);
      await setDoc(cartRef, {
        ...stripUndefined(cartData),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('Cart saved to database successfully');
    } catch (error) {
      console.error('Error saving cart to database:', error);
      // Don't throw error - allow app to continue with localStorage
    }
  }

  /**
   * Load cart from database
   */
  static async loadCart(userId: string): Promise<Cart | null> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, loading cart from localStorage only');
      return null;
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
   * Clear cart from database
   */
  static async clearCart(userId: string): Promise<void> {
    if (!db || !isFirebaseConfigured) {
      console.warn('Firebase not configured, cart will only be cleared locally');
      return;
    }

    try {
      const cartRef = doc(db, COLLECTION_NAME, userId);
      await deleteDoc(cartRef);
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