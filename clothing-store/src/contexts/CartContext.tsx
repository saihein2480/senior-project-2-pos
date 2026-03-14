"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  Cart,
  CartItem,
  CartContextType,
  SelectedCustomer,
} from "@/types/cart";
import { useAuth } from "@/contexts/AuthContext";
import { CartService } from "@/services/cartService";
import { toast } from "react-hot-toast";

const CartContext = createContext<CartContextType | undefined>(undefined);

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
  });
  const [isLoadingCart, setIsLoadingCart] = useState(false);

  const [inventoryCallbacks, setInventoryCallbacks] = useState<{
    reduceStock: (
      stockId: string,
      color: string,
      size: string,
      quantity: number,
    ) => Promise<void> | void;
    restoreStock: (
      stockId: string,
      color: string,
      size: string,
      quantity: number,
    ) => Promise<void> | void;
    checkStock: (stockId: string, color: string, size: string) => number;
  } | null>(null);

  // Queue for inventory updates to be processed asynchronously
  const [inventoryUpdateQueue, setInventoryUpdateQueue] = useState<
    Array<{
      type: "reduce" | "restore";
      stockId: string;
      color: string;
      size: string;
      quantity: number;
    }>
  >([]);

  // Load cart from database when user is authenticated, fallback to localStorage
  useEffect(() => {
    const loadCart = async () => {
      if (user?.uid) {
        // User is authenticated, load from database
        setIsLoadingCart(true);
        try {
          const dbCart = await CartService.loadCart(user.uid);
          if (dbCart) {
            setCart(dbCart);
          } else {
            // No cart in database, check localStorage for migration
            const savedCart = localStorage.getItem("shopping-cart");
            if (savedCart) {
              try {
                const parsedCart = JSON.parse(savedCart);
                setCart(parsedCart);
                // Save to database for future use
                await CartService.saveCart(user.uid, parsedCart);
                // Clear localStorage after migration
                localStorage.removeItem("shopping-cart");
              } catch (error) {
                console.error("Error migrating cart from localStorage:", error);
              }
            }
          }
        } catch (error) {
          console.error("Error loading cart from database:", error);
          // Fallback to localStorage
          const savedCart = localStorage.getItem("shopping-cart");
          if (savedCart) {
            try {
              const parsedCart = JSON.parse(savedCart);
              setCart(parsedCart);
            } catch (error) {
              console.error("Error loading cart from localStorage:", error);
            }
          }
        } finally {
          setIsLoadingCart(false);
        }
      } else {
        // User not authenticated, use localStorage
        const savedCart = localStorage.getItem("shopping-cart");
        if (savedCart) {
          try {
            const parsedCart = JSON.parse(savedCart);
            setCart(parsedCart);
          } catch (error) {
            console.error("Error loading cart from localStorage:", error);
          }
        }
      }
    };

    loadCart();
  }, [user?.uid]);

  // Save cart to database and localStorage whenever it changes
  useEffect(() => {
    const saveCart = async () => {
      if (user?.uid && !isLoadingCart) {
        // User is authenticated, save to database
        try {
          await CartService.saveCart(user.uid, cart);
        } catch (error) {
          console.error("Error saving cart to database:", error);
          // Fallback to localStorage
          localStorage.setItem("shopping-cart", JSON.stringify(cart));
        }
      } else if (!user?.uid) {
        // User not authenticated, save to localStorage
        localStorage.setItem("shopping-cart", JSON.stringify(cart));
      }
    };

    saveCart();
  }, [cart, user?.uid, isLoadingCart]);

  // Process inventory update queue asynchronously
  useEffect(() => {
    const processQueue = async () => {
      if (inventoryUpdateQueue.length > 0 && inventoryCallbacks) {
        const promises = inventoryUpdateQueue.map(async (update) => {
          try {
            if (update.type === "reduce") {
              await inventoryCallbacks.reduceStock(
                update.stockId,
                update.color,
                update.size,
                update.quantity,
              );
            } else {
              await inventoryCallbacks.restoreStock(
                update.stockId,
                update.color,
                update.size,
                update.quantity,
              );
            }
          } catch (error) {
            console.error("Error processing inventory update:", error, update);
          }
        });

        await Promise.all(promises);
        // Clear the queue after processing
        setInventoryUpdateQueue([]);
      }
    };

    processQueue();
  }, [inventoryUpdateQueue, inventoryCallbacks]);

  // Helper function to queue inventory updates
  const queueInventoryUpdate = useCallback(
    (
      type: "reduce" | "restore",
      stockId: string,
      color: string,
      size: string,
      quantity: number,
    ) => {
      setInventoryUpdateQueue((prev) => [
        ...prev,
        { type, stockId, color, size, quantity },
      ]);
    },
    [],
  );

  const addToCart = (newItem: Omit<CartItem, "id">) => {
    // Check available stock before adding
    if (inventoryCallbacks?.checkStock) {
      console.debug("CartContext.addToCart: calling checkStock with", {
        stockId: newItem.stockId,
        selectedColor: newItem.selectedColor,
        selectedSize: newItem.selectedSize,
      });
      const stockInDatabase = inventoryCallbacks.checkStock(
        newItem.stockId,
        newItem.selectedColor || "",
        newItem.selectedSize || "",
      );
      console.debug("CartContext.addToCart: checkStock returned", {
        stockInDatabase,
      });

      // Find existing item in cart to calculate total quantity after addition
      const existingItem = cart.items.find(
        (item) =>
          item.stockId === newItem.stockId &&
          item.selectedSize === newItem.selectedSize &&
          (item.selectedColor === newItem.selectedColor ||
            item.colorCode === newItem.colorCode ||
            newItem.selectedColor === item.colorCode),
      );

      const currentCartQuantity = existingItem?.quantity || 0;
      const totalQuantityAfterAdd = currentCartQuantity + newItem.quantity;

      // Total available = stock in database + current quantity in cart
      const totalAvailable = stockInDatabase + currentCartQuantity;

      if (totalQuantityAfterAdd > totalAvailable) {
        const availableToAdd = totalAvailable - currentCartQuantity;
        console.warn("CartContext.addToCart: stock check failed", {
          newItem,
          stockInDatabase,
          currentCartQuantity,
          totalAvailable,
          availableToAdd,
        });
        toast.error(
          `Cannot add ${newItem.quantity} items. Only ${availableToAdd} available to add (${stockInDatabase} in stock + ${currentCartQuantity} already in cart).`,
        );
        return;
      }
    }

    setCart((prevCart) => {
      const existingItemIndex = prevCart.items.findIndex(
        (item) =>
          item.stockId === newItem.stockId &&
          item.selectedColor === newItem.selectedColor &&
          item.selectedSize === newItem.selectedSize,
      );

      let updatedItems: CartItem[];

      if (existingItemIndex >= 0) {
        // Update existing item quantity
        updatedItems = prevCart.items.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item,
        );
      } else {
        // Add new item
        const cartItem: CartItem = {
          ...newItem,
          id: `${newItem.stockId}-${newItem.selectedColor || "default"}-${
            newItem.selectedSize || "default"
          }-${Date.now()}`,
        };
        updatedItems = [...prevCart.items, cartItem];
      }

      const totalItems = updatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const totalAmount = updatedItems.reduce((sum, item) => {
        const price = item.discountedPrice !== undefined ? item.discountedPrice : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalItems,
        totalAmount,
      };
    });

    // Queue inventory reduction for the added item
    queueInventoryUpdate(
      "reduce",
      newItem.stockId,
      newItem.selectedColor || "",
      newItem.selectedSize || "",
      newItem.quantity,
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => {
      const itemToRemove = prevCart.items.find((item) => item.id === itemId);

      // Queue inventory restoration
      if (itemToRemove) {
        queueInventoryUpdate(
          "restore",
          itemToRemove.stockId,
          itemToRemove.selectedColor || "",
          itemToRemove.selectedSize || "",
          itemToRemove.quantity,
        );
      }

      const updatedItems = prevCart.items.filter((item) => item.id !== itemId);
      const totalItems = updatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const totalAmount = updatedItems.reduce((sum, item) => {
        const price = item.discountedPrice !== undefined ? item.discountedPrice : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalItems,
        totalAmount,
      };
    });
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    // Find the current item to validate stock
    const currentItem = cart.items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const quantityDifference = quantity - currentItem.quantity;

    // If quantity is being increased, check stock availability
    if (quantityDifference > 0 && inventoryCallbacks?.checkStock) {
      const stockInDatabase = inventoryCallbacks.checkStock(
        currentItem.stockId,
        currentItem.selectedColor || "",
        currentItem.selectedSize || "",
      );

      // Total available = stock in database + current quantity in cart
      const totalAvailable = stockInDatabase + currentItem.quantity;

      if (quantity > totalAvailable) {
        toast.error(
          `Cannot set quantity to ${quantity}. Only ${totalAvailable} available in total (${stockInDatabase} in stock + ${currentItem.quantity} already in cart).`,
          {
            duration: 4000,
            style: {
              minWidth: "350px",
              border: "1px solid #fee2e2",
            },
          },
        );
        return;
      }
    }

    setCart((prevCart) => {
      const currentItem = prevCart.items.find((item) => item.id === itemId);

      if (currentItem) {
        const quantityDifference = quantity - currentItem.quantity;

        if (quantityDifference > 0) {
          // Quantity increased - queue inventory reduction
          queueInventoryUpdate(
            "reduce",
            currentItem.stockId,
            currentItem.selectedColor || "",
            currentItem.selectedSize || "",
            quantityDifference,
          );
        } else if (quantityDifference < 0) {
          // Quantity decreased - queue inventory restoration
          queueInventoryUpdate(
            "restore",
            currentItem.stockId,
            currentItem.selectedColor || "",
            currentItem.selectedSize || "",
            Math.abs(quantityDifference),
          );
        }
      }

      const updatedItems = prevCart.items.map((item) =>
        item.id === itemId ? { ...item, quantity } : item,
      );
      const totalItems = updatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const totalAmount = updatedItems.reduce((sum, item) => {
        const price = item.discountedPrice !== undefined ? item.discountedPrice : item.unitPrice;
        return sum + price * item.quantity;
      }, 0);

      return {
        ...prevCart,
        items: updatedItems,
        totalItems,
        totalAmount,
      };
    });
  };

  const clearCart = () => {
    // Queue inventory restoration for all items
    cart.items.forEach((item) => {
      queueInventoryUpdate(
        "restore",
        item.stockId,
        item.selectedColor || "",
        item.selectedSize || "",
        item.quantity,
      );
    });

    setCart({
      items: [],
      totalItems: 0,
      totalAmount: 0,
      currency: cart.currency,
      selectedCustomer: null,
    });
  };

  const completePurchase = () => {
    // Clear cart without restoring inventory (items have been sold)
    setCart({
      items: [],
      totalItems: 0,
      totalAmount: 0,
      currency: cart.currency,
      selectedCustomer: null,
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

  const memoizedSetInventoryCallbacks = useCallback(
    (callbacks: {
      reduceStock: (
        stockId: string,
        color: string,
        size: string,
        quantity: number,
      ) => Promise<void> | void;
      restoreStock: (
        stockId: string,
        color: string,
        size: string,
        quantity: number,
      ) => Promise<void> | void;
      checkStock: (stockId: string, color: string, size: string) => number;
    }) => {
      setInventoryCallbacks(callbacks);
    },
    [],
  );

  // Customer management functions
  const setSelectedCustomer = useCallback(
    (customer: SelectedCustomer | null) => {
      setCart((prevCart) => ({
        ...prevCart,
        selectedCustomer: customer,
      }));
    },
    [],
  );

  const getSelectedCustomer = useCallback((): SelectedCustomer | null => {
    return cart.selectedCustomer || null;
  }, [cart.selectedCustomer]);

  const value: CartContextType = {
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
    applyGroupDiscount,
    applyVariantDiscount,
    removeGroupDiscount,
    removeVariantDiscount,
    applyWholesalePricing,
    removeWholesalePricing,
    setInventoryCallbacks: memoizedSetInventoryCallbacks,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
