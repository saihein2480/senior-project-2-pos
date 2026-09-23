"use client";

import { toast } from "react-hot-toast";
import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/contexts/SettingsContext";
import Image from "next/image";
import {
  Search,
  Filter,
  Download,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  Palette,
  Ruler,
  Store,
  AlertTriangle,
  X,
} from "lucide-react";
import { StockItem, StockGroupDisplay } from "@/types/stock";
import { Shop } from "@/types/shop";
import { StockDisplayService } from "@/services/stockDisplayService";
import { SettingsService } from "@/services/settingsService";
import { CategoryService } from "@/services/categoryService";
import { WholesalePricingTiers } from "@/components/ui/WholesalePricingTiers";

function InventoryStocksContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const { businessSettings } = useSettings();
  const [activeItem, setActiveItem] = useState("stocks");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // API state
  const [stockGroups, setStockGroups] = useState<StockGroupDisplay[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopLookup, setShopLookup] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<StockGroupDisplay | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Multi-select state
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]);
  const [isProcessingBulkDelete, setIsProcessingBulkDelete] = useState(false);

  // Success/Error feedback state
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Currency state
  const [defaultCurrency, setDefaultCurrency] = useState<"THB" | "MMK">("THB");

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filter state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedShop, setSelectedShop] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>("all");
  const [priceRange, setPriceRange] = useState<{ min: string; max: string }>({
    min: "",
    max: "",
  });

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

  // Fetch stocks from API
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch stocks, shops, and currency settings
        const [stocksResponse, shopsResponse, settings] = await Promise.all([
          fetch("/api/stocks"),
          fetch("/api/shops"),
          SettingsService.getBusinessSettings(),
        ]);

        if (!stocksResponse.ok) {
          throw new Error("Failed to fetch stocks");
        }

        if (!shopsResponse.ok) {
          throw new Error("Failed to fetch shops");
        }

        const [stocksData, shopsData] = await Promise.all([
          stocksResponse.json(),
          shopsResponse.json(),
        ]);

        if (!stocksData.success || !stocksData.data) {
          throw new Error(stocksData.error || "Invalid response format");
        }

        if (!shopsData.success || !shopsData.data) {
          throw new Error(shopsData.error || "Failed to fetch shops");
        }

        // Set shops data and create lookup map
        setShops(shopsData.data);
        const lookup = new Map<string, string>();
        shopsData.data.forEach((shop: Shop) => {
          lookup.set(shop.id, shop.name);
        });
        setShopLookup(lookup);

        // Set currency from settings
        const currency = (settings?.defaultCurrency as "THB" | "MMK") || "THB";
        setDefaultCurrency(currency);

        // Transform API data using the display service with currency
        const transformedGroups = StockDisplayService.transformStocksForDisplay(
          stocksData.data,
          currency,
        );
        setStockGroups(transformedGroups);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch stocks");
        console.error("Error fetching stocks:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStocks();
  }, []);

  // Set shop filter to current branch from settings
  useEffect(() => {
    if (businessSettings?.currentBranch && shops.length > 0) {
      // Find the shop that matches the current branch name
      const currentShop = shops.find((s) => s.name === businessSettings.currentBranch);
      if (currentShop) {
        setSelectedShop(currentShop.id);
      } else if (businessSettings.currentBranch !== "No Branch") {
        // If branch name doesn't match a shop ID, try setting it directly (might be the shop ID)
        setSelectedShop(businessSettings.currentBranch);
      }
    }
  }, [businessSettings?.currentBranch, shops]);

  // Reload stocks when branch changes
  useEffect(() => {
    if (businessSettings?.currentBranch) {
      const fetchStocks = async () => {
        try {
          setIsLoading(true);
          setError(null);

          const [stocksResponse, settings] = await Promise.all([
            fetch("/api/stocks"),
            SettingsService.getBusinessSettings(),
          ]);

          if (!stocksResponse.ok) {
            throw new Error("Failed to fetch stocks");
          }

          const stocksData = await stocksResponse.json();

          if (!stocksData.success || !stocksData.data) {
            throw new Error(stocksData.error || "Invalid response format");
          }

          // Set currency from settings
          const currency = (settings?.defaultCurrency as "THB" | "MMK") || "THB";
          setDefaultCurrency(currency);

          // Transform API data using the display service with currency
          const transformedGroups = StockDisplayService.transformStocksForDisplay(
            stocksData.data,
            currency,
          );
          setStockGroups(transformedGroups);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to fetch stocks");
          console.error("Error fetching stocks:", err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchStocks();
    }
  }, [businessSettings?.currentBranch]);

  // Filter groups based on search term and filters
  const filteredGroups = stockGroups.filter((group) => {
    // Search filter
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch =
      group.groupName.toLowerCase().includes(normalizedSearch) ||
      group.variants.some((variant) =>
        variant.barcode?.toLowerCase().includes(normalizedSearch),
      );

    // Shop filter
    const matchesShop = selectedShop === "all" || group.shop === selectedShop;

    // Category filter
    const matchesCategory =
      selectedCategory === "all" ||
      (group.category &&
        group.category.toLowerCase() === selectedCategory.toLowerCase());

    // Stock status filter
    let matchesStockStatus = true;
    if (selectedStockStatus === "in-stock") {
      matchesStockStatus = group.totalQuantity > 0;
    } else if (selectedStockStatus === "low-stock") {
      matchesStockStatus = group.totalQuantity > 0 && group.totalQuantity <= 10;
    } else if (selectedStockStatus === "out-of-stock") {
      matchesStockStatus = group.totalQuantity === 0;
    }

    // Price range filter
    let matchesPriceRange = true;
    if (priceRange.min !== "" || priceRange.max !== "") {
      const price = group.unitPrice
        ? parseFloat(group.unitPrice.toString())
        : 0;
      const minPrice = priceRange.min !== "" ? parseFloat(priceRange.min) : 0;
      const maxPrice =
        priceRange.max !== "" ? parseFloat(priceRange.max) : Infinity;
      matchesPriceRange = price >= minPrice && price <= maxPrice;
    }

    return (
      matchesSearch &&
      matchesShop &&
      matchesCategory &&
      matchesStockStatus &&
      matchesPriceRange
    );
  });

  const totalPages = Math.ceil(filteredGroups.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentGroups = filteredGroups.slice(startIndex, endIndex);

  // Toggle group expansion
  const toggleGroupExpansion = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedShop("all");
    setSelectedCategory("all");
    setSelectedStockStatus("all");
    setPriceRange({ min: "", max: "" });
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters =
    selectedShop !== "all" ||
    selectedCategory !== "all" ||
    selectedStockStatus !== "all" ||
    priceRange.min !== "" ||
    priceRange.max !== "";

  // Export to CSV
  const exportToCSV = () => {
    // Doc: "Export Data" - Owner + Manager only.
    if (!permissions.canExportStockData) {
      toast.error("You do not have permission to export stock data.");
      return;
    }

    // Prepare CSV headers
    const headers = [
      "Group ID",
      "Group Name",
      "Category",
      "Shop",
      "Color",
      "Size",
      "Quantity",
      "Original Price",
      "Price",
      "Barcode",
      "Date Added",
    ];

    // Prepare CSV rows
    const rows = filteredGroups.flatMap((group) =>
      group.variants.flatMap((variant) =>
        variant.sizes.map((size) => [
          group.groupId,
          group.groupName,
          group.category || "",
          shopLookup.get(group.shop) || group.shop,
          variant.color,
          size.size,
          size.quantity,
          group.originalPrice || 0,
          group.unitPrice || 0,
          variant.barcode || "",
          group.formattedReleaseDate || group.releaseDate || "",
        ]),
      ),
    );

    const formatCsvCell = (cell: string | number, columnIndex: number) => {
      const value = cell.toString().replace(/"/g, '""');

      // Keep barcode values as exact text in spreadsheet apps (no scientific notation/truncation)
      if (columnIndex === 9) {
        return `"=""${value}"""`;
      }

      return `"${value}"`;
    };

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell, columnIndex) => formatCsvCell(cell, columnIndex))
          .join(","),
      ),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `inventory-stocks-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle edit navigation
  const handleEditGroup = (group: StockGroupDisplay) => {
    // Navigate to edit page with the group ID
    router.push(`/owner/inventory/stocks/edit/${group.groupId}`);
  };

  // Handle delete confirmation
  const handleDeleteGroup = (group: StockGroupDisplay) => {
    // Doc: "Delete Products" - Owner only.
    if (!permissions.canDeleteProducts) {
      toast.error("Only the owner can delete products.");
      return;
    }

    setDeletingGroup(group);
    setShowDeleteModal(true);
    setDeleteError(null);
  };

  // Confirm delete operation
  const confirmDelete = async () => {
    console.log("Confirm delete clicked for group:", deletingGroup);
    if (!deletingGroup) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      console.log(
        "Making DELETE request to:",
        `/api/stocks/${deletingGroup.groupId}`,
      );
      const response = await fetch(`/api/stocks/${deletingGroup.groupId}`, {
        method: "DELETE",
      });

      const result = await response.json();
      console.log("DELETE response:", response.status, result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete stock item");
      }

      // Remove the deleted group from the state
      setStockGroups((prevGroups) =>
        prevGroups.filter((group) => group.groupId !== deletingGroup.groupId),
      );

      // Show success message
      setSuccessMessage(
        `Stock group "${deletingGroup.groupName}" has been deleted successfully.`,
      );

      // Close modal
      setShowDeleteModal(false);
      setDeletingGroup(null);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      console.error("Error deleting stock:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete stock item",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel delete operation
  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeletingGroup(null);
    setDeleteError(null);
  };

  // Toggle select single stock
  const toggleSelectStock = (stockId: string) => {
    setSelectedStocks((prev) =>
      prev.includes(stockId)
        ? prev.filter((id) => id !== stockId)
        : [...prev, stockId],
    );
  };

  // Toggle select all stocks
  const toggleSelectAll = () => {
    if (selectedStocks.length === currentGroups.length) {
      setSelectedStocks([]);
    } else {
      setSelectedStocks(currentGroups.map((group) => group.groupId));
    }
  };

  // Bulk delete selected stocks
  const handleBulkDelete = async () => {
    if (selectedStocks.length === 0) return;

    // Doc: "Delete Products" - Owner only.
    if (!permissions.canDeleteProducts) {
      toast.error("Only the owner can delete products.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${selectedStocks.length} stock item(s)?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setIsProcessingBulkDelete(true);
    let successCount = 0;
    let failCount = 0;

    for (const stockId of selectedStocks) {
      try {
        const response = await fetch(`/api/stocks/${stockId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    // Remove deleted stocks from state
    if (successCount > 0) {
      setStockGroups((prevGroups) =>
        prevGroups.filter((group) => !selectedStocks.includes(group.groupId)),
      );
      setSelectedStocks([]);
      setSuccessMessage(
        `Successfully deleted ${successCount} stock item(s).${
          failCount > 0 ? ` Failed to delete ${failCount} item(s).` : ""
        }`,
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      toast.error("Failed to delete any stock items. Please try again.");
    }

    setIsProcessingBulkDelete(false);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => setActiveItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => {
            setActiveItem(item.id);
            setIsMobileSidebarOpen(false);
          }}
          isCollapsed={false}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-screen-2xl mx-auto">
            {/* Page Title */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Inventory Stocks
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage and track all your product inventory
              </p>
            </div>
            {/* Category Tabs */}
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {/* All Categories Tab */}
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-sm whitespace-nowrap transition-all border-0 ${
                    selectedCategory === "all"
                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md hover:from-rose-600 hover:to-pink-600"
                      : "bg-gray-100 text-gray-700 hover:bg-pink-50"
                  }`}
                >
                  All Categories
                </button>

                {/* Individual Category Tabs */}
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setCurrentPage(1);
                    }}
                    className={`px-4 py-2.5 rounded-lg font-semibold text-sm whitespace-nowrap transition-all border-0 ${
                      selectedCategory === category
                        ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md hover:from-rose-600 hover:to-pink-600"
                        : "bg-gray-100 text-gray-700 hover:bg-pink-50"
                    }`}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 sm:max-w-md">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search by Group Name or Barcode..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-pink-400 focus:border-transparent shadow-sm"
                    />
                  </div>

                  {/* Filter Dropdown */}
                  <div className="relative filter-dropdown-container">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 whitespace-nowrap"
                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                    >
                      <Filter className="h-4 w-4" />
                      Filter
                      {hasActiveFilters && (
                        <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">
                          {
                            [
                              selectedShop !== "all",
                              selectedCategory !== "all",
                              selectedStockStatus !== "all",
                              priceRange.min !== "" || priceRange.max !== "",
                            ].filter(Boolean).length
                          }
                        </span>
                      )}
                    </Button>

                    {showFilterDropdown && (
                      <div className="absolute z-50 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-5 right-0">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Filters
                          </h3>
                          {hasActiveFilters && (
                            <button
                              onClick={clearFilters}
                              className="text-xs text-cyan-600 hover:text-blue-800 font-semibold hover:bg-cyan-50 px-2 py-1 rounded-lg transition-colors"
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        {/* Shop Filter */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-gray-700 mb-2.5">
                            Shop
                          </label>
                          <select
                            title="selectedShop"
                            value={selectedShop}
                            onChange={(e) => {
                              setSelectedShop(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-transparent bg-white text-gray-900 transition-all"
                          >
                            <option value="all">All Shops</option>
                            {shops.map((shop) => (
                              <option key={shop.id} value={shop.id}>
                                {shop.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Category Filter */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-gray-700 mb-2.5">
                            Category
                          </label>
                          <select
                            title="selectedCategory"
                            value={selectedCategory}
                            onChange={(e) => {
                              setSelectedCategory(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-transparent bg-white text-gray-900 transition-all"
                          >
                            <option value="all">All Categories</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Stock Status Filter */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-gray-700 mb-2.5">
                            Stock Status
                          </label>
                          <select
                            title="selectedStockStatus"
                            value={selectedStockStatus}
                            onChange={(e) => {
                              setSelectedStockStatus(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-transparent bg-white text-gray-900 transition-all"
                          >
                            <option value="all">All Status</option>
                            <option value="in-stock">In Stock</option>
                            <option value="low-stock">Low Stock (≤10)</option>
                            <option value="out-of-stock">Out of Stock</option>
                          </select>
                        </div>

                        {/* Price Range Filter */}
                        <div className="mb-1">
                          <label className="block text-xs font-semibold text-gray-700 mb-2.5">
                            Price Range ({defaultCurrency})
                          </label>
                          <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden transition-all focus-within:ring-2 focus-within:ring-pink-400 focus-within:border-transparent">
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
                              className="w-1/2 min-w-0 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
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
                              className="w-1/2 min-w-0 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Doc: "Export Data" - Owner + Manager only. */}
                  {permissions.canExportStockData && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 whitespace-nowrap"
                      onClick={exportToCSV}
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  )}
                  {/* Doc: "Add New Products" - Owner + Manager only. */}
                  {permissions.canAddProducts && (
                    <Button
                      className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md border-0"
                      onClick={() =>
                        router.push("/owner/inventory/stocks/new-stock")
                      }
                    >
                      <Plus className="h-4 w-4" />
                      New Stock
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedStocks.length > 0 && (
              <div className="mb-4 bg-gradient-to-r from-pink-50 to-pink-100 border border-pink-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-pink-200 rounded-lg flex items-center justify-center">
                    <Package className="h-5 w-5 text-pink-700" />
                  </div>
                  <span className="text-sm font-semibold text-pink-900">
                    {selectedStocks.length} stock item(s) selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Doc: "Delete Products" - Owner only. */}
                  {permissions.canDeleteProducts && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={isProcessingBulkDelete}
                      className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isProcessingBulkDelete ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Delete Selected
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedStocks([])}
                    className="px-4 py-2.5 bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm font-semibold rounded-lg shadow-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Stock Groups Display */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {isLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600"></div>
                    <span className="text-gray-600 font-medium">
                      Loading stocks...
                    </span>
                  </div>
                </div>
              ) : error ? (
                <div className="px-6 py-12 text-center">
                  <div className="inline-flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-900">
                        Error loading stocks
                      </p>
                      <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              ) : currentGroups.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="inline-flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                      <Package className="h-7 w-7 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        No stocks found
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {searchTerm
                          ? "Try adjusting your search criteria"
                          : "Start by adding your first stock item"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100">
                      <tr>
                        {/* Selection exists only to drive bulk delete, which the
                            doc restricts to Owner. */}
                        {permissions.canDeleteProducts && (
                          <th scope="col" className="py-4 pl-4 pr-3 w-12 sm:pl-6">
                            <input
                              type="checkbox"
                              checked={
                                currentGroups.length > 0 &&
                                selectedStocks.length === currentGroups.length
                              }
                              onChange={toggleSelectAll}
                              className="h-4 w-4 text-cyan-600 focus:ring-cyan-400 border-gray-300 rounded cursor-pointer"
                              aria-label="Select all stocks"
                            />
                          </th>
                        )}
                        <th
                          scope="col"
                          className="py-4 pl-4 pr-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide sm:pl-6"
                        >
                          Product
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Shop
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Category
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Stock Info
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Unit Price
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Original Price
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="relative py-4 pl-3 pr-4 sm:pr-6"
                        >
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {currentGroups.map((group) => (
                        <Fragment key={group.groupId}>
                          <tr className="hover:bg-pink-50/50 transition-colors duration-150">
                            {/* Checkbox Column - Owner only, see header. */}
                            {permissions.canDeleteProducts && (
                              <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                                <input
                                  type="checkbox"
                                  checked={selectedStocks.includes(group.groupId)}
                                  onChange={() =>
                                    toggleSelectStock(group.groupId)
                                  }
                                  className="h-4 w-4 text-cyan-600 focus:ring-cyan-400 border-gray-300 rounded cursor-pointer"
                                  aria-label={`Select ${group.groupName}`}
                                />
                              </td>
                            )}
                            {/* Product Column */}
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 flex-shrink-0 relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                                  <Image
                                    src={group.groupImage}
                                    alt={group.groupName}
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-gray-900 truncate text-sm">
                                    {group.groupName}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    ID: {group.groupId}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Shop Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="flex items-center gap-2 text-gray-900 font-medium">
                                <Store className="h-4 w-4 text-gray-400" />
                                {shopLookup.get(group.shop) || group.shop}
                              </div>
                            </td>

                            {/* Category Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              {group.category ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-pink-100 text-pink-800">
                                  {group.category}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>

                            {/* Stock Info Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                                  <Package className="h-3.5 w-3.5 text-gray-400" />
                                  <span>{group.totalQuantity}</span>
                                  <span className="text-gray-500 font-normal">
                                    items
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                  <Palette className="h-3 w-3 text-gray-400" />
                                  <span>{group.variants.length} colors</span>
                                  <span className="text-gray-400">•</span>
                                  <Ruler className="h-3 w-3 text-gray-400" />
                                  <span>{group.sizeSummary}</span>
                                </div>
                              </div>
                            </td>

                            {/* Unit Price Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="font-bold text-gray-900">
                                {group.formattedPrice}
                              </div>
                            </td>

                            {/* Original Price Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="font-semibold text-gray-600">
                                {defaultCurrency === "THB"
                                  ? `฿${group.originalPrice.toLocaleString()}`
                                  : `${group.originalPrice.toLocaleString()} Ks`}
                              </div>
                            </td>

                            {/* Date Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600">
                              {group.formattedReleaseDate}
                            </td>

                            {/* Actions Column */}
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <div className="flex items-center justify-end gap-1">
                                {/* Doc: "Edit Product Details" - Owner + Manager. */}
                                {permissions.canEditProducts && (
                                  <button
                                    onClick={() => handleEditGroup(group)}
                                    className="p-2 text-cyan-600 hover:text-blue-900 hover:bg-cyan-50 rounded-lg transition-colors"
                                    title="Edit"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                )}
                                {/* Doc: "Delete Products" - Owner only. */}
                                {permissions.canDeleteProducts && (
                                  <button
                                    onClick={() => handleDeleteGroup(group)}
                                    className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    toggleGroupExpansion(group.groupId)
                                  }
                                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                  title={
                                    expandedGroups.has(group.groupId)
                                      ? "Collapse"
                                      : "Expand"
                                  }
                                >
                                  {expandedGroups.has(group.groupId) ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Variants Row */}
                          {expandedGroups.has(group.groupId) && (
                            <tr className="bg-gradient-to-b from-pink-50/30 to-transparent">
                              {/* One fewer column when the selection checkbox
                                  is hidden for non-owners. */}
                              <td
                                colSpan={permissions.canDeleteProducts ? 9 : 8}
                                className="px-4 py-6 sm:px-6"
                              >
                                <div className="space-y-4">
                                  {/* Color Variants */}
                                  <div>
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                      <Palette className="h-4 w-4" />
                                      Color Variants
                                    </h4>
                                    <div className="grid grid-cols-4 gap-4">
                                      {group.variants.map(
                                        (variant, variantIndex) => (
                                          <div
                                            key={variantIndex}
                                            className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                                          >
                                            <div className="flex items-center gap-3 mb-4">
                                              <div className="h-10 w-10 relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0 shadow-sm">
                                                <Image
                                                  src={
                                                    variant.image ||
                                                    group.groupImage
                                                  }
                                                  alt={`${group.groupName} - ${variant.color}`}
                                                  fill
                                                  className="object-cover"
                                                  sizes="40px"
                                                />
                                              </div>
                                              <div
                                                className="w-6 h-6 rounded-full border-3 border-gray-300 flex-shrink-0 shadow-sm"
                                                style={variant.colorStyle}
                                              ></div>
                                              <div className="flex-1">
                                                <span className="font-semibold text-gray-900 text-sm block">
                                                  {variant.color}
                                                </span>
                                                {variant.barcode && (
                                                  <span className="text-xs text-gray-600 font-mono">
                                                    {variant.barcode}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Size Grid */}
                                            <div className="grid grid-cols-4 gap-2">
                                              {variant.sizes.map(
                                                (sizeInfo, sizeIndex) => (
                                                  <div
                                                    key={sizeIndex}
                                                    className="flex flex-col items-center justify-center px-2 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-cyan-50 transition-all"
                                                  >
                                                    <span className="text-xs font-semibold text-gray-700 mb-1">
                                                      {sizeInfo.size}
                                                    </span>
                                                    <span
                                                      className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                                                        sizeInfo.quantity > 10
                                                          ? "bg-green-100 text-green-700"
                                                          : sizeInfo.quantity >
                                                              0
                                                            ? "bg-yellow-100 text-yellow-700"
                                                            : "bg-red-100 text-red-700"
                                                      }`}
                                                    >
                                                      {sizeInfo.quantity}
                                                    </span>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </div>

                                  {/* Wholesale Pricing */}
                                  <WholesalePricingTiers
                                    wholesaleTiers={group.wholesaleTiers}
                                    title="Wholesale Pricing Tiers"
                                    defaultExpanded={false}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div className="bg-white px-4 py-4 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700">
                      Rows per page:
                    </p>
                    <select
                      title="Select number of rows per page"
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 hover:border-gray-400 focus:ring-2 focus:ring-cyan-400 transition-all"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <p className="text-sm font-medium text-gray-700">
                      Showing {startIndex + 1}–
                      {Math.min(endIndex, filteredGroups.length)} of{" "}
                      {filteredGroups.length} stock groups
                    </p>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px border border-gray-300"
                      aria-label="Pagination"
                    >
                      <button
                        title="Go to previous page"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-lg border-r border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        title="Go to next page"
                        onClick={() =>
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-lg bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg max-w-md">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                {successMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <button
                title="Close success message"
                onClick={() => setSuccessMessage(null)}
                className="text-green-400 hover:text-green-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingGroup && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div
              className="fixed inset-0 z-0 backdrop-blur-md transition-all duration-300"
              onClick={cancelDelete}
            ></div>

            {/* Modal panel */}
            <div className="relative z-10 inline-block align-bottom bg-white bg-opacity-95 backdrop-blur-md rounded-xl text-left overflow-hidden shadow-2xl transform transition-all duration-300 sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-white border-opacity-20">
              <div className="bg-white bg-opacity-90 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Delete Stock Group
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to delete the stock group &quot;
                        {deletingGroup.groupName}&quot;? This action cannot be
                        undone and will remove all {deletingGroup.totalQuantity}{" "}
                        items across {deletingGroup.variants.length} color
                        variants.
                      </p>
                    </div>
                    {deleteError && (
                      <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
                        {deleteError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 bg-opacity-80 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={cancelDelete}
                  disabled={isDeleting}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryStocksPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <InventoryStocksContent />
    </ProtectedRoute>
  );
}
