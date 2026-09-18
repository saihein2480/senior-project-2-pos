"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { transactionService, Transaction } from "@/services/transactionService";
import { ShopService } from "@/services/shopService";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  Store,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Package,
  BarChart3,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Shop {
  id: string;
  name: string;
  address?: string;
}

interface ShopReport {
  shopId: string;
  shopName: string;
  totalRevenue: number;
  totalProfit: number;
  totalTransactions: number;
  totalItems: number;
  averageOrderValue: number;
  completedTransactions: number;
  cancelledTransactions: number;
  refundedTransactions: number;
}

function ShopReportsContent() {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopReports, setShopReports] = useState<ShopReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<
    "7d" | "30d" | "90d" | "1y" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [expandedShops, setExpandedShops] = useState<Set<string>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, startDate, endDate]);

  // Initialize date filters
  useEffect(() => {
    if (!startDate || !endDate) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30); // Default to last 30 days

      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, endDate]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load shops
      const shopsData = await ShopService.getAllShops();
      setShops(shopsData);

      // Load transactions
      const transactions = await transactionService.getTransactions();

      // Filter transactions based on date range
      let filteredTransactions = transactions;
      if (dateRange !== "all") {
        let rangeStartDate: Date;
        let rangeEndDate: Date = new Date();

        if (dateRange === "custom" && startDate && endDate) {
          rangeStartDate = new Date(startDate);
          rangeEndDate = new Date(endDate);
          rangeEndDate.setHours(23, 59, 59, 999);
        } else {
          const now = new Date();
          const daysBack =
            dateRange === "7d"
              ? 7
              : dateRange === "30d"
              ? 30
              : dateRange === "90d"
              ? 90
              : 365;
          rangeStartDate = new Date(
            now.getTime() - daysBack * 24 * 60 * 60 * 1000
          );
        }

        filteredTransactions = transactions.filter(
          (t) =>
            new Date(t.timestamp) >= rangeStartDate &&
            new Date(t.timestamp) <= rangeEndDate
        );
      }

      // Calculate reports for each shop
      const reports = shopsData.map((shop) => {
        const shopTransactions = filteredTransactions.filter(
          (t) => t.branchName === shop.name
        );
        return calculateShopReport(shop, shopTransactions);
      });

      setShopReports(reports);
    } catch (error) {
      console.error("Error loading shop reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateShopReport = (
    shop: Shop,
    transactions: Transaction[]
  ): ShopReport => {
    const completedTransactions = transactions.filter(
      (t) => t.status === "completed"
    );
    const cancelledTransactions = transactions.filter(
      (t) => t.status === "cancelled"
    );
    const refundedTransactions = transactions.filter(
      (t) => t.status === "refunded" || t.status === "partially_refunded"
    );

    // Filter for revenue-generating transactions (same as Transaction page)
    const revenueTransactions = transactions.filter(
      (t) =>
        t.status === "completed" ||
        t.status === "partially_refunded" ||
        t.status === "refunded"
    );

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalItems = 0;

    // Calculate net revenue and profit (same logic as Transaction page)
    revenueTransactions.forEach((transaction) => {
      // Add original transaction total
      const originalAmount = transaction.total;
      const refundedAmount =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0
        ) || 0;
      // Add net revenue (original minus refunded)
      totalRevenue += Math.max(0, originalAmount - refundedAmount);

      // Calculate profit for all items
      const transactionProfit = transaction.items.reduce((itemTotal, item) => {
        const profitPerItem =
          ((item.unitPrice || 0) - (item.originalPrice || 0)) * item.quantity;
        totalItems += item.quantity;
        return itemTotal + profitPerItem;
      }, 0);

      // Subtract refunded profit
      const refundedProfit =
        transaction.refunds?.reduce((refundTotal, refund) => {
          return (
            refundTotal +
            refund.items.reduce((refundItemTotal, refundItem) => {
              const originalItem = transaction.items[refundItem.itemIndex];
              if (originalItem) {
                const refundedProfitPerItem =
                  ((originalItem.unitPrice || 0) -
                    (originalItem.originalPrice || 0)) *
                  refundItem.quantity;
                // Subtract refunded items from total items count
                totalItems -= refundItem.quantity;
                return refundItemTotal + refundedProfitPerItem;
              }
              return refundItemTotal;
            }, 0)
          );
        }, 0) || 0;

      totalProfit += Math.max(0, transactionProfit - refundedProfit);
    });

    const averageOrderValue =
      completedTransactions.length > 0
        ? totalRevenue / completedTransactions.length
        : 0;

    return {
      shopId: shop.id,
      shopName: shop.name,
      totalRevenue,
      totalProfit,
      totalTransactions: transactions.length,
      totalItems,
      averageOrderValue,
      completedTransactions: completedTransactions.length,
      cancelledTransactions: cancelledTransactions.length,
      refundedTransactions: refundedTransactions.length,
    };
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleShopExpansion = (shopId: string) => {
    setExpandedShops((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shopId)) {
        newSet.delete(shopId);
      } else {
        newSet.add(shopId);
      }
      return newSet;
    });
  };

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case "7d":
        return "Last 7 Days";
      case "30d":
        return "Last 30 Days";
      case "90d":
        return "Last 90 Days";
      case "1y":
        return "Last Year";
      case "all":
        return "All Time";
    }
  };

  // Calculate totals across all shops
  const totalRevenue = shopReports.reduce(
    (sum, report) => sum + report.totalRevenue,
    0
  );
  const totalProfit = shopReports.reduce(
    (sum, report) => sum + report.totalProfit,
    0
  );
  const totalTransactions = shopReports.reduce(
    (sum, report) => sum + report.totalTransactions,
    0
  );
  const totalItems = shopReports.reduce(
    (sum, report) => sum + report.totalItems,
    0
  );

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            activeItem="shop-reports"
            onItemClick={() => {}}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isCartModalOpen={isCartModalOpen}
          />
        </div>

        {/* Mobile Sidebar (overlay) */}
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          activeItem="shop-reports"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
          className="lg:hidden"
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopNavBar
            onCartModalStateChange={setIsCartModalOpen}
            onMenuToggle={() => setIsMobileSidebarOpen(true)}
          />

          <main className="flex-1 overflow-y-auto flex items-center justify-center px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center max-w-screen-2xl mx-auto">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading shop reports...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Pagination calculations
  const totalPages = Math.ceil(shopReports.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentReports = shopReports.slice(startIndex, endIndex);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="shop-reports"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        activeItem="shop-reports"
        onItemClick={() => {}}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isCartModalOpen={isCartModalOpen}
        className="lg:hidden"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                    Shop Reports
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Performance comparison across all branches
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
              <select
                title="dateRange"
                value={dateRange}
                onChange={(e) => {
                  const range = e.target.value as
                    | "7d"
                    | "30d"
                    | "90d"
                    | "1y"
                    | "all"
                    | "custom";
                  setDateRange(range);
                  setCurrentPage(1);

                  if (range !== "custom") {
                    const end = new Date();
                    const start = new Date();

                    switch (range) {
                      case "7d":
                        start.setDate(start.getDate() - 7);
                        break;
                      case "30d":
                        start.setDate(start.getDate() - 30);
                        break;
                      case "90d":
                        start.setDate(start.getDate() - 90);
                        break;
                      case "1y":
                        start.setDate(start.getDate() - 365);
                        break;
                    }

                    if (range !== "all") {
                      setStartDate(start.toISOString().split("T")[0]);
                      setEndDate(end.toISOString().split("T")[0]);
                    }
                  }
                }}
                className="px-5 py-3 border border-gray-300 text-gray-700 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white rounded-2xl transition-all font-medium w-full sm:w-auto"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="1y">Last Year</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>

              {/* Custom Date Range Inputs */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDateRange("custom");
                    setCurrentPage(1);
                  }}
                  className="px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white text-gray-700 text-sm rounded-2xl transition-all font-medium flex-1 sm:flex-none"
                  max={endDate}
                  aria-label="Start Date"
                />
                <span className="text-gray-400 text-lg font-light hidden sm:inline">−</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDateRange("custom");
                    setCurrentPage(1);
                  }}
                  className="px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white text-gray-700 text-sm rounded-2xl transition-all font-medium flex-1 sm:flex-none"
                  min={startDate}
                  max={new Date().toISOString().split("T")[0]}
                  aria-label="End Date"
                />
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Total Sale
                  </h3>
                  <div className="p-2.5 bg-green-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatPrice(totalRevenue)}
                </p>
                <p className="text-xs text-gray-500 mt-2 font-medium">
                  {getDateRangeLabel()}
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Total Profit
                  </h3>
                  <div className="p-2.5 bg-blue-100 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatPrice(totalProfit)}
                </p>
                <p className="text-xs text-gray-500 mt-2 font-medium">
                  {getDateRangeLabel()}
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Total Transactions
                  </h3>
                  <div className="p-2.5 bg-purple-100 rounded-lg">
                    <ShoppingBag className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {totalTransactions}
                </p>
                <p className="text-xs text-gray-500 mt-2 font-medium">
                  {getDateRangeLabel()}
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Total Items Sold
                  </h3>
                  <div className="p-2.5 bg-orange-100 rounded-lg">
                    <Package className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalItems}</p>
                <p className="text-xs text-gray-500 mt-2 font-medium">
                  {getDateRangeLabel()}
                </p>
              </div>
            </div>

            {/* Shop Reports Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    Performance by Branch
                  </h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Shop Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Total Sale
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Total Profit
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Transactions
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Items Sold
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Avg Order
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {currentReports.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-16 text-center"
                        >
                          <Store className="h-14 w-14 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 font-medium">No shop data available</p>
                        </td>
                      </tr>
                    ) : (
                      currentReports.map((report) => (
                        <React.Fragment key={report.shopId}>
                          <tr className="hover:bg-pink-50/30 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-pink-100 rounded-lg">
                                  <Store className="h-4 w-4 text-pink-600" />
                                </div>
                                <span className="text-sm font-semibold text-gray-900">
                                  {report.shopName}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-bold text-green-600">
                                {formatPrice(report.totalRevenue)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-bold text-blue-600">
                                {formatPrice(report.totalProfit)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-medium text-gray-900">
                                {report.totalTransactions}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-medium text-gray-900">
                                {report.totalItems}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-medium text-gray-900">
                                {formatPrice(report.averageOrderValue)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={() =>
                                  toggleShopExpansion(report.shopId)
                                }
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-100 text-pink-600 hover:bg-pink-200 text-xs font-bold uppercase tracking-wide transition-colors"
                              >
                                {expandedShops.has(report.shopId) ? (
                                  <>
                                    <ChevronUp className="h-4 w-4" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-4 w-4" />
                                    View
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>

                          {expandedShops.has(report.shopId) && (
                            <tr>
                              <td colSpan={7} className="px-6 py-6 bg-gradient-to-r from-pink-50 to-pink-100">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="h-1 w-1 bg-green-600 rounded-full"></div>
                                      <div className="text-xs text-gray-600 font-bold uppercase tracking-wide">
                                        Completed Orders
                                      </div>
                                    </div>
                                    <div className="text-2xl font-bold text-green-600">
                                      {report.completedTransactions}
                                    </div>
                                  </div>
                                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="h-1 w-1 bg-red-600 rounded-full"></div>
                                      <div className="text-xs text-gray-600 font-bold uppercase tracking-wide">
                                        Cancelled Orders
                                      </div>
                                    </div>
                                    <div className="text-2xl font-bold text-red-600">
                                      {report.cancelledTransactions}
                                    </div>
                                  </div>
                                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="h-1 w-1 bg-orange-600 rounded-full"></div>
                                      <div className="text-xs text-gray-600 font-bold uppercase tracking-wide">
                                        Refunded Orders
                                      </div>
                                    </div>
                                    <div className="text-2xl font-bold text-orange-600">
                                      {report.refundedTransactions}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {shopReports.length > 0 && (
                <div className="bg-white px-6 py-5 flex items-center justify-between border-t border-gray-100 flex-wrap gap-4">
                  <div className="flex-1 flex justify-between sm:hidden w-full">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-all"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-all"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between w-full">
                    <div className="flex items-center space-x-3">
                      <p className="text-sm font-medium text-gray-700">Rows per page:</p>
                      <select
                        title="Select number of rows per page"
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <p className="text-sm font-medium text-gray-700">
                        Showing {startIndex + 1}–
                        {Math.min(endIndex, shopReports.length)} of{" "}
                        {shopReports.length} shops
                      </p>
                    </div>
                    <div>
                      <nav
                        className="relative z-0 inline-flex rounded-xl shadow-sm -space-x-px"
                        aria-label="Pagination"
                      >
                        <button
                          title="Go to previous page"
                          onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                          }
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-xl border border-gray-300 bg-white text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          title="Go to next page"
                          onClick={() =>
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1)
                            )
                          }
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-xl border border-gray-300 bg-white text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ShopReportsPage() {
  return (
    <ProtectedRoute requiredRole="owner">
      <ShopReportsContent />
    </ProtectedRoute>
  );
}

