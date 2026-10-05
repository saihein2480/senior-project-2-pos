"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  Package,
  Filter,
  Plus,
  Minus,
  Search,
  X,
  ShoppingBag,
  Trash2,
  UserRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { openPosCart } from "@/lib/posCartEvents";
import { detectColorName } from "@/lib/colorUtils";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ColorVariant, StockItem, WholesaleTier } from "@/types/stock";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CategoryService } from "@/services/categoryService";
import { authFetch } from "@/lib/authFetch";
import { LEGACY_UNASSIGNED_BRANCH_NAME, matchesBranch } from "@/lib/branch";

// Bump this suffix whenever the shape or completeness of the cached inventory
// changes, so stale session caches are ignored instead of being trusted.
const INVENTORY_CACHE_KEY = "inventory_cache_v2";

interface ClothingInventoryItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  stock: number;
  colors: string[];
  image: string;
  category: string;
  isNew: boolean;
  shop: string;
  wholesaleTiers: WholesaleTier[];
  colorVariants: {
    id: string;
    color: string;
    colorCode: string;
    image?: string;
    sizeQuantities: { size: string; quantity: number }[];
  }[];
}

/** One cart line: product, the variant id this screen showed, size. */
function cartLineKey(stockId: string, variantId?: string, size?: string): string {
  return `${stockId}|${variantId || ""}|${size || ""}`;
}

/**
 * Page buttons for the product grid: the first and last page, the current one
 * and its neighbours, with "…" for the gaps, e.g. 1 … 9 10 11 … 25.
 *
 * Once there are more than 7 pages it is always 7 slots, so the bar keeps the
 * same width however many pages there are.
 */
function paginationItems(current: number, total: number): Array<number | "gap-start" | "gap-end"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap-end", total];
  if (current >= total - 3) {
    return [1, "gap-start", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "gap-start", current - 1, current, current + 1, "gap-end", total];
}

/** Whole-product stock minus everything of it already in the cart. */
function availableStockOf(
  item: ClothingInventoryItem,
  inCartByStock: Map<string, number>,
): number {
  return Math.max(0, (Number(item.stock) || 0) - (inCartByStock.get(item.id) || 0));
}

