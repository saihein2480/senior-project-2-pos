"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Package, Filter, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { StockItem, WholesaleTier } from "@/types/stock";
import { StockService } from "@/services/stockService";
import { InventoryRealtimeService } from "@/services/inventoryRealtimeService";
import { CategoryService } from "@/services/categoryService";

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

function OwnerHomeContent() {
  const {} = useAuth();
  const { addToCart, setInventoryCallbacks } = useCart();
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
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

  const getAvailableSizes = (item: ClothingInventoryItem) => {
    const selectedVariant = getSelectedColorVariant(item);
    const sizes = selectedVariant?.sizeQuantities || [];
    console.log(`getAvailableSizes for item ${item.id}:`, {
      selectedColorId: selectedColors[item.id],
      selectedVariant,
      sizeQuantities: selectedVariant?.sizeQuantities,
      colorVariants: item.colorVariants,
      returningSizes: sizes,
      sizesLength: sizes.length,
    });
    return sizes;
  };

  const getStockForSize = (item: ClothingInventoryItem, size: string) => {
    const selectedVariant = getSelectedColorVariant(item);
    const sizeQty = selectedVariant?.sizeQuantities.find(
      (sq) => sq.size === size,
    );
    return sizeQty?.quantity || 0;
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

  // Helper function to get display stock (total or for selected color)
  const getDisplayStock = (item: ClothingInventoryItem) => {
    const selectedVariant = getSelectedColorVariant(item);
    if (!selectedVariant || !selectedVariant.sizeQuantities) {
      return item.stock;
    }
    // Calculate total stock for the selected color variant
    return selectedVariant.sizeQuantities.reduce(
      (total, sq) => total + (sq.quantity || 0),
      0,
    );
  };

  // Helper function to get shop name by shop ID
  const getShopName = (shopId: string) => {
    const shop = shops.find((s) => s.id === shopId);
    return shop?.name || "";
  };

  // Function to reduce inventory stock when item is added to cart
  const reduceInventoryStock = useCallback(
    async (
      itemId: string,
      colorId: string,
      size: string,
      quantity: number = 1,
    ) => {
      // Update local state immediately for UI responsiveness
      setClothingInventory((prevInventory) => {
        return prevInventory.map((item) => {
          if (item.id === itemId) {
            return {
              ...item,
              colorVariants:
                item.colorVariants?.map((variant) => {
                  if (variant.id === colorId) {
                    return {
                      ...variant,
                      sizeQuantities: variant.sizeQuantities.map((sizeQty) => {
                        if (sizeQty.size === size) {
                          return {
                            ...sizeQty,
                            quantity: Math.max(0, sizeQty.quantity - quantity),
                          };
                        }
                        return sizeQty;
                      }),
                    };
                  }
                  return variant;
                }) || [],
            };
          }
          return item;
        });
      });

      // Persist changes to database
      try {
        const item = clothingInventory.find((item) => item.id === itemId);
        if (item) {
          const updatedColorVariants =
            item.colorVariants?.map((variant) => {
              if (variant.id === colorId) {
                return {
                  ...variant,
                  sizeQuantities: variant.sizeQuantities.map((sizeQty) => {
                    if (sizeQty.size === size) {
                      return {
                        ...sizeQty,
                        quantity: Math.max(0, sizeQty.quantity - quantity),
                      };
                    }
                    return sizeQty;
                  }),
                };
              }
              return variant;
            }) || [];

          // Filter out undefined values to avoid Firebase errors
          const cleanedColorVariants = updatedColorVariants.map((variant) => {
            const cleaned: {
              id: string;
              color: string;
              colorCode: string;
              barcode: string;
              sizeQuantities: { size: string; quantity: number }[];
              image?: string;
            } = {
              id: variant.id,
              color: variant.color,
              colorCode: variant.colorCode,
              barcode: (variant as { barcode?: string }).barcode || "",
              sizeQuantities: variant.sizeQuantities,
            };
            // Only include image if it's defined
            const variantImage = (variant as { image?: string }).image;
            if (variantImage !== undefined) {
              cleaned.image = variantImage;
            }
            return cleaned;
          });

          await StockService.updateStock(itemId, {
            colorVariants: cleanedColorVariants,
          });
        }
      } catch (error) {
        console.error("Error updating stock in database:", error);
        // Optionally revert local state on error
        // For now, we'll keep the optimistic update
      }
    },
    [clothingInventory],
  );

  // Function to restore inventory stock when item is removed from cart
  const restoreInventoryStock = useCallback(
    async (
      itemId: string,
      colorId: string,
      size: string,
      quantity: number = 1,
    ) => {
      // Update local state immediately for UI responsiveness
      setClothingInventory((prevInventory) => {
        return prevInventory.map((item) => {
          if (item.id === itemId) {
            return {
              ...item,
              colorVariants:
                item.colorVariants?.map((variant) => {
                  if (variant.id === colorId) {
                    return {
                      ...variant,
                      sizeQuantities: variant.sizeQuantities.map((sizeQty) => {
                        if (sizeQty.size === size) {
                          return {
                            ...sizeQty,
                            quantity: sizeQty.quantity + quantity,
                          };
                        }
                        return sizeQty;
                      }),
                    };
                  }
                  return variant;
                }) || [],
            };
          }
          return item;
        });
      });

      // Persist changes to database
      try {
        const item = clothingInventory.find((item) => item.id === itemId);
        if (item) {
          const updatedColorVariants =
            item.colorVariants?.map((variant) => {
              if (variant.id === colorId) {
                return {
                  ...variant,
                  sizeQuantities: variant.sizeQuantities.map((sizeQty) => {
                    if (sizeQty.size === size) {
                      return {
                        ...sizeQty,
                        quantity: sizeQty.quantity + quantity,
                      };
                    }
                    return sizeQty;
                  }),
                };
              }
              return variant;
            }) || [];

          // Filter out undefined values to avoid Firebase errors
          const cleanedColorVariants = updatedColorVariants.map((variant) => {
            const cleaned: {
              id: string;
              color: string;
              colorCode: string;
              barcode: string;
              sizeQuantities: { size: string; quantity: number }[];
              image?: string;
            } = {
              id: variant.id,
              color: variant.color,
              colorCode: variant.colorCode,
              barcode: (variant as { barcode?: string }).barcode || "",
              sizeQuantities: variant.sizeQuantities,
            };
            // Only include image if it's defined
            const variantImage = (variant as { image?: string }).image;
            if (variantImage !== undefined) {
              cleaned.image = variantImage;
            }
            return cleaned;
          });

          await StockService.updateStock(itemId, {
            colorVariants: cleanedColorVariants,
          });
        }
      } catch (error) {
        console.error("Error updating stock in database:", error);
        // Optionally revert local state on error
        // For now, we'll keep the optimistic update
      }
    },
    [clothingInventory],
  );

  // Function to check available stock for a specific item, color, and size
  const checkInventoryStock = useCallback(
    (itemId: string, colorId: string, size: string): number => {
      const item = clothingInventory.find((item) => item.id === itemId);
      if (!item) return 0;

      const colorVariant = item.colorVariants?.find(
        (variant) => variant.id === colorId,
      );
      if (!colorVariant) return 0;

      const sizeQuantity = colorVariant.sizeQuantities.find(
        (sizeQty) => sizeQty.size === size,
      );
      return sizeQuantity?.quantity || 0;
    },
    [clothingInventory],
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
          fetch("/api/shops"),
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

    // Use one-time fetch instead of real-time subscription for better performance
    const fetchStocks = async () => {
      try {
        const { getDocs, collection, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        if (!db) {
          throw new Error('Firebase not initialized');
        }

        // Fetch the whole catalogue: the branch / category / stock filters below
        // all run client-side, so truncating this query would silently hide
        // products from the selected branch.
        const q = query(
          collection(db, 'stocks'),
          orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const stocks: any[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          stocks.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          });
        });

        const loadTime = Date.now() - startTime;
        console.log(`Loaded ${stocks.length} stocks from Firebase in ${loadTime}ms`);
        
        const transformedData = transformStockData(stocks);
        setClothingInventory(transformedData);
        
        // Cache the data
        try {
          sessionStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(transformedData));
        } catch (e) {
          console.warn('Failed to cache data:', e);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading stocks:', error);
        setError('Failed to load inventory');
        setIsLoading(false);
      }
    };

    fetchStocks();

    // No cleanup needed for one-time fetch
    return () => {};
  }, [transformStockData]);

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

  // Set up inventory callbacks for cart operations (run once)
  useEffect(() => {
    if (setInventoryCallbacks) {
      setInventoryCallbacks({
        reduceStock: (
          stockId: string,
          color: string,
          size: string,
          quantity: number,
        ) => {
          console.debug("inventory.reduceStock called", {
            stockId,
            color,
            size,
            quantity,
          });
          // Find the color variant either by id or by color name (case-insensitive)
          const item = clothingInventory.find((item) => item.id === stockId);
          if (!item) return;

          let colorVariant = item.colorVariants?.find(
            (variant) => variant.id === color,
          );

          if (!colorVariant) {
            colorVariant = item.colorVariants?.find(
              (variant) => variant.color.toLowerCase() === color.toLowerCase(),
            );
          }

          if (colorVariant) {
            console.debug("inventory.reduceStock found variant", {
              colorVariantId: colorVariant.id,
              colorVariantName: colorVariant.color,
            });
            reduceInventoryStock(stockId, colorVariant.id, size, quantity);
          } else {
            console.warn("Color variant not found:", {
              stockId,
              color,
              availableVariants: item?.colorVariants,
            });
          }
        },
        restoreStock: (
          stockId: string,
          color: string,
          size: string,
          quantity: number,
        ) => {
          console.debug("inventory.restoreStock called", {
            stockId,
            color,
            size,
            quantity,
          });
          // Find the color variant either by id or by color name (case-insensitive)
          const item = clothingInventory.find((item) => item.id === stockId);
          if (!item) return;

          let colorVariant = item.colorVariants?.find(
            (variant) => variant.id === color,
          );

          if (!colorVariant) {
            colorVariant = item.colorVariants?.find(
              (variant) => variant.color.toLowerCase() === color.toLowerCase(),
            );
          }

          if (colorVariant) {
            console.debug("inventory.restoreStock found variant", {
              colorVariantId: colorVariant.id,
              colorVariantName: colorVariant.color,
            });
            restoreInventoryStock(stockId, colorVariant.id, size, quantity);
          } else {
            console.warn("Color variant not found:", {
              stockId,
              color,
              availableVariants: item?.colorVariants,
            });
          }
        },
        checkStock: (stockId: string, color: string, size: string) => {
          console.debug("inventory.checkStock called", {
            stockId,
            color,
            size,
          });
          // Find the color variant either by id or by color name (case-insensitive)
          const item = clothingInventory.find((item) => item.id === stockId);
          if (!item) return 0;

          let colorVariant = item.colorVariants?.find(
            (variant) => variant.id === color,
          );

          if (!colorVariant) {
            colorVariant = item.colorVariants?.find(
              (variant) => variant.color.toLowerCase() === color.toLowerCase(),
            );
          }

          if (colorVariant) {
            const qty = checkInventoryStock(stockId, colorVariant.id, size);
            console.debug("inventory.checkStock found variant", {
              colorVariantId: colorVariant.id,
              colorVariantName: colorVariant.color,
              qty,
            });
            return qty;
          } else {
            console.warn("Color variant not found for stock check:", {
              stockId,
              color,
              availableVariants: item?.colorVariants,
            });
            return 0;
          }
        },
      });
    }
  }, [
    clothingInventory,
    checkInventoryStock,
    reduceInventoryStock,
    restoreInventoryStock,
    setInventoryCallbacks,
  ]); // Include all dependencies

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 60;

  // Tooltip state for showing full item name on hover/touch
  const [tooltipItem, setTooltipItem] = useState<string | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

  // Clear any tooltip timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        window.clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

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

      // Get current branch from settings and filter by it
      const currentBranch = businessSettings?.currentBranch || "Main Branch";

      // Find shop by name to get its ID, or match directly
      const currentShop = shops.find((s) => s.name === currentBranch);
      const currentShopId = currentShop?.id;

      // Match if item.shop equals currentBranch name OR currentShop ID
      const matchesShop =
        item.shop === currentBranch || // Match by name
        item.shop === currentShopId || // Match by ID
        (!item.shop && currentBranch === "Main Branch") ||
        (item.shop === "" && currentBranch === "Main Branch");

      // Category filter
      const matchesCategory =
        selectedCategory === "all" ||
        (item.category &&
          item.category.toLowerCase() === selectedCategory.toLowerCase());

      // Stock status filter
      // Treat "in-stock" as any positive stock (includes low-stock)
      const matchesStockStatus =
        selectedStockStatus === "all" ||
        (selectedStockStatus === "in-stock" && item.stock > 0) ||
        (selectedStockStatus === "low-stock" &&
          item.stock > 0 &&
          item.stock <= 10) ||
        (selectedStockStatus === "out-of-stock" && item.stock === 0);

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
      if (a.stock === 0 && b.stock > 0) return 1; // a is out of stock, move to end
      if (a.stock > 0 && b.stock === 0) return -1; // b is out of stock, move to end
      return 0; // maintain original order for items with same stock status
    });
  }, [
    displayInventory,
    searchTerm,
    businessSettings?.currentBranch,
    shops,
    selectedCategory,
    selectedStockStatus,
    priceRange.min,
    priceRange.max,
  ]);

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

  // Get current page items (memoized for performance)
  const currentPageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredInventory.slice(startIndex, endIndex);
  }, [filteredInventory, currentPage, itemsPerPage]);

  // Reset to first page when search changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  // Add to cart function
  const handleAddToCart = (item: ClothingInventoryItem) => {
    try {
      const selectedVariant = getSelectedColorVariant(item);
      const selectedSize = selectedSizes[item.id];

      // Validate that color and size are selected
      if (!selectedVariant) {
        toast.error("Please select a color");
        return;
      }

      if (!selectedSize) {
        toast.error("Please select a size");
        return;
      }

      // Check if selected size has stock
      const stockForSize = getStockForSize(item, selectedSize);
      if (stockForSize === 0) {
        toast.error("Selected size is out of stock");
        return;
      }

      addToCart({
        stockId: item.id,
        groupName: item.name,
        unitPrice: item.price,
        originalPrice: item.originalPrice,
        quantity: 1,
        selectedColor: selectedVariant.id,
        selectedSize: selectedSize,
        colorCode: selectedVariant.colorCode,
        image: item.image,
        shop: item.shop,
        wholesaleTiers: item.wholesaleTiers,
      });

      // Inventory reduction will be handled by CartContext through callbacks

      // Optional: Show success message
      console.log(
        `Added ${item.name} (${selectedVariant.color}, ${selectedSize}) to cart - Stock reduced`,
      );
    } catch (error) {
      console.error("Error adding item to cart:", error);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Clothing Inventory */}
          <div className="bg-white shadow-lg rounded-2xl border border-pink-100">
            <div className="px-4 py-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
                  <div className="flex items-center space-x-4">
                    <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                      Clothing Inventory
                    </h1>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by group name..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="pl-10 pr-4 py-2 w-60 xl:w-64 border rounded-xl border-gray-300 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 focus:bg-white transition-colors"
                      />
                      <svg
                        className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>

                    {/* Filter Dropdown */}
                    <div className="relative filter-dropdown-container">
                      <button
                        onClick={() =>
                          setShowFilterDropdown(!showFilterDropdown)
                        }
                        className="flex items-center px-3 py-1.5 xl:px-4 xl:py-2 border rounded-xl border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
                      >
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                        {hasActiveFilters && (
                          <span className="ml-2 px-1.5 py-0.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs rounded-full">
                            {
                              [
                                selectedCategory !== "all",
                                selectedStockStatus !== "all",
                                priceRange.min !== "" || priceRange.max !== "",
                              ].filter(Boolean).length
                            }
                          </span>
                        )}
                      </button>

                      {showFilterDropdown && (
                        <div className="absolute z-50 mt-2 w-72 xl:w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-900">
                              Filters
                            </h3>
                            {hasActiveFilters && (
                              <button
                                onClick={clearFilters}
                                className="text-xs text-cyan-600 hover:text-blue-800 font-medium"
                              >
                                Clear all
                              </button>
                            )}
                          </div>

                          {/* Category Filter */}
                          {/* <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Category
                            </label>
                            <select
                              title="Category"
                              value={selectedCategory}
                              onChange={(e) => {
                                setSelectedCategory(e.target.value);
                                setCurrentPage(1);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-pink-400 focus:border-pink-500 text-gray-900"
                            >
                              <option value="all">All Categories</option>
                              {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div> */}

                          {/* Stock Status Filter */}
                          <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Stock Status
                            </label>
                            <select
                              title="Stock Status"
                              value={selectedStockStatus}
                              onChange={(e) => {
                                setSelectedStockStatus(e.target.value);
                                setCurrentPage(1);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-pink-400 focus:border-pink-500 text-gray-900"
                            >
                              <option value="all">All Status</option>
                              <option value="in-stock">In Stock</option>
                              <option value="low-stock">Low Stock (≤10)</option>
                              <option value="out-of-stock">Out of Stock</option>
                            </select>
                          </div>

                          {/* Price Range Filter */}
                          <div className="mb-2">
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Price Range (THB)
                            </label>
                            <div className="flex items-center rounded-md border border-gray-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-pink-400 focus-within:border-pink-500">
                              <input
                                type="number"
                                placeholder="Min"
                                value={priceRange.min}
                                onChange={(e) => {
                                  setPriceRange({
                                    ...priceRange,
                                    min: e.target.value,
                                  });
                                  setCurrentPage(1);
                                }}
                                className="w-1/2 min-w-0 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                              />
                              <span className="h-4 w-px bg-gray-200" />
                              <input
                                type="number"
                                placeholder="Max"
                                value={priceRange.max}
                                onChange={(e) => {
                                  setPriceRange({
                                    ...priceRange,
                                    max: e.target.value,
                                  });
                                  setCurrentPage(1);
                                }}
                                className="w-1/2 min-w-0 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 inline-flex max-w-full">
                    <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory("all");
                          setCurrentPage(1);
                        }}
                        className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                          selectedCategory === "all"
                            ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        All Products
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat);
                            setCurrentPage(1);
                          }}
                          className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                            selectedCategory.toLowerCase() === cat.toLowerCase()
                              ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Clothing Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 items-start">
                  {isLoading || shopsLoading ? (
                    // Loading state
                    Array.from({ length: 12 }).map((_, index) => (
                      <div
                        key={index}
                        className="bg-white border-2 border-pink-100 rounded-2xl overflow-hidden animate-pulse shadow-sm"
                      >
                        <div className="aspect-[4/5] bg-gray-200"></div>
                        <div className="p-3">
                          <div className="h-4 bg-gray-200 rounded mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded mb-2 w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))
                  ) : error ? (
                    // Error state
                    <div className="col-span-full flex flex-col items-center justify-center py-12">
                      <Package className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Failed to load recent stocks
                      </h3>
                      <p className="text-gray-500 mb-4">{error}</p>
                      <Button
                        onClick={() => window.location.reload()}
                        className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : currentPageItems.length === 0 ? (
                    // No items state
                    <div className="col-span-full flex flex-col items-center justify-center py-12">
                      <Package className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No items found
                      </h3>
                      <p className="text-gray-500 mb-4">
                        {searchTerm
                          ? "Try adjusting your search terms"
                          : "No recent stock additions found"}
                      </p>
                      <Link href="/owner/inventory/stocks/new-stock">
                        <Button className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white">
                          Add New Stock
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    currentPageItems.map((item) => {
                      const itemStock = getDisplayStock(
                        item as ClothingInventoryItem,
                      );
                      const isOutOfStock = itemStock === 0;

                      return (
                        <div
                          key={`${item.id}-${selectedColors[item.id] || "no-color"}`}
                          className={`bg-white border-2 border-pink-100 overflow-hidden shadow-md hover:shadow-xl hover:border-rose-300 transition-all duration-200 ${
                            isOutOfStock
                              ? "border-red-200 opacity-80"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex flex-col h-full">
                            <div className="relative bg-gradient-to-br from-pink-50 to-rose-50 overflow-hidden aspect-[4/5] flex items-center justify-center">
                              {item.isNew && !isOutOfStock && (
                                <span className="absolute top-2 left-2 bg-gradient-to-r from-rose-400 to-pink-400 text-white text-xs px-2 py-1 rounded-md z-10 pointer-events-none">
                                  New
                                </span>
                              )}
                              {isOutOfStock && (
                                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                                  <span className="text-sm font-semibold text-white px-4 py-2 rounded-md bg-black/40">
                                    OUT OF STOCK
                                  </span>
                                </div>
                              )}
                              <Image
                                key={`${item.id}-image-${selectedColors[item.id] || "default"}`}
                                src={getCurrentImage(
                                  item as ClothingInventoryItem,
                                )}
                                alt={item.name}
                                width={380}
                                height={270}
                                className={`w-full h-full object-cover ${
                                  isOutOfStock ? "opacity-60" : ""
                                }`}
                              />
                              {(item.category ||
                                (item.shop && getShopName(item.shop))) && (
                                <div className="absolute bottom-2 right-2 flex flex-col items-end space-y-1 z-10">
                                  {item.category && (
                                    <span className="bg-white/70 backdrop-blur text-xs text-gray-900 px-2 py-0.5 rounded-md shadow whitespace-nowrap">
                                      {item.category}
                                    </span>
                                  )}
                                  {item.shop && getShopName(item.shop) && (
                                    <span className="bg-white/70 backdrop-blur text-xs text-gray-900 px-2 py-0.5 rounded-md shadow whitespace-nowrap">
                                      {getShopName(item.shop)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Content area with dynamic height */}
                            <div className="flex-1 flex flex-col p-4 bg-white"><div className="relative">
                                <div className="flex items-start justify-between gap-2">
                                  <h4
                                    className="font-semibold text-gray-900 text-sm leading-snug truncate"
                                    title={item.name}
                                    onMouseEnter={() => setTooltipItem(item.id)}
                                    onMouseLeave={() => setTooltipItem(null)}
                                    onTouchStart={() => {
                                      setTooltipItem(item.id);
                                      if (tooltipTimeoutRef.current) {
                                        window.clearTimeout(
                                          tooltipTimeoutRef.current,
                                        );
                                      }
                                      tooltipTimeoutRef.current =
                                        window.setTimeout(() => {
                                          setTooltipItem(null);
                                          tooltipTimeoutRef.current = null;
                                        }, 2500);
                                    }}
                                  >
                                    {item.name}
                                  </h4>

                                  <div className="shrink-0 text-xs text-gray-600 whitespace-nowrap">
                                    Stock:{" "}
                                    <span
                                      className={`font-medium ${
                                        isOutOfStock
                                          ? "text-red-600"
                                          : itemStock <= 10
                                            ? "text-orange-600"
                                            : "text-green-600"
                                      }`}
                                    >
                                      {itemStock}
                                    </span>
                                  </div>
                                </div>

                                {tooltipItem === item.id && (
                                  <div className="absolute left-0 bottom-full mb-1 z-50">
                                    <div className="inline-block max-w-xs bg-gray-900 text-white text-xs px-2 py-1 rounded shadow">
                                      {item.name}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Color Selection */}
                              <div className="mt-2">
                                <label className="text-xs font-medium text-gray-700 mb-1 block">
                                  Colors
                                </label>
                                {(() => {
                                  const variants = item.colorVariants || [];
                                  if (variants.length === 0) {
                                    return (
                                      <span className="text-xs text-gray-500">
                                        No color variants available
                                      </span>
                                    );
                                  }

                                  const maxSingleRow = 7;
                                  if (variants.length <= maxSingleRow) {
                                    return (
                                      <div className="flex items-center gap-2">
                                        {variants.map((variant, index) => {
                                          const variantId =
                                            variant.id || `variant-${index}`;
                                          const isSelected =
                                            selectedColors[item.id] === variantId;
                                          return (
                                            <button
                                              key={`${item.id}-${variantId}`}
                                              onClick={() =>
                                                handleColorSelect(
                                                  item.id,
                                                  variantId,
                                                )
                                              }
                                              className={`relative w-6 h-6 rounded-full border-2 transition-all ${
                                                isSelected
                                                  ? "ring-2 ring-offset-2 ring-rose-500 scale-110"
                                                  : "border-gray-300 hover:ring-2 hover:ring-offset-1 hover:ring-pink-400 hover:scale-105"
                                              }`}
                                              style={{
                                                backgroundColor:
                                                  variant.colorCode,
                                              }}
                                              title={
                                                isSelected
                                                  ? `${variant.color} (click to unselect)`
                                                  : variant.color
                                              }
                                            />
                                          );
                                        })}
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7 gap-2">
                                      {variants.map((variant, index) => {
                                        const variantId =
                                          variant.id || `variant-${index}`;
                                        const isSelected =
                                          selectedColors[item.id] === variantId;
                                        return (
                                          <button
                                            key={`${item.id}-${variantId}`}
                                            onClick={() =>
                                              handleColorSelect(
                                                item.id,
                                                variantId,
                                              )
                                            }
                                            className={`relative w-6 h-6 rounded-full border-2 transition-all ${
                                              isSelected
                                                ? "ring-2 ring-offset-2 ring-rose-500 scale-110"
                                                : "border-gray-300 hover:ring-2 hover:ring-offset-1 hover:ring-pink-400 hover:scale-105"
                                            }`}
                                            style={{
                                              backgroundColor: variant.colorCode,
                                            }}
                                            title={
                                              isSelected
                                                ? `${variant.color} (click to unselect)`
                                                : variant.color
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Size Selection - Only shows when color is selected */}
                              {selectedColors[item.id] && (
                                <div
                                  className="mt-2"
                                  key={`sizes-${item.id}-${
                                    selectedColors[item.id] || "no-color"
                                  }`}
                                >
                                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                                    Size
                                  </label>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {(() => {
                                      const availableSizes = item.colorVariants
                                        ? getAvailableSizes(
                                            item as ClothingInventoryItem,
                                          )
                                        : [];
                                      return availableSizes.length > 0 ? (
                                        availableSizes.map((sizeQty) => {
                                          const isSelected =
                                            selectedSizes[item.id] ===
                                            sizeQty.size;
                                          const isOutOfStock =
                                            sizeQty.quantity === 0;
                                          return (
                                            <button
                                              key={`${item.id}-${sizeQty.size}`}
                                              onClick={() =>
                                                !isOutOfStock &&
                                                handleSizeSelect(
                                                  item.id,
                                                  sizeQty.size,
                                                )
                                              }
                                              disabled={isOutOfStock}
                                              className={`relative text-sm font-bold px-2 py-2.5 rounded-lg border-2 transition-all ${
                                                isOutOfStock
                                                  ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed line-through"
                                                  : isSelected
                                                    ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white border-rose-500 shadow-md"
                                                    : "bg-white text-gray-700 border-gray-300 hover:border-rose-400 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-50"
                                              }`}
                                              title={`${sizeQty.size} - ${sizeQty.quantity} in stock`}
                                            >
                                              {sizeQty.size}
                                              {!isOutOfStock && (
                                                <span 
                                                  className={`absolute -top-2 -right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 min-w-[20px] text-center ${
                                                    isSelected
                                                      ? "bg-white text-rose-600 border-rose-300 shadow-sm"
                                                      : "bg-gradient-to-r from-rose-500 to-pink-500 text-white border-rose-400"
                                                  }`}
                                                >
                                                  {sizeQty.quantity}
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <span className="text-xs text-gray-500 col-span-3">
                                          No sizes available
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}

                              {/* Price and Add to Cart */}
                              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-lg font-semibold text-gray-900 leading-none">
                                    {formatPrice(item.price)}
                                  </div>
                                </div>

                                <button
                                  onClick={() =>
                                    handleAddToCart(item as ClothingInventoryItem)
                                  }
                                  disabled={
                                    isOutOfStock ||
                                    !selectedColors[item.id] ||
                                    !selectedSizes[item.id]
                                  }
                                  aria-label={
                                    isOutOfStock ? "Out of stock" : "Add to cart"
                                  }
                                  className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors ${
                                    isOutOfStock
                                      ? "bg-red-100 text-red-400 cursor-not-allowed border border-red-200"
                                      : selectedColors[item.id] &&
                                          selectedSizes[item.id]
                                        ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                  }`}
                                >
                                  <Plus className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination (moved to bottom) */}
                <div className="mt-8 flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-white rounded-2xl shadow-md border-2 border-pink-100 p-2">
                    <button
                      title="First page"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      First
                    </button>

                    <button
                      title="Previous page"
                      onClick={() =>
                        setCurrentPage((p) => Math.max(p - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>

                    <div className="flex items-center gap-1 px-2">
                      {(() => {
                        const maxButtons = 5;
                        let start = Math.max(
                          1,
                          currentPage - Math.floor(maxButtons / 2),
                        );
                        const end = Math.min(
                          totalPages,
                          start + maxButtons - 1,
                        );
                        if (end - start + 1 < maxButtons) {
                          start = Math.max(1, end - maxButtons + 1);
                        }
                        const pages: number[] = [];
                        for (let p = start; p <= end; p++) pages.push(p);

                        return (
                          <>
                            {start > 1 && (
                              <>
                                <button
                                  onClick={() => setCurrentPage(1)}
                                  className="min-w-[36px] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                                >
                                  1
                                </button>
                                <span className="px-2 text-gray-400 text-sm">...</span>
                              </>
                            )}

                            {pages.map((pageNumber) => (
                              <button
                                key={pageNumber}
                                onClick={() => setCurrentPage(pageNumber)}
                                className={`min-w-[36px] px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                                  currentPage === pageNumber
                                    ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md hover:from-rose-600 hover:to-pink-600"
                                    : "text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                {pageNumber}
                              </button>
                            ))}

                            {end < totalPages && (
                              <>
                                <span className="px-2 text-gray-400 text-sm">...</span>
                                <button
                                  onClick={() => setCurrentPage(totalPages)}
                                  className="min-w-[36px] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                                >
                                  {totalPages}
                                </button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <button
                      title="Next page"
                      onClick={() =>
                        setCurrentPage((prev) =>
                          Math.min(prev + 1, totalPages),
                        )
                      }
                      disabled={currentPage === totalPages}
                      className="p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>

                    <button
                      title="Last page"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      Last
                    </button>

                    <div className="hidden md:flex items-center pl-3 ml-3 border-l border-gray-200">
                      <span className="text-sm text-gray-600 font-medium">
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </main>
      </div>
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









