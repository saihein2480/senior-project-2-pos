"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Button } from "@/components/ui/Button";
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
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
          currency
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

  // Filter groups based on search term and filters
  const filteredGroups = stockGroups.filter((group) => {
    // Search filter
    const matchesSearch =
      group.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.groupId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.variants.some(
        (variant) =>
          variant.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
          variant.sizes.some((size) =>
            size.size.toLowerCase().includes(searchTerm.toLowerCase())
          ) ||
          variant.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
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
    // Prepare CSV headers
    const headers = [
      "Group ID",
      "Group Name",
      "Shop",
      "Color",
      "Size",
      "Quantity",
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
          shopLookup.get(group.shop) || group.shop,
          variant.color,
          size.size,
          size.quantity,
          group.unitPrice || 0,
          variant.barcode || "",
          group.formattedReleaseDate || group.releaseDate || "",
        ])
      )
    );

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `inventory-stocks-${new Date().toISOString().split("T")[0]}.csv`
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
    console.log("Delete button clicked for group:", group);
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
        `/api/stocks/${deletingGroup.groupId}`
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
        prevGroups.filter((group) => group.groupId !== deletingGroup.groupId)
      );

      // Show success message
      setSuccessMessage(
        `Stock group "${deletingGroup.groupName}" has been deleted successfully.`
      );

      // Close modal
      setShowDeleteModal(false);
      setDeletingGroup(null);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      console.error("Error deleting stock:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete stock item"
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

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden md:block">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => setActiveItem(item.id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      <div className="md:hidden">
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

        {/* Page Title */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 lg:px-12 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            Inventory Stocks
          </h1>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-screen-2xl mx-auto">
            {/* Controls */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search by Group, Item ID, Barcode, Color..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 w-80 text-gray-900"
                  />
                </div>

                {/* Filter Dropdown */}
                <div className="relative filter-dropdown-container">
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                    {hasActiveFilters && (
                      <span className="ml-2 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
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
                    <div className="absolute z-50 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Filters
                        </h3>
                        {hasActiveFilters && (
                          <button
                            onClick={clearFilters}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Shop Filter */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Shop
                        </label>
                        <select
                          title="selectedShop"
                          value={selectedShop}
                          onChange={(e) => {
                            setSelectedShop(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Category
                        </label>
                        <select
                          title="selectedCategory"
                          value={selectedCategory}
                          onChange={(e) => {
                            setSelectedCategory(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Stock Status
                        </label>
                        <select
                          title="selectedStockStatus"
                          value={selectedStockStatus}
                          onChange={(e) => {
                            setSelectedStockStatus(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                          Price Range ({defaultCurrency})
                        </label>
                        <div className="flex items-center space-x-2">
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                          />
                          <span className="text-gray-500">-</span>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className="flex items-center"
                  onClick={exportToCSV}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  className="flex items-center"
                  onClick={() =>
                    router.push("/owner/inventory/stocks/new-stock")
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Stock
                </Button>
              </div>
            </div>

            {/* Stock Groups Display */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {isLoading ? (
                <div className="px-6 py-8 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">
                      Loading stocks...
                    </span>
                  </div>
                </div>
              ) : error ? (
                <div className="px-6 py-8 text-center">
                  <div className="text-red-600">
                    <p className="font-medium">Error loading stocks</p>
                    <p className="text-sm text-red-500 mt-1">{error}</p>
                  </div>
                </div>
              ) : currentGroups.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <div className="text-gray-500">
                    <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="font-medium">No stocks found</p>
                    <p className="text-sm mt-1">
                      {searchTerm
                        ? "Try adjusting your search criteria"
                        : "Start by adding your first stock item"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                        >
                          Product
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Shop
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Category
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Stock Info
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Unit Price
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Original Price
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="relative py-3.5 pl-3 pr-4 sm:pr-6"
                        >
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {currentGroups.map((group) => (
                        <Fragment key={group.groupId}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            {/* Product Column */}
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                              <div className="flex items-center space-x-3">
                                <div className="h-12 w-12 flex-shrink-0 relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                  <Image
                                    src={group.groupImage}
                                    alt={group.groupName}
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-gray-900 truncate">
                                    {group.groupName}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    ID: {group.groupId}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Shop Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              <div className="flex items-center">
                                <Store className="h-4 w-4 mr-1.5 text-gray-400" />
                                <span className="text-gray-900 font-medium">
                                  {shopLookup.get(group.shop) || group.shop}
                                </span>
                              </div>
                            </td>

                            {/* Category Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {group.category ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {group.category}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Stock Info Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="space-y-1">
                                <div className="flex items-center text-gray-900">
                                  <Package className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                                  <span className="font-semibold">
                                    {group.totalQuantity}
                                  </span>
                                  <span className="ml-1 text-gray-500">
                                    items
                                  </span>
                                </div>
                                <div className="flex items-center space-x-3 text-xs text-gray-500">
                                  <span className="flex items-center">
                                    <Palette className="h-3 w-3 mr-1" />
                                    {group.variants.length} colors
                                  </span>
                                  <span className="flex items-center">
                                    <Ruler className="h-3 w-3 mr-1" />
                                    {group.sizeSummary}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Unit Price Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="font-semibold text-gray-900">
                                {group.formattedPrice}
                              </div>
                            </td>

                            {/* Original Price Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="font-medium text-gray-600">
                                {defaultCurrency === "THB"
                                  ? `฿${group.originalPrice.toLocaleString()}`
                                  : `${group.originalPrice.toLocaleString()} Ks`}
                              </div>
                            </td>

                            {/* Date Column */}
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {group.formattedReleaseDate}
                            </td>

                            {/* Actions Column */}
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleEditGroup(group)}
                                  className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGroup(group)}
                                  className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    toggleGroupExpansion(group.groupId)
                                  }
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
                            <tr className="bg-gray-50">
                              <td colSpan={7} className="px-4 py-4 sm:px-6">
                                <div className="space-y-4">
                                  {/* Color Variants */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
                                      Color Variants
                                    </h4>
                                    <div className="space-y-3">
                                      {group.variants.map(
                                        (variant, variantIndex) => (
                                          <div
                                            key={variantIndex}
                                            className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm"
                                          >
                                            <div className="flex items-center space-x-3 mb-3">
                                              <div className="h-10 w-10 relative rounded-md overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
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
                                                className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"
                                                style={variant.colorStyle}
                                              ></div>
                                              <span className="font-medium text-gray-900 text-sm">
                                                {variant.color}
                                              </span>
                                              {variant.barcode && (
                                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                  {variant.barcode}
                                                </span>
                                              )}
                                            </div>

                                            {/* Size Grid */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                              {variant.sizes.map(
                                                (sizeInfo, sizeIndex) => (
                                                  <div
                                                    key={sizeIndex}
                                                    className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 rounded-md border border-gray-200"
                                                  >
                                                    <span className="text-xs font-medium text-gray-700">
                                                      {sizeInfo.size}
                                                    </span>
                                                    <span
                                                      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
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
                                                )
                                              )}
                                            </div>
                                          </div>
                                        )
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
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-700">Rows per page:</p>
                    <select
                      title="Select number of rows per page"
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <p className="text-sm text-gray-700">
                      Showing {startIndex + 1}–
                      {Math.min(endIndex, filteredGroups.length)} of{" "}
                      {filteredGroups.length} stock groups
                    </p>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        title="Go to previous page"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        title="Go to next page"
                        onClick={() =>
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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
    <ProtectedRoute>
      <InventoryStocksContent />
    </ProtectedRoute>
  );
}