function OwnerHomeContent() {
  const {} = useAuth();
  const {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    subscribeToStockReads,
  } = useCart();
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();
  const { branch: currentBranchRef } = useSettings();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // API state for recent stocks
  const [clothingInventory, setClothingInventory] = useState<
    ClothingInventoryItem[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);

  // Filter state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>("all");
  const [priceRange, setPriceRange] = useState<{ min: string; max: string }>({
    min: "",
    max: "",
  });

  // Selection state for colors and sizes
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>(
    {},
  );
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>(
    {},
  );

  // Helper functions for color and size selection
  const handleColorSelect = (itemId: string, colorId: string) => {
    setSelectedColors((prev) => {
      const currentSelection = prev[itemId];
      // If clicking the same color, unselect it (set to empty string)
      const newColorId = currentSelection === colorId ? "" : colorId;
      return { ...prev, [itemId]: newColorId };
    });
    // Reset size selection when color changes or is unselected
    setSelectedSizes((prev) => ({ ...prev, [itemId]: "" }));
  };

  const handleSizeSelect = (itemId: string, size: string) => {
    setSelectedSizes((prev) => ({ ...prev, [itemId]: size }));
  };

  // The cart holds no stock any more (the sale takes it), so what this screen
  // offers is the shelf minus what is already in the cart.
  const inCartByLine = useMemo(() => {
    const byLine = new Map<string, number>();
    for (const line of cart.items) {
      const key = cartLineKey(line.stockId, line.selectedColor, line.selectedSize);
      byLine.set(key, (byLine.get(key) || 0) + Math.max(0, line.quantity));
    }
    return byLine;
  }, [cart.items]);

  const inCartByStock = useMemo(() => {
    const byStock = new Map<string, number>();
    for (const line of cart.items) {
      byStock.set(
        line.stockId,
        (byStock.get(line.stockId) || 0) + Math.max(0, line.quantity),
      );
    }
    return byStock;
  }, [cart.items]);

  /** Units of one size still available to add: shelf minus cart. */
  const availableForSize = (
    itemId: string,
    variantId: string,
    size: string,
    shelf: number,
  ) =>
    Math.max(
      0,
      (Number(shelf) || 0) -
        (inCartByLine.get(cartLineKey(itemId, variantId, size)) || 0),
    );

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".filter-dropdown-container")) {
        setShowFilterDropdown(false);
      }
    };

    if (showFilterDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilterDropdown]);

  // Load categories from Firebase
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await CategoryService.getCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();

    // Subscribe to real-time category updates
    const unsubscribe = CategoryService.subscribeToCategories((cats) => {
      setCategories(cats);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const getSelectedColorVariant = (item: ClothingInventoryItem) => {
    if (!item.colorVariants || item.colorVariants.length === 0) {
      return null;
    }
    const selectedColorId = selectedColors[item.id];

    // Return null if no color is selected (empty string)
    if (!selectedColorId) {
      return null;
    }

    const foundVariant = item.colorVariants.find((variant) => {
      return variant.id === selectedColorId;
    });

    return foundVariant || null;
  };

  /** Sizes of the selected colour, with what is still available to add. */
  const getAvailableSizes = (item: ClothingInventoryItem) => {
    const selectedVariant = getSelectedColorVariant(item);
    if (!selectedVariant) return [];
    return (selectedVariant.sizeQuantities || []).map((sizeQty) => ({
      ...sizeQty,
      quantity: availableForSize(
        item.id,
        selectedVariant.id,
        sizeQty.size,
        sizeQty.quantity,
      ),
    }));
  };

  const getStockForSize = (item: ClothingInventoryItem, size: string) => {
    const selectedVariant = getSelectedColorVariant(item);
    const sizeQty = selectedVariant?.sizeQuantities.find(
      (sq) => sq.size === size,
    );
    if (!selectedVariant || !sizeQty) return 0;
    return availableForSize(item.id, selectedVariant.id, size, sizeQty.quantity);
  };

  // Helper function to get the current image for an item
  const getCurrentImage = (item: ClothingInventoryItem) => {
    const selectedVariant = getSelectedColorVariant(item);
    // If a color variant is selected and has an image, use it; otherwise use the group image
    return (
      selectedVariant?.image ||
      item.image ||
      `https://via.placeholder.com/200x250/E5E7EB/6B7280?text=${item.name}`
    );
  };

  // Helper function to get shop name by shop ID
  const getShopName = (shopId: string) => {
    const shop = shops.find((s) => s.id === shopId);
    return shop?.name || "";
  };

  // Replace one product's variants in local state with what the database now
  // holds. This page loads stock once, so without this the numbers on screen
  // drift away from the database as online orders and other tills sell.
  const applyFreshVariants = useCallback(
    (itemId: string, freshVariants: ColorVariant[] | undefined) => {
      if (!Array.isArray(freshVariants)) return;

      const colorVariants = freshVariants.map((variant, index) => ({
        // Same id scheme as transformStockData, so selections stay valid.
        id: variant.id || `cv${index + 1}-${itemId}`,
        color: variant.color,
        colorCode: variant.colorCode,
        image: variant.image,
        sizeQuantities: variant.sizeQuantities || [],
      }));
      const stock = colorVariants.reduce(
        (total, variant) =>
          total +
          variant.sizeQuantities.reduce(
            (sizeTotal, sizeQty) => sizeTotal + (Number(sizeQty.quantity) || 0),
            0,
          ),
        0,
      );

      setClothingInventory((prevInventory) =>
        prevInventory.map((item) =>
          item.id === itemId ? { ...item, colorVariants, stock } : item,
        ),
      );
    },
    [],
  );

  // Every fresh read the cart makes (the check when adding or raising a
  // quantity, and the sold products right after a sale) updates the numbers
  // shown here. The cart itself no longer changes stock.
  useEffect(
    () => subscribeToStockReads(applyFreshVariants),
    [subscribeToStockReads, applyFreshVariants],
  );

  // Transform stock data to clothing inventory format
  const transformStockData = useCallback(
    (stocks: StockItem[]): ClothingInventoryItem[] => {
      return stocks.map((stock: StockItem) => {
        // Handle missing or empty colorVariants
        const hasColorVariants =
          stock.colorVariants && stock.colorVariants.length > 0;

        if (!hasColorVariants) {
          // Return item without color variants - UI will handle this appropriately
          const NEW_DAYS = Number(process.env.NEXT_PUBLIC_NEW_ITEM_DAYS) || 7;
          const MS_PER_DAY = 24 * 60 * 60 * 1000;

          const computeIsNew = (s: StockItem) => {
            try {
              const created = (s as { createdAt?: unknown }).createdAt;
              if (!created) return false;
              let createdMs = Date.now();

              // Handle Firestore Timestamp-like objects, numbers (ms), or ISO date strings
              if (
                created &&
                typeof (created as { toMillis?: unknown }).toMillis ===
                  "function"
              ) {
                createdMs = (created as { toMillis: () => number }).toMillis();
              } else if (typeof created === "number") {
                createdMs = created;
              } else if (typeof created === "string") {
                createdMs = new Date(created).getTime();
              } else {
                return false;
              }

              return Date.now() - createdMs <= NEW_DAYS * MS_PER_DAY;
            } catch (e) {
              return false;
            }
          };

          return {
            id: stock.id,
            name: stock.groupName,
            price: stock.unitPrice,
            originalPrice: stock.originalPrice || stock.unitPrice,
            stock: 0, // No stock since no variants
            colors: [],
            image:
              stock.groupImage ||
              `https://via.placeholder.com/200x250/E5E7EB/6B7280?text=${stock.groupName}`,
            category: stock.category || "Uncategorized",
            isNew: computeIsNew(stock),
            shop: stock.shop,
            wholesaleTiers: stock.wholesaleTiers || [],
            colorVariants: [], // Empty array - no variants available
          };
        }

        // Use existing colorVariants if they exist
        const NEW_DAYS = Number(process.env.NEXT_PUBLIC_NEW_ITEM_DAYS) || 7;
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        const computeIsNew = (s: StockItem) => {
          try {
            const created = (s as { createdAt?: unknown }).createdAt;
            if (!created) return false;
            let createdMs = Date.now();

            // Firestore-like Timestamp with toMillis()
            if (
              typeof created === "object" &&
              created !== null &&
              typeof (created as { toMillis?: unknown }).toMillis === "function"
            ) {
              createdMs = (created as { toMillis: () => number }).toMillis();
            } else if (typeof created === "number") {
              createdMs = created;
            } else if (typeof created === "string") {
              createdMs = new Date(created).getTime();
            } else {
              return false;
            }

            return Date.now() - createdMs <= NEW_DAYS * MS_PER_DAY;
          } catch (e) {
            return false;
          }
        };

        return {
          id: stock.id,
          name: stock.groupName,
          price: stock.unitPrice,
          originalPrice: stock.originalPrice,
          stock: stock.colorVariants.reduce(
            (total, variant) =>
              total +
              variant.sizeQuantities.reduce(
                (sizeTotal, sizeQty) => sizeTotal + sizeQty.quantity,
                0,
              ),
            0,
          ),
          colors: [
            ...new Set(
              stock.colorVariants.map((variant) => variant.color.toLowerCase()),
            ),
          ],
          image:
            stock.groupImage ||
            `https://via.placeholder.com/200x250/E5E7EB/6B7280?text=${stock.groupName}`,
          category: stock.category || "Uncategorized",
          isNew: computeIsNew(stock),
          shop: stock.shop,
          wholesaleTiers: stock.wholesaleTiers || [],
          colorVariants: stock.colorVariants.map((variant, index) => {
            return {
              id: variant.id || `cv${index + 1}-${stock.id}`, // Ensure ID exists
              color: variant.color,
              colorCode: variant.colorCode,
              image: variant.image,
              sizeQuantities: variant.sizeQuantities,
            };
          }),
        };
      });
    },
    [],
  );

  // Fetch shops and categories together for better performance
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch shops and categories in parallel
        const [shopsResponse, cats] = await Promise.all([
          authFetch("/api/shops"),
          CategoryService.getCategories(),
        ]);

        if (shopsResponse.ok) {
          const shopsData = await shopsResponse.json();
          setShops(shopsData.data || []);
        }

        setCategories(cats);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setShopsLoading(false);
      }
    };

    fetchInitialData();

    // Subscribe to real-time category updates
    const unsubscribe = CategoryService.subscribeToCategories((cats) => {
      setCategories(cats);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Set up real-time inventory updates
  useEffect(() => {
    console.log('Starting inventory load...');
    const startTime = Date.now();
    
    // Try to load from cache first. The key is versioned so that an older
    // cache (which held only the first 20 products) is discarded rather than
    // being served back as if it were the full catalogue.
    const cachedData = sessionStorage.getItem(INVENTORY_CACHE_KEY);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setClothingInventory(parsed);
        setIsLoading(false);
        console.log('Loaded from cache instantly');
      } catch (e) {
        console.error('Cache parse error:', e);
      }
    } else {
      setIsLoading(true);
    }
    
    setError(null);

    // Live catalogue: one listener on the whole `stocks` collection. The first
    // answer is the full list (the same read the old one-time fetch made);
    // after that Firestore sends only the documents that change, so a sale on
    // this till, another till, an online order or a stock edit shows up here
    // within a moment, without reloading.
    //
    // The whole catalogue is needed: the branch / category / stock filters
    // below all run client-side, so truncating this query would silently hide
    // products from the selected branch.
    if (!db) {
      setError('Failed to load inventory');
      setIsLoading(false);
      return;
    }

    let firstSnapshot = true;
    let hasData = false;
    const unsubscribe = onSnapshot(
      query(collection(db, 'stocks'), orderBy('createdAt', 'desc')),
      (querySnapshot) => {
        const stocks = querySnapshot.docs.map((stockDoc) => {
          const data = stockDoc.data();
          return {
            id: stockDoc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          } as StockItem;
        });

        if (firstSnapshot) {
          firstSnapshot = false;
          console.log(
            `Loaded ${stocks.length} stocks from Firebase in ${Date.now() - startTime}ms (live)`,
          );
        }

        hasData = true;
        setClothingInventory(transformStockData(stocks));
        setError(null);
        setIsLoading(false);
      },
      (listenError) => {
        console.error('Live stock listener failed:', listenError);
        // Keep showing what we have; only an empty screen needs the error.
        if (!hasData && !cachedData) setError('Failed to load inventory');
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [transformStockData]);

  // Keep the session cache in step with live stock changes (sales, other
  // tills, online orders). The cache is what this page shows first on its
  // next visit, so without this it reappeared with pre-sale numbers.
  useEffect(() => {
    if (isLoading || clothingInventory.length === 0) return;
    try {
      sessionStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(clothingInventory));
    } catch {
      // Storage full or unavailable: the next full fetch still corrects it.
    }
  }, [clothingInventory, isLoading]);

  // Initialize color selection for each item when inventory loads
  useEffect(() => {
    // Initialize selectedColors as empty - no auto-selection
    setSelectedColors((prev) => {
      const newColors = { ...prev };
      let hasChanges = false;

      clothingInventory.forEach((item) => {
        if (!newColors[item.id]) {
          newColors[item.id] = ""; // No color selected initially
          hasChanges = true;
        }
      });

      return hasChanges ? newColors : prev;
    });
  }, [clothingInventory]);

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  /** What the cashier is typing into "Go to page". */
  const [pageJump, setPageJump] = useState("");
  /** Top of the product grid, scrolled back into view on page change. */
  const productGridRef = useRef<HTMLDivElement>(null);

  // Use API data
  const displayInventory = clothingInventory;

  // Debug inventory source
  console.log("Inventory source:", {
    clothingInventoryLength: clothingInventory.length,
    firstItem: displayInventory[0],
    firstItemColorVariants: displayInventory[0]?.colorVariants,
  });

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategory("all");
    setSelectedStockStatus("all");
    setPriceRange({ min: "", max: "" });
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedStockStatus !== "all" ||
    priceRange.min !== "" ||
    priceRange.max !== "";

  // Filter items based on search term and shop (memoized for performance)
  const filteredInventory = useMemo(() => {
    const filtered = displayInventory.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // This cashier's branch, matched by shop id first; legacy rows that
      // stored a branch name (current or former) or nothing at all ("Main
      // Branch") still match. Renaming a shop no longer hides its stock.
      const matchesShop = matchesBranch(item, currentBranchRef, {
        unassignedBranchName: LEGACY_UNASSIGNED_BRANCH_NAME,
      });

      // Category filter
      const matchesCategory =
        selectedCategory === "all" ||
        (item.category &&
          item.category.toLowerCase() === selectedCategory.toLowerCase());

      // Stock status filter, on what is still available (shelf minus cart).
      // Treat "in-stock" as any positive stock (includes low-stock)
      const available = availableStockOf(item, inCartByStock);
      const matchesStockStatus =
        selectedStockStatus === "all" ||
        (selectedStockStatus === "in-stock" && available > 0) ||
        (selectedStockStatus === "low-stock" &&
          available > 0 &&
          available <= 10) ||
        (selectedStockStatus === "out-of-stock" && available === 0);

      // Price range filter
      const matchesPriceRange =
        (priceRange.min === "" || item.price >= parseFloat(priceRange.min)) &&
        (priceRange.max === "" || item.price <= parseFloat(priceRange.max));

      return (
        matchesSearch &&
        matchesShop &&
        matchesCategory &&
        matchesStockStatus &&
        matchesPriceRange
      );
    });

    // Sort items: in-stock items first, out-of-stock items last
    return filtered.sort((a, b) => {
      const aStock = availableStockOf(a, inCartByStock);
      const bStock = availableStockOf(b, inCartByStock);
      if (aStock === 0 && bStock > 0) return 1; // a is out of stock, move to end
      if (aStock > 0 && bStock === 0) return -1; // b is out of stock, move to end
      return 0; // maintain original order for items with same stock status
    });
  }, [
    displayInventory,
    inCartByStock,
    searchTerm,
    currentBranchRef,
    selectedCategory,
    selectedStockStatus,
    priceRange.min,
    priceRange.max,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / itemsPerPage));
  const pageStartIndex = (currentPage - 1) * itemsPerPage;
  const pageEndIndex = Math.min(pageStartIndex + itemsPerPage, filteredInventory.length);

  // Get current page items (memoized for performance)
  const currentPageItems = useMemo(
    () => filteredInventory.slice(pageStartIndex, pageStartIndex + itemsPerPage),
    [filteredInventory, pageStartIndex, itemsPerPage],
  );

  // The list can shrink under the cashier (live stock, filters): never sit on
  // a page past the end.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(1, page), totalPages);
    if (next === currentPage) return;
    setCurrentPage(next);
    // The controls sit below the grid; start the new page at its top.
    productGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Reset to first page when search changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  /**
   * Add the selected colour/size of a product to the order.
   *
   * Same checks as before (colour and size chosen, the shown shelf minus cart
   * can cover it); addToCart re-checks against a fresh read and the sale is
   * the final word. Resolves to whether the line went in.
   */
  const handleAddToCart = async (
    item: ClothingInventoryItem,
    quantity: number = 1,
  ): Promise<boolean> => {
    try {
      const selectedVariant = getSelectedColorVariant(item);
      const selectedSize = selectedSizes[item.id];

      // Validate that color and size are selected
      if (!selectedVariant) {
        toast.error("Please select a color");
        return false;
      }

      if (!selectedSize) {
        toast.error("Please select a size");
        return false;
      }

      // Quick check on the numbers shown (shelf minus cart). addToCart checks
      // again against a fresh read, and the sale itself is the final word.
      const stockForSize = getStockForSize(item, selectedSize);
      if (stockForSize === 0) {
        toast.error(
          inCartByLine.get(cartLineKey(item.id, selectedVariant.id, selectedSize))
            ? "All of this size in stock is already in the cart"
            : "Selected size is out of stock",
        );
        return false;
      }
      if (quantity > stockForSize) {
        toast.error(`Only ${stockForSize} of this size can be added`);
        return false;
      }

      // Nothing is taken from stock here; the sale does that.
      return await addToCart({
        stockId: item.id,
        groupName: item.name,
        unitPrice: item.price,
        originalPrice: item.originalPrice,
        quantity,
        selectedColor: selectedVariant.id,
        selectedSize: selectedSize,
        colorCode: selectedVariant.colorCode,
        image: item.image,
        shop: item.shop,
        wholesaleTiers: item.wholesaleTiers,
      });
    } catch (error) {
      console.error("Error adding item to cart:", error);
      return false;
    }
  };

  // ---------------------------------------------------------------------
  // Variant picker (tap a product -> choose colour, size, quantity)
  // ---------------------------------------------------------------------
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [pickerQuantity, setPickerQuantity] = useState(1);
  const [isAddingFromPicker, setIsAddingFromPicker] = useState(false);
  const pickerCloseRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pickerItem = useMemo(
    () =>
      pickerItemId
        ? clothingInventory.find((item) => item.id === pickerItemId) || null
        : null,
    [pickerItemId, clothingInventory],
  );

  const openPicker = (item: ClothingInventoryItem) => {
    // A single colour is the only choice, so pick it for the cashier.
    if (item.colorVariants.length === 1 && !selectedColors[item.id]) {
      const onlyVariantId = item.colorVariants[0].id;
      setSelectedColors((prev) => ({ ...prev, [item.id]: onlyVariantId }));
      setSelectedSizes((prev) => ({ ...prev, [item.id]: "" }));
    }
    setPickerQuantity(1);
    setPickerItemId(item.id);
  };

  const closePicker = useCallback(() => {
    setPickerItemId(null);
    setPickerQuantity(1);
  }, []);

  // Escape closes the picker; focus starts on its close button.
  useEffect(() => {
    if (!pickerItemId) return;
    pickerCloseRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [pickerItemId, closePicker]);

  // "/" jumps to product search, like most tills.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const pickerSizeStock =
    pickerItem && selectedSizes[pickerItem.id]
      ? getStockForSize(pickerItem, selectedSizes[pickerItem.id])
      : 0;

  // Keep the quantity inside what the chosen size can cover.
  useEffect(() => {
    if (pickerSizeStock > 0 && pickerQuantity > pickerSizeStock) {
      setPickerQuantity(pickerSizeStock);
    }
  }, [pickerSizeStock, pickerQuantity]);

  const handleAddFromPicker = async () => {
    if (!pickerItem || isAddingFromPicker) return;
    const itemId = pickerItem.id;
    const addedVariant = getSelectedColorVariant(pickerItem);
    const addedSize = selectedSizes[itemId];
    const addedQuantity = pickerQuantity;

    setIsAddingFromPicker(true);
    const added = await handleAddToCart(pickerItem, addedQuantity);
    setIsAddingFromPicker(false);
    if (added) {
      const what = [addedVariant?.color, addedSize].filter(Boolean).join(" · ");
      toast.success(`${t.addedToOrder}: ${what} × ${addedQuantity}`, {
        id: "pos-added",
        duration: 1500,
      });
      // Keep the picker open so another colour or size of the same product
      // can be added straight away. The colour stays, the size is cleared so
      // the next tap is a deliberate choice, and quantity starts at 1 again.
      setSelectedSizes((prev) => ({ ...prev, [itemId]: "" }));
      setPickerQuantity(1);
    }
  };

  /** Units of one colour already in the order (all its sizes). */
  const inOrderForVariant = (itemId: string, variantId: string) => {
    let total = 0;
    for (const line of cart.items) {
      if (line.stockId === itemId && line.selectedColor === variantId) {
        total += Math.max(0, line.quantity);
      }
    }
    return total;
  };

  /** Units of one colour still available to add (all its sizes). */
  const availableForVariant = (
    item: ClothingInventoryItem,
    variant: ClothingInventoryItem["colorVariants"][number],
  ) =>
    (variant.sizeQuantities || []).reduce(
      (total, sq) =>
        total + availableForSize(item.id, variant.id, sq.size, sq.quantity),
      0,
    );

  // ---------------------------------------------------------------------
  // Order panel
  // ---------------------------------------------------------------------
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const handleClearOrder = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearCart();
    setConfirmClear(false);
  };

  /** Readable colour for a cart line (the cart stores the variant id). */
  const colorNameForLine = (stockId: string, variantId?: string, colorCode?: string) => {
    const product = clothingInventory.find((item) => item.id === stockId);
    const variant = product?.colorVariants.find((v) => v.id === variantId);
    if (variant?.color) return variant.color;
    if (colorCode) {
      try {
        return detectColorName(colorCode) || colorCode;
      } catch {
        return colorCode;
      }
    }
    return "";
  };

  const orderLines = cart.items;
  const orderItemCount = cart.totalItems;
  const orderTotal = cart.totalAmount;
  const orderCustomerName =
    cart.selectedCustomer?.displayName ||
    cart.selectedCustomer?.email ||
    t.walkInCustomer;

  const renderOrderLines = () =>
    orderLines.length === 0 ? (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50">
          <ShoppingBag className="h-8 w-8 text-rose-300" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-gray-900">{t.emptyOrderTitle}</p>
        <p className="mt-1 text-sm text-gray-500">{t.emptyOrderHint}</p>
      </div>
    ) : (
      <ul className="divide-y divide-gray-100">
        {orderLines.map((line) => {
          const unit =
            line.discountedPrice !== undefined ? line.discountedPrice : line.unitPrice;
          const isDiscounted =
            line.discountedPrice !== undefined && line.discountedPrice < line.unitPrice;
          const colorName = colorNameForLine(line.stockId, line.selectedColor, line.colorCode);
          return (
            <li key={line.id} className="group flex gap-3 px-4 py-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                {line.image ? (
                  <Image
                    src={line.image}
                    alt={line.groupName}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-5 w-5 text-gray-300" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900" title={line.groupName}>
                    {line.groupName}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeFromCart(line.id)}
                    aria-label={`Remove ${line.groupName}`}
                    className="-mr-1 -mt-0.5 rounded-md p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                  {line.colorCode && (
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: line.colorCode }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">
                    {[colorName, line.selectedSize].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() => void updateQuantity(line.id, line.quantity - 1)}
                      aria-label={`Decrease quantity of ${line.groupName}`}
                      className="flex h-7 w-7 items-center justify-center rounded-l-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[28px] text-center text-sm font-semibold text-gray-900 tabular">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => void updateQuantity(line.id, line.quantity + 1)}
                      aria-label={`Increase quantity of ${line.groupName}`}
                      className="flex h-7 w-7 items-center justify-center rounded-r-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-right leading-tight">
                    <p className="text-sm font-bold text-gray-900 tabular">
                      {formatPrice(unit * line.quantity)}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular">
                      {isDiscounted && (
                        <span className="mr-1 line-through">{formatPrice(line.unitPrice)}</span>
                      )}
                      {formatPrice(unit)} × {line.quantity}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const activeFilterCount = [
    selectedStockStatus !== "all",
    priceRange.min !== "" || priceRange.max !== "",
  ].filter(Boolean).length;

  const isCatalogLoading = isLoading || shopsLoading;

  return (
    <div className="h-screen bg-canvas flex overflow-hidden">
      {/* Desktop Sidebar (hidden on small screens) */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="home"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="home"
          onItemClick={() => setIsMobileSidebarOpen(false)}
          isCollapsed={false}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        <div className="flex-1 flex min-h-0">
          {/* ============ Catalog ============ */}
          <main className="flex-1 min-w-0 overflow-y-auto">
            {/* Search, filters and categories stay in view while scrolling */}
            <div className="sticky top-0 z-20 bg-canvas/95 backdrop-blur px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200/70">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex items-baseline gap-2 md:mr-2 flex-shrink-0">
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                    {t.posTerminal}
                  </h1>
                  {!isCatalogLoading && (
                    <span className="text-sm text-gray-500 tabular">
                      {filteredInventory.length} {t.productsLabel}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 items-center gap-2">
                  <div className="relative flex-1">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      aria-label={t.searchProductsPlaceholder}
                      placeholder={t.searchProductsPlaceholder}
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-16 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setCurrentPage(1);
                          searchInputRef.current?.focus();
                        }}
                        aria-label={t.clear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-semibold text-gray-400 sm:block">
                        /
                      </kbd>
                    )}
                  </div>

                  {/* Filter Dropdown */}
                  <div className="relative filter-dropdown-container">
                    <button
                      type="button"
                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                      aria-haspopup="dialog"
                      aria-expanded={showFilterDropdown}
                      className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold shadow-sm transition-colors ${
                        activeFilterCount > 0 || showFilterDropdown
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Filter className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">{t.filter}</span>
                      {activeFilterCount > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    {showFilterDropdown && (
                      <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900">{t.filters}</h3>
                          {hasActiveFilters && (
                            <button
                              type="button"
                              onClick={clearFilters}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                            >
                              {t.clearAll}
                            </button>
                          )}
                        </div>

                        {/* Stock Status Filter */}
                        <div className="mb-4">
                          <label
                            htmlFor="pos-stock-status"
                            className="mb-1.5 block text-xs font-semibold text-gray-600"
                          >
                            {t.stockStatus}
                          </label>
                          <select
                            id="pos-stock-status"
                            value={selectedStockStatus}
                            onChange={(e) => {
                              setSelectedStockStatus(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                          >
                            <option value="all">{t.allStatus}</option>
                            <option value="in-stock">{t.inStock}</option>
                            <option value="low-stock">{t.lowStock} (≤10)</option>
                            <option value="out-of-stock">{t.outOfStock}</option>
                          </select>
                        </div>

                        {/* Price Range Filter */}
                        <div>
                          <p className="mb-1.5 block text-xs font-semibold text-gray-600">
                            {t.priceRange}
                          </p>
                          <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-rose-400 focus-within:ring-4 focus-within:ring-rose-100">
                            <input
                              type="number"
                              aria-label="Minimum price"
                              placeholder="Min"
                              value={priceRange.min}
                              onChange={(e) => {
                                setPriceRange({ ...priceRange, min: e.target.value });
                                setCurrentPage(1);
                              }}
                              className="h-10 w-1/2 min-w-0 px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                            />
                            <span className="h-4 w-px bg-gray-200" />
                            <input
                              type="number"
                              aria-label="Maximum price"
                              placeholder="Max"
                              value={priceRange.max}
                              onChange={(e) => {
                                setPriceRange({ ...priceRange, max: e.target.value });
                                setCurrentPage(1);
                              }}
                              className="h-10 w-1/2 min-w-0 px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Category chips */}
              <div
                role="group"
                aria-label={t.category}
                className="-mx-1 mt-3 flex items-center gap-2 overflow-x-auto scrollbar-none px-1 pb-0.5"
              >
                {[{ value: "all", label: t.allProducts }, ...categories.map((cat) => ({ value: cat, label: cat }))].map(
                  (chip) => {
                    const isActive =
                      chip.value === "all"
                        ? selectedCategory === "all"
                        : selectedCategory.toLowerCase() === chip.value.toLowerCase();
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setSelectedCategory(chip.value);
                          setCurrentPage(1);
                        }}
                        className={`h-9 flex-shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all ${
                          isActive
                            ? "bg-brand text-white shadow-brand"
                            : "border border-gray-200 bg-white text-gray-600 hover:border-rose-200 hover:text-rose-700"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Product grid */}
            <div className="px-4 sm:px-6 py-4 pb-28 xl:pb-6">
              <div
                ref={productGridRef}
                className="grid scroll-mt-4 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5"
              >
                {isCatalogLoading ? (
                  Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-2xl border border-gray-200 bg-white animate-pulse"
                    >
                      <div className="aspect-square bg-gray-100" />
                      <div className="space-y-2 p-3">
                        <div className="h-4 rounded bg-gray-100" />
                        <div className="h-4 w-1/2 rounded bg-gray-100" />
                      </div>
                    </div>
                  ))
                ) : error ? (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
                      <Package className="h-7 w-7 text-rose-400" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">{t.failedToLoadProducts}</h3>
                    <p className="mt-1 mb-5 text-sm text-gray-500">{error}</p>
                    <Button onClick={() => window.location.reload()}>{t.tryAgain}</Button>
                  </div>
                ) : currentPageItems.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
                      <Package className="h-7 w-7 text-rose-400" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">{t.noProductsFound}</h3>
                    <p className="mt-1 mb-5 text-sm text-gray-500">
                      {searchTerm || hasActiveFilters
                        ? t.tryDifferentSearchOrCategory
                        : t.noProductsInBranch}
                    </p>
                    {searchTerm || hasActiveFilters ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchTerm("");
                          clearFilters();
                        }}
                      >
                        {t.clearFilters}
                      </Button>
                    ) : (
                      <Link href="/owner/inventory/stocks/new-stock">
                        <Button>{t.addStock}</Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  currentPageItems.map((item) => {
                    const itemStock = availableStockOf(item, inCartByStock);
                    const isOutOfStock = itemStock === 0;
                    const isLowStock = !isOutOfStock && itemStock <= 10;
                    const swatches = item.colorVariants.slice(0, 5);
                    const extraSwatches = item.colorVariants.length - swatches.length;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openPicker(item)}
                        disabled={isOutOfStock}
                        aria-label={`${item.name}, ${formatPrice(item.price)}${
                          isOutOfStock ? `, ${t.outOfStock}` : `, ${itemStock} ${t.leftInStock}`
                        }`}
                        className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 ${
                          isOutOfStock
                            ? "cursor-not-allowed border-gray-200 opacity-70"
                            : "border-gray-200 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-100/70 active:translate-y-0"
                        }`}
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
                          <Image
                            src={
                              item.image ||
                              `https://via.placeholder.com/200x250/E5E7EB/6B7280?text=${item.name}`
                            }
                            alt={item.name}
                            width={320}
                            height={320}
                            className={`h-full w-full object-cover transition-transform duration-300 ${
                              isOutOfStock ? "grayscale" : "group-hover:scale-[1.04]"
                            }`}
                          />
                          {item.isNew && !isOutOfStock && (
                            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                              {t.stockHealthNew}
                            </span>
                          )}
                          {!isOutOfStock && (
                            <span
                              className={`pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur tabular ${
                                isLowStock
                                  ? "bg-amber-100/95 text-amber-800"
                                  : "bg-white/90 text-gray-700"
                              }`}
                            >
                              {itemStock} {t.leftInStock}
                            </span>
                          )}
                          {isOutOfStock && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                              <span className="rounded-full bg-gray-900/80 px-3 py-1 text-xs font-semibold text-white">
                                {t.outOfStock}
                              </span>
                            </div>
                          )}
                          {item.category && (
                            <span className="pointer-events-none absolute bottom-2 left-2 max-w-[80%] truncate rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur">
                              {item.category}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col p-3">
                          <p
                            className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-gray-900"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <div className="mt-2 flex items-center gap-1">
                            {swatches.map((variant) => (
                              <span
                                key={variant.id}
                                title={variant.color}
                                className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: variant.colorCode }}
                              />
                            ))}
                            {extraSwatches > 0 && (
                              <span className="text-[11px] font-medium text-gray-400">
                                +{extraSwatches}
                              </span>
                            )}
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                            <span className="text-base font-bold text-gray-900 tabular">
                              {formatPrice(item.price)}
                            </span>
                            <span
                              aria-hidden="true"
                              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                                isOutOfStock
                                  ? "bg-gray-100 text-gray-300"
                                  : "bg-rose-50 text-rose-600 group-hover:bg-brand group-hover:text-white"
                              }`}
                            >
                              <Plus className="h-4 w-4" />
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pagination: page size, range, page buttons (like Transactions) */}
              {!isCatalogLoading && !error && filteredInventory.length > 0 && (
                <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-gray-600 sm:justify-start">
                    <label className="flex items-center gap-2">
                      <span>{t.productsPerPage}</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      >
                        {[12, 24, 48, 96].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="tabular" aria-live="polite">
                      {t.showingProducts
                        .replace("{start}", String(pageStartIndex + 1))
                        .replace("{end}", String(pageEndIndex))
                        .replace("{total}", String(filteredInventory.length))}
                    </span>
                  </div>

                  <nav
                    aria-label={t.pagination}
                    className="flex flex-wrap items-center justify-center gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label={t.previous}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {/* Phones: just "3 / 25" between the arrows. */}
                    <span className="min-w-[64px] text-center text-sm font-semibold text-gray-700 tabular sm:hidden">
                      {currentPage} / {totalPages}
                    </span>
                    {/* Wider screens: 1 … 9 10 11 … 25 (never more than 7 slots). */}
                    <div className="hidden items-center gap-1.5 sm:flex">
                      {paginationItems(currentPage, totalPages).map((entry) =>
                        typeof entry === "number" ? (
                          <button
                            key={entry}
                            type="button"
                            onClick={() => goToPage(entry)}
                            aria-current={currentPage === entry ? "page" : undefined}
                            aria-label={`${t.page} ${entry}`}
                            className={`h-10 min-w-[40px] rounded-xl px-3 text-sm font-semibold tabular transition-all ${
                              currentPage === entry
                                ? "bg-brand text-white shadow-brand"
                                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {entry}
                          </button>
                        ) : (
                          <span
                            key={entry}
                            className="flex h-10 w-6 items-center justify-center text-sm text-gray-400"
                            aria-hidden="true"
                          >
                            …
                          </span>
                        ),
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label={t.next}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    {/* With many pages, jump straight to one. */}
                    {totalPages > 7 && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const target = Number.parseInt(pageJump, 10);
                          if (Number.isFinite(target)) goToPage(target);
                          setPageJump("");
                        }}
                        className="ml-2 flex items-center gap-1.5"
                      >
                        <label
                          htmlFor="pos-page-jump"
                          className="whitespace-nowrap text-sm text-gray-500"
                        >
                          {t.goToPage}
                        </label>
                        <input
                          id="pos-page-jump"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={totalPages}
                          value={pageJump}
                          onChange={(e) => setPageJump(e.target.value)}
                          placeholder={String(currentPage)}
                          aria-describedby="pos-page-jump-hint"
                          className="h-10 w-16 rounded-xl border border-gray-200 bg-white px-2 text-center text-sm font-semibold text-gray-900 tabular placeholder:text-gray-400 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                        />
                        <span id="pos-page-jump-hint" className="sr-only">
                          1–{totalPages}
                        </span>
                      </form>
                    )}
                  </nav>
                </div>
              )}
            </div>
          </main>

          {/* ============ Order ticket (desktop) ============ */}
          <aside
            aria-label={t.currentOrder}
            className="hidden xl:flex w-[360px] 2xl:w-[400px] flex-shrink-0 flex-col border-l border-gray-200/80 bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="leading-tight">
                  <h2 className="text-sm font-bold text-gray-900">{t.currentOrder}</h2>
                  <p className="text-xs text-gray-500 tabular">
                    {orderItemCount} {t.items}
                  </p>
                </div>
              </div>
              {orderLines.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearOrder}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    confirmClear
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "text-gray-500 hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {confirmClear ? `${t.clearCart}?` : t.clear}
                </button>
              )}
            </div>

            {/* Customer (chosen at checkout) */}
            <button
              type="button"
              onClick={() => openPosCart()}
              className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-rose-200 hover:bg-rose-50/40"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <UserRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {t.customer}
                </span>
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {orderCustomerName}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden="true" />
            </button>

            <div className="mt-2 flex-1 overflow-y-auto">{renderOrderLines()}</div>

            <div className="border-t border-gray-100 bg-gray-50/60 p-4">
              {cart.appliedCoupon && (
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Coupon</span>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                    {cart.appliedCoupon.code}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {t.subtotal} · <span className="tabular">{orderItemCount}</span> {t.items}
                </span>
                <span className="font-semibold text-gray-900 tabular">
                  {formatPrice(orderTotal)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-gray-400">{t.checkoutHint}</p>
              <button
                type="button"
                onClick={() => openPosCart()}
                disabled={orderLines.length === 0}
                className="mt-3 flex h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-white shadow-brand transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <span className="text-base font-bold">{t.charge}</span>
                <span className="text-lg font-bold tabular">{formatPrice(orderTotal)}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ============ Order bar (tablet & mobile) ============ */}
      {orderLines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 xl:hidden lg:left-64 pointer-events-none">
          <button
            type="button"
            onClick={() => openPosCart()}
            className="pointer-events-auto mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-brand px-4 text-white shadow-brand transition-all hover:bg-brand-strong active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-8 min-w-[32px] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-rose-600 tabular">
                {orderItemCount}
              </span>
              <span className="text-sm font-semibold">{t.viewOrder}</span>
            </span>
            <span className="flex items-center gap-1 text-base font-bold tabular">
              {formatPrice(orderTotal)}
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </button>
        </div>
      )}

      {/* ============ Variant picker ============ */}
      {pickerItem && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePicker();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-picker-title"
            className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl md:flex-row"
          >
            {(() => {
              const item = pickerItem;
              const selectedVariant = getSelectedColorVariant(item);
              const selectedSize = selectedSizes[item.id];
              const sizes = getAvailableSizes(item);
              const shopName = getShopName(item.shop);
              const canAdd = !!selectedVariant && !!selectedSize && pickerSizeStock > 0;
              // Lines of this product already in the order, so the cashier
              // can see what has been added while picking the next one.
              const productLines = cart.items.filter((line) => line.stockId === item.id);
              const productLinesQty = productLines.reduce(
                (total, line) => total + Math.max(0, line.quantity),
                0,
              );
              return (
                <>
                  {/* Image */}
                  <div className="relative hidden w-full flex-shrink-0 bg-gray-50 md:block md:w-[42%]">
                    <Image
                      src={getCurrentImage(item)}
                      alt={item.name}
                      width={480}
                      height={600}
                      className="h-full max-h-[92vh] w-full object-cover"
                    />
                    {item.isNew && (
                      <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                        {t.stockHealthNew}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-start gap-3 border-b border-gray-100 p-5">
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gray-50 md:hidden">
                        <Image
                          src={getCurrentImage(item)}
                          alt=""
                          width={56}
                          height={56}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 id="pos-picker-title" className="text-lg font-bold leading-6 text-gray-900">
                          {item.name}
                        </h2>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {[item.category, shopName].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 tabular">
                          {formatPrice(item.price)}
                        </p>
                      </div>
                      <button
                        ref={pickerCloseRef}
                        type="button"
                        onClick={closePicker}
                        aria-label={t.close}
                        className="-mr-1 -mt-1 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-5 overflow-y-auto p-5">
                      {/* Colors */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {t.color}
                          {selectedVariant && (
                            <span className="ml-2 normal-case tracking-normal text-gray-900">
                              {selectedVariant.color}
                            </span>
                          )}
                        </p>
                        {item.colorVariants.length === 0 ? (
                          <p className="text-sm text-gray-500">{t.noColorOptions}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {item.colorVariants.map((variant) => {
                              const isSelected = selectedColors[item.id] === variant.id;
                              const variantStock = availableForVariant(item, variant);
                              const isEmpty = variantStock === 0;
                              const inOrder = inOrderForVariant(item.id, variant.id);
                              return (
                                <button
                                  key={variant.id}
                                  type="button"
                                  onClick={() => handleColorSelect(item.id, variant.id)}
                                  disabled={isEmpty && !isSelected}
                                  aria-pressed={isSelected}
                                  aria-label={
                                    inOrder > 0
                                      ? `${variant.color}, ${inOrder} ${t.inThisOrder.toLowerCase()}`
                                      : undefined
                                  }
                                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                                    isSelected
                                      ? "border-rose-400 bg-rose-50 text-rose-700 ring-2 ring-rose-100"
                                      : isEmpty
                                        ? "cursor-not-allowed border-gray-100 text-gray-300"
                                        : "border-gray-200 text-gray-700 hover:border-rose-200 hover:bg-rose-50/40"
                                  }`}
                                >
                                  <span
                                    className="h-5 w-5 rounded-full ring-1 ring-black/10"
                                    style={{ backgroundColor: variant.colorCode }}
                                    aria-hidden="true"
                                  />
                                  <span className={isEmpty ? "line-through" : ""}>{variant.color}</span>
                                  {inOrder > 0 && (
                                    <span
                                      className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-900 px-1.5 text-[11px] font-bold text-white tabular"
                                      aria-hidden="true"
                                    >
                                      {inOrder}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Sizes */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {t.size}
                        </p>
                        {!selectedVariant ? (
                          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                            {t.selectColorToSeeSizes}
                          </p>
                        ) : sizes.length === 0 ? (
                          <p className="text-sm text-gray-500">{t.outOfStock}</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {sizes.map((sizeQty) => {
                              const isSelected = selectedSize === sizeQty.size;
                              const isEmpty = sizeQty.quantity === 0;
                              const sizeInOrder =
                                inCartByLine.get(
                                  cartLineKey(item.id, selectedVariant.id, sizeQty.size),
                                ) || 0;
                              return (
                                <button
                                  key={sizeQty.size}
                                  type="button"
                                  onClick={() => !isEmpty && handleSizeSelect(item.id, sizeQty.size)}
                                  disabled={isEmpty}
                                  aria-pressed={isSelected}
                                  className={`relative flex flex-col items-center justify-center rounded-xl border py-2.5 transition-all ${
                                    isEmpty
                                      ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                                      : isSelected
                                        ? "border-transparent bg-brand text-white shadow-brand"
                                        : "border-gray-200 bg-white text-gray-800 hover:border-rose-300"
                                  }`}
                                >
                                  <span className={`text-sm font-bold ${isEmpty ? "line-through" : ""}`}>
                                    {sizeQty.size}
                                  </span>
                                  <span
                                    className={`text-[11px] tabular ${
                                      isSelected ? "text-white/85" : isEmpty ? "" : "text-gray-500"
                                    }`}
                                  >
                                    {isEmpty ? t.outOfStock : `${sizeQty.quantity} ${t.leftInStock}`}
                                  </span>
                                  {sizeInOrder > 0 && (
                                    <span
                                      className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-900 px-1.5 text-[11px] font-bold text-white shadow-sm ring-2 ring-white tabular"
                                      title={`${sizeInOrder} ${t.inThisOrder.toLowerCase()}`}
                                    >
                                      {sizeInOrder}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {t.quantity}
                        </p>
                        <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white">
                          <button
                            type="button"
                            onClick={() => setPickerQuantity((q) => Math.max(1, q - 1))}
                            disabled={pickerQuantity <= 1}
                            aria-label="Decrease quantity"
                            className="flex h-11 w-11 items-center justify-center rounded-l-xl text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="min-w-[48px] text-center text-base font-bold text-gray-900 tabular" aria-live="polite">
                            {pickerQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPickerQuantity((q) => q + 1)}
                            disabled={!canAdd || pickerQuantity >= pickerSizeStock}
                            aria-label="Increase quantity"
                            className="flex h-11 w-11 items-center justify-center rounded-r-xl text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Already added (this product) */}
                      {productLines.length > 0 && (
                        <div>
                          <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <span>{t.inThisOrder}</span>
                            <span className="normal-case tracking-normal text-gray-900 tabular">
                              {productLinesQty}
                            </span>
                          </p>
                          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200" aria-live="polite">
                            {productLines.map((line) => {
                              const lineColor = colorNameForLine(
                                line.stockId,
                                line.selectedColor,
                                line.colorCode,
                              );
                              const lineLabel = [lineColor, line.selectedSize]
                                .filter(Boolean)
                                .join(" · ");
                              return (
                                <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                                  {line.colorCode && (
                                    <span
                                      className="h-4 w-4 flex-shrink-0 rounded-full ring-1 ring-black/10"
                                      style={{ backgroundColor: line.colorCode }}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                                    {lineLabel || item.name}
                                  </span>
                                  <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
                                    <button
                                      type="button"
                                      onClick={() => void updateQuantity(line.id, line.quantity - 1)}
                                      aria-label={
                                        line.quantity <= 1
                                          ? `${t.remove} ${lineLabel}`
                                          : `Decrease quantity of ${lineLabel}`
                                      }
                                      className="flex h-7 w-7 items-center justify-center rounded-l-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    >
                                      {line.quantity <= 1 ? (
                                        <X className="h-3.5 w-3.5" />
                                      ) : (
                                        <Minus className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <span className="min-w-[28px] text-center text-sm font-semibold text-gray-900 tabular">
                                      {line.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void updateQuantity(line.id, line.quantity + 1)}
                                      aria-label={`Increase quantity of ${lineLabel}`}
                                      className="flex h-7 w-7 items-center justify-center rounded-r-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 p-4 sm:p-5">
                      {productLines.length > 0 && (
                        <button
                          type="button"
                          onClick={closePicker}
                          className="h-14 flex-shrink-0 rounded-2xl border border-gray-200 bg-white px-5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          {t.done}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddFromPicker}
                        disabled={!canAdd || isAddingFromPicker}
                        className="flex h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl bg-brand px-5 text-white shadow-brand transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        <span className="truncate text-base font-bold">
                          {canAdd ? t.addToOrder : t.chooseColorAndSize}
                        </span>
                        <span className="flex-shrink-0 text-lg font-bold tabular">
                          {formatPrice(item.price * pickerQuantity)}
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OwnerHomePage() {
  return (
    <ProtectedRoute>
      <OwnerHomeContent />
    </ProtectedRoute>
  );
}
