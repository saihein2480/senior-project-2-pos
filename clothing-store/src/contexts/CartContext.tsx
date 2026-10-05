"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Cart,
  CartItem,
  CartContextType,
  SelectedCustomer,
  AppliedCoupon,
} from "@/types/cart";
import type { ColorVariant } from "@/types/stock";
import {
  doc,
  getDocFromServer,
  onSnapshot,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { cartSignature } from "@/lib/cartSignature";
import { useAuth } from "@/contexts/AuthContext";
import { CartService } from "@/services/cartService";
import { StockService } from "@/services/stockService";
import {
  availableToAdd,
  isSameStockLine,
  quantityInCart,
  shelfQuantity,
  trimLinesToShelf,
  type ShelfSnapshot,
  type StockLine,
} from "@/lib/stockMath";
import { toast } from "react-hot-toast";

/** Told about every fresh read of a product the cart makes. */
export type StockReadListener = (
  stockId: string,
  colorVariants: ColorVariant[],
) => void;

/**
 * The POS cart.
 *
 * The cart holds no stock: adding an item or raising a quantity only checks
 * the shelf (a fresh read of the product, minus what the cart already holds
 * of that line), and the sale itself takes the stock in the transaction that
 * saves it (transactionService.recordSale). Removing, lowering and clearing
 * touch nothing but the cart.
 */
export type PosCartContextValue = Omit<
  CartContextType,
  "addToCart" | "updateQuantity" | "setInventoryCallbacks"
> & {
  /** Resolves to false when the shelf cannot cover it (a toast says why). */
  addToCart: (item: Omit<CartItem, "id">) => Promise<boolean>;
  /** Raising a quantity is checked like adding; lowering always succeeds. */
  updateQuantity: (itemId: string, quantity: number) => Promise<boolean>;
  /**
   * Receive the variants of every product the cart reads (availability
   * checks, and the sold products right after a sale), so a screen can show
   * current numbers. Returns the unsubscribe function.
   */
  subscribeToStockReads: (listener: StockReadListener) => () => void;
};

const CartContext = createContext<PosCartContextValue | undefined>(undefined);

/** Key of the cart that older builds kept in localStorage. */
const LEGACY_LOCAL_CART_KEY = "shopping-cart";

function withTotals(prevCart: Cart, items: CartItem[]): Cart {
  return {
    ...prevCart,
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: items.reduce((sum, item) => {
      const price =
        item.discountedPrice !== undefined ? item.discountedPrice : item.unitPrice;
      return sum + price * item.quantity;
    }, 0),
  };
}

/** "Shirt" (Red / M) */
function describeLine(line: StockLine, colour?: string): string {
  const detail = [colour, line.selectedSize].filter(Boolean).join(" / ");
  return `"${line.groupName || "This item"}"${detail ? ` (${detail})` : ""}`;
}

/** Live shelf data for one product in the cart. */
interface ShelfEntry extends ShelfSnapshot {
  /** Confirmed by the server (not just the local cache). */
  fromServer: boolean;
}

/** How many saved cart signatures to remember as our own echoes. */
const MAX_WRITTEN_SIGNATURES = 20;



export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

interface CartProviderProps {
  children: React.ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>({
    items: [],
    totalItems: 0,
    totalAmount: 0,
    currency: "THB",
    selectedCustomer: null,
    appliedCoupon: null,
  });
  const [isLoadingCart, setIsLoadingCart] = useState(false);

  /**
   * The cart as last rendered, for the stock checks: they run after an await
   * and must not decide on the cart captured when they started.
   */
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  /**
   * Live shelf data for every product in the cart (one Firestore listener per
   * product, see the effect below). Adding or raising a quantity checks
   * against this synchronously, so the cart never waits on the network.
   */
  const shelvesRef = useRef(new Map<string, ShelfEntry>());
  const shelfListenersRef = useRef(new Map<string, () => void>());

  /**
   * Products with a change made before their shelf was known from the
   * server. Their first server snapshot trims any line the shelf can't cover.
   */
  const unverifiedRef = useRef(new Set<string>());

  const stockReadListenersRef = useRef(new Set<StockReadListener>());

  /** A legacy-cart stock release is running for this browser. */
  const legacyReleaseInFlightRef = useRef(false);

  /**
   * Signature of the cart state that Firestore and this client agree on.
   *
   * Every sync decision compares against it, which is what keeps writes and
   * snapshots from bouncing off each other:
   *  - a local edit produces a new signature, so it gets written
   *  - the echo of our own write matches, so it is ignored
   *  - a remote edit produces a new signature, so it is applied, and the
   *    resulting save pass sees a matching signature and stays quiet
   */
  const syncedSignatureRef = useRef<string | null>(null);

  /**
   * Signatures this browser has saved, newest last. Saves are transactions
   * (no local latency compensation), so the snapshot of an older save can
   * arrive after the cart has moved on; applying it would make a just-added
   * item vanish until the next save lands. Such echoes are ignored.
   */
  const writtenSignaturesRef = useRef<string[]>([]);

  /**
   * Local edits not saved yet (the debounce is pending) or saves still in
   * flight. While either is true a snapshot can only be our own older state
   * (or a concurrent edit our save is about to overwrite anyway), so it is
   * not applied: applying it is what brought removed items back.
   */
  const localDirtyRef = useRef(false);
  const savesInFlightRef = useRef(0);
  /** Bumped to re-run the save effect after a failed save. */
  const [saveRetryTick, setSaveRetryTick] = useState(0);

  // Watch the cart in Firestore so every browser signed in as this user stays
  // in sync in real time. There is deliberately no localStorage copy: the
  // database is the single source of truth.
  useEffect(() => {
    syncedSignatureRef.current = null;
    writtenSignaturesRef.current = [];
    localDirtyRef.current = false;
    if (!user?.uid) return;

    const uid = user.uid;
    setIsLoadingCart(true);

    // A cart saved before stock moved to payment still holds the stock of
    // its lines. Give it back once (the transaction sets the marker, so a
    // second browser or a retry restores nothing) and keep the items.
    const releaseLegacyStock = () => {
      if (legacyReleaseInFlightRef.current) return;
      legacyReleaseInFlightRef.current = true;
      CartService.releaseLegacyCartStock(uid)
        .catch((error) => {
          // The next snapshot or save tries again; saveCart also releases
          // atomically before it overwrites a legacy cart.
          console.error("Error releasing stock held by a legacy cart:", error);
        })
        .finally(() => {
          legacyReleaseInFlightRef.current = false;
        });
    };

    const unsubscribe = CartService.subscribeToCart(
      uid,
      (remoteCart, info) => {
        setIsLoadingCart(false);
        if (info.holdsLegacyStock) releaseLegacyStock();

        if (!remoteCart) {
          // No cart stored yet. Record an empty signature so the first local
          // edit is treated as a change worth writing.
          syncedSignatureRef.current = null;
          return;
        }

        const signature = cartSignature(remoteCart);
        if (signature === syncedSignatureRef.current) return;
        // Our own older save landing after a newer one was sent.
        if (writtenSignaturesRef.current.includes(signature)) return;
        // The cart has moved on locally and that state is on its way to
        // Firestore; don't roll it back to what the server held before.
        if (localDirtyRef.current || savesInFlightRef.current > 0) return;

        syncedSignatureRef.current = signature;
        setCart((prev) => ({
          ...remoteCart,
          // Currency is a per-browser display choice, not shared state.
          currency: prev.currency,
        }));
      },
      () => setIsLoadingCart(false),
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Push local cart changes to Firestore, debounced so rapid quantity taps
  // collapse into a single write.
  useEffect(() => {
    if (!user?.uid || isLoadingCart) return;

    const signature = cartSignature(cart);
    if (signature === syncedSignatureRef.current) {
      // Back to what was last saved (e.g. added then removed before the
      // debounce fired): nothing to write.
      localDirtyRef.current = false;
      return;
    }

    localDirtyRef.current = true;
    const uid = user.uid;
    const timer = setTimeout(() => {
      localDirtyRef.current = false;
      syncedSignatureRef.current = signature;
      writtenSignaturesRef.current = [
        ...writtenSignaturesRef.current.slice(-(MAX_WRITTEN_SIGNATURES - 1)),
        signature,
      ];
      savesInFlightRef.current += 1;
      // saveCart never rejects; false means the save failed (logged inside).
      void CartService.saveCart(uid, cart)
        .then((saved) => {
          // Firestore still holds the previous cart. Unless something newer
          // was saved since, forget the "synced" mark and try again shortly,
          // or a reload (or another device) would bring the old items back.
          if (!saved && syncedSignatureRef.current === signature) {
            syncedSignatureRef.current = null;
            setTimeout(() => setSaveRetryTick((tick) => tick + 1), 2000);
          }
        })
        .finally(() => {
          savesInFlightRef.current = Math.max(0, savesInFlightRef.current - 1);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [cart, user?.uid, isLoadingCart, saveRetryTick]);

  // Older builds kept a copy of the cart in localStorage. Its stock was taken
  // at add-to-cart time too, but there is no safe way to give it back exactly
  // once: it may duplicate the Firestore cart (released above) or exist in
  // several browsers, and nothing records whether it was already returned.
  // Nothing has read it since the cart moved to Firestore; log what it held
  // so the owner can reconcile by hand, then drop it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEGACY_LOCAL_CART_KEY);
      if (raw === null) return;
      console.warn(
        `Removed an obsolete browser copy of the cart ("${LEGACY_LOCAL_CART_KEY}"). Its stock was NOT returned automatically; check these lines against the shelf:`,
        raw,
      );
      window.localStorage.removeItem(LEGACY_LOCAL_CART_KEY);
    } catch {
      // localStorage unavailable (private mode): nothing to clean up.
    }
  }, []);

  const notifyStockRead = useCallback(
    (stockId: string, colorVariants: ColorVariant[]) => {
      stockReadListenersRef.current.forEach((listener) => {
        try {
          listener(stockId, colorVariants);
        } catch (error) {
          console.error("Stock read listener failed:", error);
        }
      });
    },
    [],
  );

  const subscribeToStockReads = useCallback((listener: StockReadListener) => {
    stockReadListenersRef.current.add(listener);
    return () => {
      stockReadListenersRef.current.delete(listener);
    };
  }, []);

  /**
   * Trim this product's lines to what its shelf now holds, with a toast per
   * line that changed. Used when a server read arrives for a product that
   * was added or raised before its shelf was known.
   */
  const reconcileWithShelf = useCallback((stockId: string) => {
    const entry = shelvesRef.current.get(stockId);
    if (!entry) return;

    const plan = trimLinesToShelf(cartRef.current.items, stockId, entry);
    if (plan.changes.length === 0) return;

    setCart((prevCart) => {
      const next = trimLinesToShelf(prevCart.items, stockId, entry);
      return next.changes.length > 0 ? withTotals(prevCart, next.items) : prevCart;
    });

    for (const change of plan.changes) {
      const what = describeLine(change.item, change.colour);
      toast.error(
        change.reason === "product_gone"
          ? `${what} is no longer in the catalogue and was removed from the cart.`
          : change.reason === "variant_gone"
            ? `${what}: this colour or size is no longer on the product, so it was removed from the cart.`
            : change.kept === 0
              ? `${what} is out of stock and was removed from the cart.`
              : `Only ${change.kept} of ${what} in stock; the cart was set to ${change.kept}.`,
        { duration: 4000 },
      );
    }
  }, []);

  /** One stocks/{id} snapshot: cache it, show it, and settle pending checks. */
  const handleShelfSnapshot = useCallback(
    (stockId: string, snap: DocumentSnapshot) => {
      const exists = snap.exists();
      const raw = exists ? (snap.data() as { colorVariants?: unknown }).colorVariants : undefined;
      const colorVariants = Array.isArray(raw) ? (raw as ColorVariant[]) : [];
      const fromServer = !snap.metadata.fromCache;

      const previous = shelvesRef.current.get(stockId);
      const dataChanged =
        !previous ||
        previous.exists !== exists ||
        JSON.stringify(previous.colorVariants) !== JSON.stringify(colorVariants);

      shelvesRef.current.set(stockId, { exists, colorVariants, fromServer });

      // Keep the sell screen's numbers current (metadata-only events skipped).
      if (dataChanged && exists) notifyStockRead(stockId, colorVariants);

      if (fromServer && unverifiedRef.current.has(stockId)) {
        unverifiedRef.current.delete(stockId);
        reconcileWithShelf(stockId);
      }
    },
    [notifyStockRead, reconcileWithShelf],
  );

  // One live listener per product in the cart. Few products, small docs; the
  // listener is what lets add / "+" decide without a network round trip, and
  // it shows sales at other tills on this screen as they happen.
  const cartStockIdsKey = Array.from(
    new Set(cart.items.map((item) => item.stockId).filter(Boolean)),
  )
    .sort()
    .join("|");

  useEffect(() => {
    if (!db || !isFirebaseConfigured) return;
    const firestore = db;
    const wanted = new Set(cartStockIdsKey ? cartStockIdsKey.split("|") : []);
    const listeners = shelfListenersRef.current;

    for (const [stockId, unsubscribe] of listeners) {
      if (wanted.has(stockId)) continue;
      unsubscribe();
      listeners.delete(stockId);
      shelvesRef.current.delete(stockId);
      unverifiedRef.current.delete(stockId);
    }

    for (const stockId of wanted) {
      if (listeners.has(stockId)) continue;
      const unsubscribe = onSnapshot(
        doc(firestore, "stocks", stockId),
        // Metadata changes too, so a cached first answer is followed by the
        // server's confirmation even when the data is the same.
        { includeMetadataChanges: true },
        (snap) => handleShelfSnapshot(stockId, snap),
        (error) => {
          console.error(`Stock listener for ${stockId} failed:`, error);
          // Without live data, the next change is added optimistically and
          // the sale itself remains the final check.
          shelvesRef.current.delete(stockId);
        },
      );
      listeners.set(stockId, unsubscribe);
    }
  }, [cartStockIdsKey, handleShelfSnapshot]);

  // Stop every shelf listener when the provider goes away.
  useEffect(() => {
    const listeners = shelfListenersRef.current;
    return () => {
      for (const unsubscribe of listeners.values()) unsubscribe();
      listeners.clear();
    };
  }, []);

  /**
   * Units of `line` the shelf can still take, from live data, or null when
   * the shelf isn't known from the server yet (add optimistically, verify
   * on the first server snapshot).
   */
  const liveAllowance = useCallback(
    (line: StockLine & { stockId: string }, alreadyInCart: number) => {
      const entry = shelvesRef.current.get(line.stockId);
      if (!entry?.fromServer) return null;
      if (!entry.exists) return { allowed: 0, shelf: 0, colour: undefined, gone: true as const };
      const shelf = shelfQuantity(entry.colorVariants, line.stockId, line);
      if (!shelf) return { allowed: 0, shelf: 0, colour: undefined, gone: true as const };
      return {
        allowed: availableToAdd(shelf.quantity, alreadyInCart),
        shelf: shelf.quantity,
        colour: shelf.variant.color,
        gone: false as const,
      };
    },
    [],
  );

  /**
   * Add to the cart straight away. The till already checked the numbers it
   * shows; with live shelf data the check here is exact, otherwise the line
   * goes in now and is trimmed (with a toast) if the server says the shelf
   * can't cover it. Nothing is taken from stock here; the sale does that and
   * refuses anything the shelf can't cover.
   */
  const addToCart = useCallback(
    (newItem: Omit<CartItem, "id">): Promise<boolean> => {
      const quantity = Math.floor(Number(newItem.quantity));
      if (!(quantity > 0)) return Promise.resolve(false);

      const inCart = quantityInCart(cartRef.current.items, newItem);
      const live = liveAllowance(newItem, inCart);
      if (live) {
        if (live.gone) {
          toast.error(`${describeLine(newItem)}: this colour or size is no longer available.`);
          return Promise.resolve(false);
        }
        if (quantity > live.allowed) {
          const what = describeLine(newItem, live.colour);
          toast.error(
            live.allowed === 0
              ? inCart > 0
                ? `All ${live.shelf} of ${what} in stock are already in the cart.`
                : `${what} is out of stock.`
              : `Only ${live.allowed} more of ${what} can be added (${live.shelf} in stock, ${inCart} already in the cart).`,
            { duration: 4000 },
          );
          return Promise.resolve(false);
        }
      } else {
        unverifiedRef.current.add(newItem.stockId);
      }

      const shelfCap = live ? live.shelf : Number.POSITIVE_INFINITY;
      setCart((prevCart) => {
        const existingItemIndex = prevCart.items.findIndex((item) =>
          isSameStockLine(item, newItem),
        );
        // A change that landed in between must not push past the shelf.
        if (quantityInCart(prevCart.items, newItem) + quantity > shelfCap) return prevCart;

        const updatedItems: CartItem[] =
          existingItemIndex >= 0
            ? prevCart.items.map((item, index) =>
                index === existingItemIndex
                  ? { ...item, quantity: item.quantity + quantity }
                  : item,
              )
            : [
                ...prevCart.items,
                {
                  ...newItem,
                  quantity,
                  id: `${newItem.stockId}-${newItem.selectedColor || "default"}-${
                    newItem.selectedSize || "default"
                  }-${Date.now()}`,
                },
              ];

        return withTotals(prevCart, updatedItems);
      });
      return Promise.resolve(true);
    },
    [liveAllowance],
  );

  // Removing touches only the cart: it holds no stock.
  const removeFromCart = (itemId: string) => {
    setCart((prevCart) =>
      withTotals(
        prevCart,
        prevCart.items.filter((item) => item.id !== itemId),
      ),
    );
  };

  /**
   * Set a line's quantity, straight away. Raising it is checked against the
   * live shelf when known (the new quantity may not exceed it), otherwise
   * verified on the product's first server snapshot; lowering it and
   * removing (quantity <= 0) only change the cart.
   */
  const updateQuantity = useCallback(
    (itemId: string, quantity: number): Promise<boolean> => {
      const target = Math.floor(Number(quantity));
      const currentItem = cartRef.current.items.find((item) => item.id === itemId);
      if (!currentItem) return Promise.resolve(false);

      if (!(target > 0)) {
        setCart((prevCart) =>
          withTotals(
            prevCart,
            prevCart.items.filter((item) => item.id !== itemId),
          ),
        );
        return Promise.resolve(true);
      }

      let shelfLimit = Number.POSITIVE_INFINITY;
      if (target > currentItem.quantity) {
        // Any other cart line for the same variant and size counts too.
        const elsewhere = Math.max(
          0,
          quantityInCart(cartRef.current.items, currentItem) - currentItem.quantity,
        );
        const live = liveAllowance(currentItem, elsewhere);
        if (live) {
          if (live.gone || target > live.allowed) {
            toast.error(
              live.gone
                ? `${describeLine(currentItem)}: this colour or size is no longer available.`
                : `Only ${live.allowed} of ${describeLine(currentItem, live.colour)} in stock; can't set the quantity to ${target}.`,
              { duration: 4000 },
            );
            return Promise.resolve(false);
          }
          shelfLimit = live.allowed;
        } else {
          unverifiedRef.current.add(currentItem.stockId);
        }
      }

      setCart((prevCart) => {
        const item = prevCart.items.find((entry) => entry.id === itemId);
        if (!item) return prevCart;
        if (target > item.quantity && target > shelfLimit) return prevCart;
        return withTotals(
          prevCart,
          prevCart.items.map((entry) =>
            entry.id === itemId ? { ...entry, quantity: target } : entry,
          ),
        );
      });
      return Promise.resolve(true);
    },
    [liveAllowance],
  );

  // Clearing touches only the cart: it holds no stock.
  const clearCart = () => {
    setCart({
      items: [],
      totalItems: 0,
      totalAmount: 0,
      currency: cart.currency,
      selectedCustomer: null,
      appliedCoupon: null,
    });
  };

  /**
   * Empty the cart after a sale. recordSale already took the stock, so the
   * sold products are re-read and passed to subscribeToStockReads listeners
   * (the till shows the new numbers without a reload).
   *
   * The re-read goes to the server, not through the local cache. Every sold
   * product has a live shelf listener while it is in the cart, and a plain
   * getDoc answers from that listener's copy, which right after the commit
   * usually still holds the pre-sale shelf (the change reaches the listener
   * a moment later). Emptying the cart then tears the listener down before
   * that change lands, so the till kept showing the old stock.
   */
  const completePurchase = () => {
    const soldStockIds = Array.from(
      new Set(cartRef.current.items.map((item) => item.stockId).filter(Boolean)),
    );

    setCart({
      items: [],
      totalItems: 0,
      totalAmount: 0,
      currency: cart.currency,
      selectedCustomer: null,
      appliedCoupon: null,
    });

    const firestore = db;
    soldStockIds.forEach((stockId) => {
      const fresh = firestore
        ? getDocFromServer(doc(firestore, "stocks", stockId)).then((snap) => {
            if (!snap.exists()) return;
            const raw = (snap.data() as { colorVariants?: unknown }).colorVariants;
            notifyStockRead(stockId, Array.isArray(raw) ? (raw as ColorVariant[]) : []);
          })
        : Promise.reject(new Error("Firestore is not initialized"));

      fresh.catch((serverError) => {
        // Offline or the server read failed: fall back to the normal read,
        // which is at worst the cached shelf.
        console.warn("Server read after the sale failed, using a cached read:", serverError);
        StockService.getStockById(stockId)
          .then((stock) => {
            if (stock) notifyStockRead(stockId, stock.colorVariants || []);
          })
          .catch((error) => {
            console.error("Could not refresh stock after the sale:", error);
          });
      });
    });
  };

  const getCartTotal = () => {
    return cart.totalAmount;
  };

  const getCartItemCount = () => {
    return cart.totalItems;
  };

  // Helper function to calculate discounted price
  const calculateDiscountedPrice = (
    originalPrice: number,
    groupDiscount?: number,
    variantDiscount?: number,
  ) => {
    // Sum all discounts first, then apply the total discount
    const totalDiscountPercent = (groupDiscount || 0) + (variantDiscount || 0);

    // Apply the total discount to the original price
    const discountedPrice = originalPrice * (1 - totalDiscountPercent / 100);

    return discountedPrice;
  };

  // Apply discount to all items in a specific group
  const applyGroupDiscount = (groupName: string, discountPercent: number) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.groupName === groupName) {
          const newGroupDiscount = discountPercent;
          const basePrice = item.isWholesalePricing && item.wholesalePrice !== undefined ? item.wholesalePrice : item.unitPrice;
          const discountedPrice = calculateDiscountedPrice(
            basePrice,
            newGroupDiscount,
            item.variantDiscount,
          );

          return {
            ...item,
            groupDiscount: newGroupDiscount,
            discountedPrice,
            // Keep unitPrice unchanged
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price =
          item.discountedPrice !== undefined
            ? item.discountedPrice
            : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Apply discount to a specific variant (individual item)
  const applyVariantDiscount = (itemId: string, discountPercent: number) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.id === itemId) {
          const newVariantDiscount = discountPercent;
          const basePrice = item.isWholesalePricing && item.wholesalePrice !== undefined ? item.wholesalePrice : item.unitPrice;
          const discountedPrice = calculateDiscountedPrice(
            basePrice,
            item.groupDiscount,
            newVariantDiscount,
          );

          return {
            ...item,
            variantDiscount: newVariantDiscount,
            discountedPrice,
            // Keep unitPrice unchanged
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price = item.discountedPrice !== undefined ? item.discountedPrice : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Remove group discount
  const removeGroupDiscount = (groupName: string) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.groupName === groupName) {
          const basePrice = item.isWholesalePricing && item.wholesalePrice !== undefined ? item.wholesalePrice : item.unitPrice;
          
          // If there's a variant discount, recalculate with just that
          // Otherwise, set discountedPrice to undefined (use unitPrice) or wholesale price if applicable
          const discountedPrice =
            item.variantDiscount && item.variantDiscount > 0
              ? calculateDiscountedPrice(
                  basePrice,
                  0, // Remove group discount
                  item.variantDiscount,
                )
              : (item.isWholesalePricing ? item.wholesalePrice : undefined);

          return {
            ...item,
            groupDiscount: 0,
            discountedPrice,
            // Keep unitPrice unchanged
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price =
          item.discountedPrice !== undefined
            ? item.discountedPrice
            : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Remove variant discount
  const removeVariantDiscount = (itemId: string) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.id === itemId) {
          const basePrice = item.isWholesalePricing && item.wholesalePrice !== undefined ? item.wholesalePrice : item.unitPrice;
          
          // If there's a group discount, recalculate with just that
          // Otherwise, set discountedPrice to undefined (use unitPrice) or wholesale price if applicable
          const discountedPrice =
            item.groupDiscount && item.groupDiscount > 0
              ? calculateDiscountedPrice(
                  basePrice,
                  item.groupDiscount,
                  0, // Remove variant discount
                )
              : (item.isWholesalePricing ? item.wholesalePrice : undefined);

          return {
            ...item,
            variantDiscount: 0,
            discountedPrice,
            // Keep unitPrice unchanged
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price =
          item.discountedPrice !== undefined
            ? item.discountedPrice
            : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Apply wholesale pricing to all items in a group
  const applyWholesalePricing = (
    groupName: string,
    wholesalePricePerItem: number,
  ) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.groupName === groupName) {
          // If there are existing percentage discounts, apply them on top of the wholesale price
          const discountedPrice = calculateDiscountedPrice(
            wholesalePricePerItem,
            item.groupDiscount,
            item.variantDiscount,
          );

          return {
            ...item,
            wholesalePrice: wholesalePricePerItem,
            discountedPrice,
            isWholesalePricing: true, // Mark as wholesale pricing
            // Keep unitPrice as original - don't change it
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price =
          item.discountedPrice !== undefined
            ? item.discountedPrice
            : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Remove wholesale pricing from all items in a group
  const removeWholesalePricing = (groupName: string) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map((item) => {
        if (item.groupName === groupName && item.isWholesalePricing) {
          return {
            ...item,
            discountedPrice: undefined, // Remove wholesale pricing
            isWholesalePricing: false,
          };
        }
        return item;
      });

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price =
          item.discountedPrice !== undefined
            ? item.discountedPrice
            : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalAmount,
      };
    });
  };

  // Customer management functions
  const setSelectedCustomer = useCallback(
    (customer: SelectedCustomer | null) => {
      setCart((prevCart) => ({
        ...prevCart,
        selectedCustomer: customer,
        // A coupon belongs to one customer, so switching customers drops it.
        appliedCoupon:
          prevCart.appliedCoupon &&
          customer &&
          prevCart.appliedCoupon.customerUid === customer.uid
            ? prevCart.appliedCoupon
            : null,
      }));
    },
    [],
  );

  const getSelectedCustomer = useCallback((): SelectedCustomer | null => {
    return cart.selectedCustomer || null;
  }, [cart.selectedCustomer]);

  const applyCoupon = useCallback((coupon: AppliedCoupon) => {
    setCart((prevCart) => ({
      ...prevCart,
      appliedCoupon: coupon,
    }));
  }, []);

  const removeCoupon = useCallback(() => {
    setCart((prevCart) => ({
      ...prevCart,
      appliedCoupon: null,
    }));
  }, []);

  const value: PosCartContextValue = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    completePurchase,
    getCartTotal,
    getCartItemCount,
    setSelectedCustomer,
    getSelectedCustomer,
    applyCoupon,
    removeCoupon,
    applyGroupDiscount,
    applyVariantDiscount,
    removeGroupDiscount,
    removeVariantDiscount,
    applyWholesalePricing,
    removeWholesalePricing,
    subscribeToStockReads,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
