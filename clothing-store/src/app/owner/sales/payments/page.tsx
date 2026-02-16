"use client";

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
    "all" | "cash" | "scan" | "wallet" | "cod"
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
      alert("No data to export");
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

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
        return <DollarSign className="h-5 w-5" />;
      case "scan":
        return <Smartphone className="h-5 w-5" />;
      case "wallet":
        return <Wallet className="h-5 w-5" />;
      case "cod":
        return <Truck className="h-5 w-5" />;
      default:
        return <CreditCard className="h-5 w-5" />;
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
    <div className="flex h-screen bg-gray-50">
      <div className="hidden md:block">
        <Sidebar
          activeItem="payments"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      <div className="md:hidden">
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

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-screen-2xl mx-auto">
            {/* Header
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Payment Management
              </h1>
              <p className="text-gray-600">
                Monitor and manage all payment transactions
              </p>
            </div> */}
            {/* Payment Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.totalSales}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatPrice(paymentStats.totalAmount)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.totalProfit}
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPrice(paymentStats.totalProfit)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.successfulPayments}
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {paymentStats.successfulPayments}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.refundPayments}
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {paymentStats.refundPayments}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.partialRefunds}
                    </p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {paymentStats.partialRefundPayments}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.cancelledPayments}
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {paymentStats.cancelledPayments}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t.paymentMethodsBreakdown}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.cashPayments}
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPrice(paymentStats.cashPayments.amount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {paymentStats.cashPayments.count} transactions
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.scanPayments}
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPrice(paymentStats.scanPayments.amount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {paymentStats.scanPayments.count} transactions
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.walletPayments}
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPrice(paymentStats.walletPayments.amount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {paymentStats.walletPayments.count} transactions
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {t.codPayments}
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPrice(paymentStats.codPayments.amount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {paymentStats.codPayments.count} transactions
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
            {/* Payment Methods Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t.cashPayments}
                  </h3>
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      {t.transaction}:
                    </span>
                    <span className="text-sm font-medium text-gray-600">
                      {paymentStats.cashPayments.count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{t.amount}:</span>
                    <span className="text-sm font-medium text-gray-600">
                      {formatPrice(paymentStats.cashPayments.amount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t.scanPayments}
                  </h3>
                  <Smartphone className="h-6 w-6 text-blue-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      {t.transaction}:
                    </span>
                    <span className="text-sm font-medium text-gray-600">
                      {paymentStats.scanPayments.count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{t.amount}:</span>
                    <span className="text-sm font-medium text-gray-600">
                      {formatPrice(paymentStats.scanPayments.amount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t.walletPayments}
                  </h3>
                  <Wallet className="h-6 w-6 text-purple-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      {t.transaction}:
                    </span>
                    <span className="text-sm font-medium text-gray-600  ">
                      {paymentStats.walletPayments.count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{t.amount}:</span>
                    <span className="text-sm font-medium text-gray-600">
                      {formatPrice(paymentStats.walletPayments.amount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t.codPayments}
                  </h3>
                  <Truck className="h-6 w-6 text-gray-700" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      {t.transaction}:
                    </span>
                    <span className="text-sm font-medium text-gray-600">
                      {paymentStats.codPayments.count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{t.amount}:</span>
                    <span className="text-sm font-medium text-gray-600">
                      {formatPrice(paymentStats.codPayments.amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Filters and Search */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300  focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                        | "wallet"
                        | "cod",
                    );
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="all">{t.allPaymentMethods}</option>
                  <option value="cash">{t.cash}</option>
                  <option value="scan">{t.scanPayment}</option>
                  <option value="wallet">{t.wallet}</option>
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
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="all">{t.allBranches}</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.name}>
                      {shop.name}
                    </option>
                  ))}
                </select>

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
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="today">{t.today}</option>
                  <option value="7d">{t.last7Days}</option>
                  <option value="30d">{t.last30Days}</option>
                  <option value="90d">{t.last90Days}</option>
                  <option value="all">{t.allTime}</option>
                  <option value="custom">{t.customRange}</option>
                </select>

                {/* Custom Date Range Inputs - Same Row */}
                <div className="flex items-center gap-2 lg:col-span-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDateRange("custom");
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    max={endDate}
                    aria-label="Start Date"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDateRange("custom");
                      setCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    min={startDate}
                    max={new Date().toISOString().split("T")[0]}
                    aria-label="End Date"
                  />
                </div>

                {/*Export Buttons */}
                <button
                  onClick={exportToCSV}
                  className="inline-flex items-center justify-center font-normal transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 text-gray-900 hover:bg-gray-50 px-4 py-2 text-sm flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t.exportCsv}
                </button>
              </div>
            </div>
            {/* Payments Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">{t.loading}</p>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-600">{t.noPaymentsFound}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.transactionId}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.customer}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.branch}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.sellingCurrency}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.amount} (THB)
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.paymentMethod}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.status}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t.date}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {transaction.transactionId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {transaction.customer?.displayName ||
                                t.walkInCustomer}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.branchName || t.mainBranch}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.sellingCurrency &&
                            transaction.exchangeRate &&
                            transaction.sellingTotal ? (
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {transaction.sellingCurrency === "MMK"
                                    ? "Ks"
                                    : transaction.sellingCurrency}{" "}
                                  {transaction.sellingTotal.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {t.rate}: 1 THB = {transaction.exchangeRate}{" "}
                                  {transaction.sellingCurrency === "MMK"
                                    ? "Ks"
                                    : transaction.sellingCurrency}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatPrice(transaction.total)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getPaymentMethodIcon(transaction.paymentMethod)}
                              <span className="ml-2 text-sm text-gray-900">
                                {translatePaymentMethod(
                                  transaction.paymentMethod,
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getStatusIcon(transaction.status)}
                              <span
                                className={`ml-2 ${getStatusBadge(
                                  transaction.status,
                                )}`}
                              >
                                {translateStatus(transaction.status)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(transaction.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {filteredTransactions.length > 0 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t.previous}
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
                        className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
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
                              Math.min(endIndex, filteredTransactions.length),
                            ),
                          )
                          .replace(
                            "{total}",
                            String(filteredTransactions.length),
                          )}
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
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1),
                            )
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
