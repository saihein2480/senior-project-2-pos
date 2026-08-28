"use client";

import { toast } from "react-hot-toast";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { transactionService, Transaction } from "@/services/transactionService";
import { ShopService } from "@/services/shopService";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  CreditCard,
  Smartphone,
  Wallet,
  DollarSign,
  TrendingUp,
  Search,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Truck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface PaymentStats {
  totalAmount: number;
  totalProfit: number;
  totalCount: number;
  successfulPayments: number;
  cancelledPayments: number;
  refundPayments: number;
  partialRefundPayments: number;
  cashPayments: { count: number; amount: number };
  scanPayments: { count: number; amount: number };
  walletPayments: { count: number; amount: number };
  codPayments: { count: number; amount: number };
}

function PaymentsPageContent() {
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [filterMethod, setFilterMethod] = useState<
    "all" | "cash" | "scan" | "cod"
  >("all");
  const [filterStatus, setFilterStatus] = useState<
    | "all"
    | "completed"
    | "pending"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
  >("all");
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await transactionService.getTransactions();

      // Filter by date range
      let filteredData = data;

      if (dateRange === "custom") {
        // Use custom date range
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          filteredData = data.filter((t) => {
            const transactionDate = new Date(t.timestamp);
            return transactionDate >= start && transactionDate <= end;
          });
        }
      } else if (dateRange !== "all") {
        const now = new Date();
        let startDateCalc: Date;

        switch (dateRange) {
          case "today":
            startDateCalc = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            );
            break;
          case "7d":
            startDateCalc = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            startDateCalc = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "90d":
            startDateCalc = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDateCalc = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        filteredData = data.filter(
          (t) => new Date(t.timestamp) >= startDateCalc,
        );
      }

      // Filter by branch
      if (filterBranch && filterBranch !== "all") {
        filteredData = filteredData.filter(
          (t) => t.branchName === filterBranch,
        );
      }

      setTransactions(filteredData);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, filterBranch, startDate, endDate]);

  // Load shops and set initial branch filter
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const shopsData = await ShopService.getAllShops();
        setShops(shopsData || []);
      } catch (error) {
        console.error("Error fetching shops:", error);
      }
    };
    fetchShops();
  }, []);

  useEffect(() => {
    if (businessSettings?.currentBranch && filterBranch === "") {
      setFilterBranch(businessSettings.currentBranch);
    }
  }, [businessSettings, filterBranch]);

  // Initialize date filters
  useEffect(() => {
    if (!startDate || !endDate) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);

      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No data to export");
      return;
    }

    // Define CSV headers
    const headers = [
      "Transaction ID",
      "Date & Time",
      "Customer Name",
      "Items",
      "Total",
      "Profit",
      "Tax",
      "Branch",
      "Selling Currency",
      "Payment Method",
      "Status",
    ];

    // Convert transactions to CSV rows
    const rows = filteredTransactions.map((transaction) => {
      const refundedAmount =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0,
        ) || 0;
      const netTotal = Math.max(0, transaction.total - refundedAmount);

      const transactionProfit = transaction.items.reduce((itemTotal, item) => {
        const profitPerItem =
          (item.unitPrice - item.originalPrice) * item.quantity;
        return itemTotal + profitPerItem;
      }, 0);

      const refundedProfit =
        transaction.refunds?.reduce((refundTotal, refund) => {
          return refund.items.reduce((refundItemTotal, refundItem) => {
            const originalItem = transaction.items.find(
              (item) => item.id === refundItem.itemId,
            );
            if (originalItem) {
              const refundedProfitPerItem =
                (originalItem.unitPrice - originalItem.originalPrice) *
                refundItem.quantity;
              return refundItemTotal + refundedProfitPerItem;
            }
            return refundItemTotal;
          }, 0);
        }, 0) || 0;

      const netProfit = Math.max(0, transactionProfit - refundedProfit);
      const statusMap: { [key: string]: string } = {
        completed: "Completed",
        pending: "Pending",
        cancelled: "Cancelled",
        refunded: "Refunded",
        partially_refunded: "Partially Refunded",
      };

      return [
        transaction.transactionId || "",
        formatDate(transaction.timestamp),
        transaction.customer?.displayName || "Walk-in Customer",
        transaction.items.length.toString(),
        formatPrice(netTotal),
        formatPrice(netProfit),
        formatPrice(transaction.tax || 0),
        transaction.branchName || "N/A",
        transaction.sellingCurrency || "THB",
        transaction.paymentMethod?.toUpperCase() || "N/A",
        statusMap[transaction.status] || transaction.status,
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    // Prepend UTF-8 BOM so Excel on Windows detects UTF-8 correctly
    const bom = "\uFEFF";

    // Create download link
    const blob = new Blob([bom + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `payments_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculatePaymentStats = (): PaymentStats => {
    const stats: PaymentStats = {
      totalAmount: 0,
      totalProfit: 0,
      totalCount: transactions.length,
      successfulPayments: 0,
      cancelledPayments: 0,
      refundPayments: 0,
      partialRefundPayments: 0,
      cashPayments: { count: 0, amount: 0 },
      scanPayments: { count: 0, amount: 0 },
      walletPayments: { count: 0, amount: 0 },
      codPayments: { count: 0, amount: 0 },
    };

    transactions.forEach((transaction) => {
      // Calculate net amount after refunds only for revenue-generating transactions
      const totalRefunded =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0,
        ) || 0;
      const netAmount = Math.max(0, transaction.total - totalRefunded);

      // Only add to total sales if transaction is completed, partially_refunded, or refunded
      // Exclude pending COD transactions
      if (
        (transaction.status === "completed" ||
          transaction.status === "partially_refunded" ||
          transaction.status === "refunded") &&
        transaction.paymentMethod !== "cod"
      ) {
        stats.totalAmount += netAmount;

        // Calculate profit for this transaction
        const transactionProfit = transaction.items.reduce(
          (itemTotal, item) => {
            const profitPerItem =
              (item.unitPrice - item.originalPrice) * item.quantity;
            console.log(
              "Payment - Item:",
              item.groupName,
              "Original:",
              item.originalPrice,
              "Unit:",
              item.unitPrice,
              "Qty:",
              item.quantity,
              "Profit:",
              profitPerItem,
            );
            return itemTotal + profitPerItem;
          },
          0,
        );

        // Subtract refunded profit
        const refundedProfit =
          transaction.refunds?.reduce((refundTotal, refund) => {
            return (
              refundTotal +
              refund.items.reduce((refundItemTotal, refundItem) => {
                const originalItem = transaction.items[refundItem.itemIndex];
                if (originalItem) {
                  const refundedProfitPerItem =
                    (originalItem.unitPrice - originalItem.originalPrice) *
                    refundItem.quantity;
                  return refundItemTotal + refundedProfitPerItem;
                }
                return refundItemTotal;
              }, 0)
            );
          }, 0) || 0;

        stats.totalProfit += Math.max(0, transactionProfit - refundedProfit);
      }

      // Status counts
      switch (transaction.status) {
        case "completed":
          stats.successfulPayments++;
          break;
        case "refunded":
          stats.refundPayments++;
          break;
        case "partially_refunded":
          stats.partialRefundPayments++;
          break;
        case "pending":
          // Count pending as successful since payment was processed
          stats.successfulPayments++;
          break;
        case "cancelled":
          stats.cancelledPayments++;
          break;
      }

      // Payment method breakdown (using net amounts after refunds, only for revenue-generating transactions)
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        switch (transaction.paymentMethod) {
          case "cash":
            stats.cashPayments.count++;
            stats.cashPayments.amount += netAmount;
            break;
          case "scan":
            stats.scanPayments.count++;
            stats.scanPayments.amount += netAmount;
            break;
          case "wallet":
            stats.walletPayments.count++;
            stats.walletPayments.amount += netAmount;
            break;
          case "cod":
            stats.codPayments.count++;
            stats.codPayments.amount += netAmount;
            break;
        }
      }
    });

    return stats;
  };

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      transaction.transactionId
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      transaction.customer?.displayName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesMethod =
      filterMethod === "all" || transaction.paymentMethod === filterMethod;
    const matchesStatus =
      filterStatus === "all" || transaction.status === filterStatus;

    return matchesSearch && matchesMethod && matchesStatus;
  });

  // Keep table order deterministic: newest transactions first
  const sortedFilteredTransactions = [...filteredTransactions].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();

    if (timeA !== timeB) {
      return timeB - timeA;
    }

    // Stable fallback when timestamps are equal
    return (b.transactionId || "").localeCompare(a.transactionId || "");
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedFilteredTransactions.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTransactions = sortedFilteredTransactions.slice(
    startIndex,
    endIndex,
  );

  const paymentStats = calculatePaymentStats();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "cash":
        return <CreditCard className="h-4 w-4 text-gray-900" />;
      case "scan":
        return <Smartphone className="h-4 w-4 text-gray-900" />;
      case "wallet":
        return <Wallet className="h-4 w-4 text-gray-900" />;
      case "cod":
        return <Truck className="h-4 w-4 text-gray-900" />;
      default:
        return <CreditCard className="h-4 w-4 text-gray-900" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "failed":
      case "cancelled":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case "completed":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "pending":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "failed":
      case "cancelled":
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const translatePaymentMethod = (method: string) => {
    const methodMap: Record<string, string> = {
      cash: t.cash,
      scan: t.scanPayment,
      wallet: t.wallet,
      cod: t.cod,
    };
    return methodMap[method] || method;
  };

  const translateStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      completed: t.completed,
      pending: t.pending,
      cancelled: t.cancelled,
      failed: t.failed,
    };
    return statusMap[status] || status;
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="hidden lg:block">
        <Sidebar
          activeItem="payments"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          activeItem="payments"
          onItemClick={() => setIsMobileSidebarOpen(false)}
          isCollapsed={false}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-screen-2xl mx-auto">
            {/* Header with Title */}
            <div className="mb-6 flex flex-col gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                  {t.payments || "Payment Dashboard"}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Track and manage all your payment transactions
                </p>
              </div>
            </div>

            {/* Payment Stats - Simplified Cards */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Total Sales Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.totalSales}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">
                      {formatPrice(paymentStats.totalAmount)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {paymentStats.totalCount} transactions
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-200 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Total Profit Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.totalProfit}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-green-600">
                      {formatPrice(paymentStats.totalProfit)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Net profit from sales
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-green-50 text-green-600 border border-green-200 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Successful Payments Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.successfulPayments}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-emerald-600">
                      {paymentStats.successfulPayments}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Completed
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Refund Payments Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.refundPayments}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-purple-600">
                      {paymentStats.refundPayments}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Full refunds
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Partial Refunds Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.partialRefunds}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-amber-600">
                      {paymentStats.partialRefundPayments}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Partial refunds
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Cancelled Payments Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-gray-500">
                      {t.cancelledPayments}
                    </h3>
                    <p className="mt-2 text-2xl font-semibold text-red-600">
                      {paymentStats.cancelledPayments}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Cancelled
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                    <XCircle className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>
            {/* Payment Methods Breakdown - Better Section */}
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {t.paymentMethodsBreakdown}
                  </h2>
                  <p className="text-gray-600 text-sm mt-1">
                    Revenue breakdown by payment method
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Cash Payments */}
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-6 border border-green-200 hover:border-green-400 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-green-200 p-3 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-700" />
                    </div>
                    <span className="text-xs font-semibold text-green-700 bg-green-200 px-3 py-1 rounded-full">
                      Cash
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {t.cashPayments}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mb-3">
                    {formatPrice(paymentStats.cashPayments.amount)}
                  </p>
                  <div className="pt-3 border-t border-green-300">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-green-700">
                        {paymentStats.cashPayments.count}
                      </span>{" "}
                      transactions
                    </p>
                  </div>
                </div>

                {/* Scan Payments */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-6 border border-blue-200 hover:border-blue-400 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-blue-200 p-3 rounded-lg">
                      <Smartphone className="h-6 w-6 text-blue-700" />
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-200 px-3 py-1 rounded-full">
                      QR Code
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {t.scanPayments}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mb-3">
                    {formatPrice(paymentStats.scanPayments.amount)}
                  </p>
                  <div className="pt-3 border-t border-blue-300">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-blue-700">
                        {paymentStats.scanPayments.count}
                      </span>{" "}
                      transactions
                    </p>
                  </div>
                </div>

                {/* Wallet Payments */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-6 border border-purple-200 hover:border-purple-400 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-purple-200 p-3 rounded-lg">
                      <Wallet className="h-6 w-6 text-purple-700" />
                    </div>
                    <span className="text-xs font-semibold text-purple-700 bg-purple-200 px-3 py-1 rounded-full">
                      E-Wallet
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {t.walletPayments}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mb-3">
                    {formatPrice(paymentStats.walletPayments.amount)}
                  </p>
                  <div className="pt-3 border-t border-purple-300">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-purple-700">
                        {paymentStats.walletPayments.count}
                      </span>{" "}
                      transactions
                    </p>
                  </div>
                </div>

                {/* COD Payments */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl p-6 border border-orange-200 hover:border-orange-400 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-orange-200 p-3 rounded-lg">
                      <Truck className="h-6 w-6 text-orange-700" />
                    </div>
                    <span className="text-xs font-semibold text-orange-700 bg-orange-200 px-3 py-1 rounded-full">
                      COD
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {t.codPayments}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mb-3">
                    {formatPrice(paymentStats.codPayments.amount)}
                  </p>
                  <div className="pt-3 border-t border-orange-300">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-orange-700">
                        {paymentStats.codPayments.count}
                      </span>{" "}
                      transactions
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Transactions List
            <div className="bg-white rounded-lg shadow-sm border border-gray-200  mb-1">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Recent Transactions
                </h2>
              </div>
            </div> */}
            {/* Filters and Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6">
              <div className="space-y-3">
                {/* First Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder={t.searchTransactions}
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                    />
                  </div>

                  {/* Status Filter */}
                  <select
                    aria-label="Filter by status"
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(
                        e.target.value as
                          | "all"
                          | "completed"
                          | "pending"
                          | "cancelled"
                          | "refunded"
                          | "partially_refunded",
                      );
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                  >
                    <option value="all">{t.allStatus}</option>
                    <option value="completed">{t.completed}</option>
                    <option value="pending">{t.pending}</option>
                    <option value="cancelled">{t.cancelled}</option>
                    <option value="refunded">{t.refunded}</option>
                    <option value="partially_refunded">
                      {t.partiallyRefunded}
                    </option>
                  </select>

                  {/* Payment Method Filter */}
                  <select
                    aria-label="Filter by payment method"
                    value={filterMethod}
                    onChange={(e) => {
                      setFilterMethod(
                        e.target.value as
                          | "all"
                          | "cash"
                          | "scan"
                          | "cod",
                      );
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                  >
                    <option value="all">{t.allPaymentMethods}</option>
                    <option value="cash">{t.cash}</option>
                    <option value="scan">{t.scanPayment}</option>
                    <option value="cod">{t.cod}</option>
                  </select>

                  {/* Branch Filter */}
                  <select
                    aria-label="Filter by branch"
                    value={filterBranch}
                    onChange={(e) => {
                      setFilterBranch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                  >
                    <option value="all">{t.allBranches}</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.name}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Second Row - Date Range, Date Filter, and Export */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative bg-white border border-gray-200 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-pink-300">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setDateRange("custom");
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-gray-900 w-32"
                      max={endDate}
                      aria-label="Start Date"
                    />
                  </div>

                  <span className="text-gray-400">—</span>

                  <div className="relative bg-white border border-gray-200 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-pink-300">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDateRange("custom");
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-gray-900 w-32"
                      min={startDate}
                      max={new Date().toISOString().split("T")[0]}
                      aria-label="End Date"
                    />
                  </div>

                  {/* Date Range Filter */}
                  <select
                    aria-label="Filter by date range"
                    value={dateRange}
                    onChange={(e) => {
                      const range = e.target.value as
                        | "today"
                        | "7d"
                        | "30d"
                        | "90d"
                        | "all"
                        | "custom";
                      setDateRange(range);
                      setCurrentPage(1);

                      if (range !== "custom") {
                        const end = new Date();
                        const start = new Date();

                        switch (range) {
                          case "today":
                            break;
                          case "7d":
                            start.setDate(start.getDate() - 7);
                            break;
                          case "30d":
                            start.setDate(start.getDate() - 30);
                            break;
                          case "90d":
                            start.setDate(start.getDate() - 90);
                            break;
                        }

                        if (range !== "all") {
                          setStartDate(start.toISOString().split("T")[0]);
                          setEndDate(end.toISOString().split("T")[0]);
                        }
                      }
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-pink-300 focus:border-transparent"
                  >
                    <option value="today">{t.today}</option>
                    <option value="7d">{t.last7Days}</option>
                    <option value="30d">{t.last30Days}</option>
                    <option value="90d">{t.last90Days}</option>
                    <option value="all">{t.allTime}</option>
                    <option value="custom">{t.customRange}</option>
                  </select>

                  <button
                    onClick={exportToCSV}
                    className="inline-flex items-center justify-center font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm rounded-lg ml-auto"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t.exportCsv}
                  </button>
                </div>
              </div>
            </div>
            {/* Payments Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-12 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
                  </div>
                  <p className="text-gray-600 text-lg font-medium">{t.loading}</p>
                </div>
              ) : sortedFilteredTransactions.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-5xl mb-4">📊</div>
                  <p className="text-gray-600 text-lg font-medium">{t.noPaymentsFound}</p>
                  <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.transactionId}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.customer}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.branch}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.sellingCurrency}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.amount} (THB)
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.paymentMethod}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.status}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {t.date}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-pink-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-semibold text-blue-700">
                              {transaction.transactionId}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {transaction.customer?.displayName ||
                                t.walkInCustomer}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {transaction.branchName || t.mainBranch}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {transaction.sellingCurrency &&
                            transaction.exchangeRate &&
                            transaction.sellingTotal ? (
                              <div className="space-y-1">
                                <div className="text-sm font-semibold text-gray-900">
                                  {transaction.sellingCurrency === "MMK"
                                    ? "Ks"
                                    : transaction.sellingCurrency}{" "}
                                  {transaction.sellingTotal.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  1 THB = {transaction.exchangeRate}{" "}
                                  {transaction.sellingCurrency === "MMK"
                                    ? "Ks"
                                    : transaction.sellingCurrency}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-bold text-green-700">
                              ฿ {transaction.total.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {getPaymentMethodIcon(transaction.paymentMethod)}
                              <span className="text-sm text-gray-900">
                                {translatePaymentMethod(
                                  transaction.paymentMethod,
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(transaction.status)}`}>
                              {translateStatus(transaction.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(transaction.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {sortedFilteredTransactions.length > 0 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {t.previous}
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {t.next}
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-gray-700">{t.rowsPerPage}:</p>
                      <select
                        title="Select number of rows per page"
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 hover:border-gray-400 focus:ring-2 focus:ring-gray-300 transition-all bg-white"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <p className="text-sm text-gray-700">
                        {t.showingPayments
                          .replace("{start}", String(startIndex + 1))
                          .replace(
                            "{end}",
                            String(
                              Math.min(
                                endIndex,
                                sortedFilteredTransactions.length,
                              ),
                            ),
                          )
                          .replace(
                            "{total}",
                            String(sortedFilteredTransactions.length),
                          )}
                      </p>
                    </div>
                    <div>
                      <nav
                        className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px"
                        aria-label="Pagination"
                      >
                        <button
                          title="Go to previous page"
                          onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                          }
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          title="Go to next page"
                          onClick={() =>
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1),
                            )
                          }
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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

export default function PaymentsPage() {
  return (
    <ProtectedRoute>
      <PaymentsPageContent />
    </ProtectedRoute>
  );
}
