export interface WholesaleTier {
  id: string;
  minQuantity: number;
  price: number;
}

export interface CartItem {
  id: string;
  stockId: string;
  groupName: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
  colorCode?: string;
  image?: string;
  shop: string;
  wholesaleTiers?: WholesaleTier[];
  // Discount tracking
  groupDiscount?: number; // Percentage discount applied to the entire group
  variantDiscount?: number; // Percentage discount applied to specific color/size variant
  discountedPrice?: number; // Final price after applying discounts
  isWholesalePricing?: boolean; // Flag to indicate if wholesale pricing is applied
  wholesalePrice?: number; // The wholesale price per item if wholesale pricing is applied
}

export interface SelectedCustomer {
  uid: string;
  email: string;
  displayName?: string;
  customerImage?: string;
  customerType?:
    | "retailer"
    | "wholesaler"
    | "distributor"
    | "individual"
    | "other";
}

export interface Cart {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  currency: "THB" | "MMK";
  selectedCustomer?: SelectedCustomer | null;
}

export interface CartContextType {
  cart: Cart;
  addToCart: (item: Omit<CartItem, "id">) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  completePurchase: () => void;
  getCartTotal: () => number;
  getCartItemCount: () => number;
  // Customer management functions
  setSelectedCustomer: (customer: SelectedCustomer | null) => void;
  getSelectedCustomer: () => SelectedCustomer | null;
  // Discount management functions
  applyGroupDiscount: (groupName: string, discountPercent: number) => void;
  applyVariantDiscount: (itemId: string, discountPercent: number) => void;
  removeGroupDiscount: (groupName: string) => void;
  removeVariantDiscount: (itemId: string) => void;
  applyWholesalePricing: (
    groupName: string,
    wholesalePricePerItem: number
  ) => void;
  removeWholesalePricing: (groupName: string) => void;
  setInventoryCallbacks?: (callbacks: {
    reduceStock: (
      stockId: string,
      color: string,
      size: string,
      quantity: number
    ) => Promise<void> | void;
    restoreStock: (
      stockId: string,
      color: string,
      size: string,
      quantity: number
    ) => Promise<void> | void;
    checkStock: (stockId: string, color: string, size: string) => number;
  }) => void;
}
