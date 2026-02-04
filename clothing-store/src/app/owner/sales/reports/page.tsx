"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { transactionService, Transaction } from "@/services/transactionService";
import { ShopService } from "@/services/shopService";
import { StockService } from "@/services/stockService";
import { Sidebar } from "@/components/ui/Sidebar";
import { SettingsService } from "@/services/settingsService";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  CreditCard,
  Smartphone,
  Wallet,
  Truck,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { detectColorName } from "@/lib/colorUtils";

interface ReportData {
  totalRevenue: number;
  totalRevenueMMK: number;
  totalRevenueTHB: number;
  totalProfit: number;
  totalNetTHB?: number;
  totalNetMMK?: number;
  totalExpenseTHB: number;
  totalExpenseMMK: number;
  totalTransactions: number;
  totalCustomers: number;
  averageOrderValue: number;
  // Inventory totals (top-level)
  totalStockSellValueTHB?: number;
  totalStockSellValueMMK?: number;
  totalStockOriginalTHB?: number;
  totalStockOriginalMMK?: number;
  topSellingItems: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  dailySales: Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>;
  dailyStatus: Array<{
    date: string;
    profitTHB: number;
    profitMMK: number;
    // Inventory totals
    totalStockSellValueTHB?: number;
    totalStockSellValueMMK?: number;
    totalStockOriginalTHB?: number;
    totalStockOriginalMMK?: number;
    expenseTHB: number;
    expenseMMK: number;
    totalSalesTHB: number;
    totalSalesMMK: number;
    originalPriceTHB: number;
    originalPriceMMK: number;
    netTHB: number;
    netMMK: number;
    netSalesTHB?: number;
    netSalesMMK?: number;
  }>;
  paymentMethodBreakdown: Array<{
    method: string;
    count: number;
    percentage: number;
  }>;
  recentTransactions: Transaction[];
}

interface Expense {
  date: string;
  currency?: string;
  amount?: number;
  [key: string]: unknown;
}

function ReportsPageContent() {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // Daily Status specific filters
  const [dailyRange, setDailyRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("7d");
  const [dailyStartDate, setDailyStartDate] = useState<string>("");
  const [dailyEndDate, setDailyEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    | "all"
    | "completed"
    | "pending"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
  >("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<
    "all" | "cash" | "scan" | "wallet" | "cod"
  >("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  // Daily Status pagination
  const [dailyCurrentPage, setDailyCurrentPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(10);

  useEffect(() => {
    loadReportData();
  }, [
    dateRange,
    filterBranch,
    filterStatus,
    filterPaymentMethod,
    searchTerm,
    startDate,
    endDate,
  ]);

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

  const loadReportData = async () => {
    try {
      setLoading(true);
      const [transactions, expensesRes, stocks] = await Promise.all([
        transactionService.getTransactions(),
        fetch("/api/expenses"),
        StockService.getAllStocks(),
      ]);

      const expensesJson = await expensesRes.json();
      const expenses = expensesJson?.success ? expensesJson.data : [];

      // Filter transactions based on date range
      let filteredTransactions = transactions;
      let filteredExpenses = expenses;

      if (dateRange === "custom") {
        // Use custom date range
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          filteredTransactions = transactions.filter((t) => {
            const transactionDate = new Date(t.timestamp);
            return transactionDate >= start && transactionDate <= end;
          });
        }
      } else if (dateRange !== "all") {
        const now = new Date();
        const daysBack =
          dateRange === "today"
            ? 0
            : dateRange === "7d"
              ? 7
              : dateRange === "30d"
                ? 30
                : dateRange === "90d"
                  ? 90
                  : 0;

        const startDateCalc = new Date(now);
        if (dateRange === "today") {
          startDateCalc.setHours(0, 0, 0, 0);
        } else {
          startDateCalc.setDate(startDateCalc.getDate() - daysBack);
        }

        filteredTransactions = transactions.filter(
          (t) => new Date(t.timestamp) >= startDateCalc,
        );
        // apply same date filter to expenses
        filteredExpenses = expenses.filter(
          (e: { date: string }) => new Date(e.date) >= startDateCalc,
        );
      }

      // Filter by branch
      if (filterBranch && filterBranch !== "all") {
        filteredTransactions = filteredTransactions.filter(
          (t) => t.branchName === filterBranch,
        );
      }

      // Filter by status
      if (filterStatus !== "all") {
        filteredTransactions = filteredTransactions.filter(
          (t) => t.status === filterStatus,
        );
      }

      // Filter by payment method
      if (filterPaymentMethod !== "all") {
        filteredTransactions = filteredTransactions.filter(
          (t) => t.paymentMethod === filterPaymentMethod,
        );
      }

      // Filter by search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredTransactions = filteredTransactions.filter(
          (t) =>
            t.transactionId?.toLowerCase().includes(term) ||
            t.customer?.displayName?.toLowerCase().includes(term),
        );
      }

      // Calculate report data (include stocks for inventory totals)
      const data = calculateReportData(
        filteredTransactions,
        filteredExpenses,
        stocks as unknown as Stock[],
      );
      setReportData(data);
    } catch (error) {
      console.error("Error loading report data:", error);
    } finally {
      setLoading(false);
    }
  };

  type StockSizeQuantity = { quantity?: number };
  type StockVariant = { sizeQuantities?: StockSizeQuantity[] };
  type Stock = {
    colorVariants?: StockVariant[];
    unitPrice?: number;
    originalPrice?: number;
    // allow other properties safely if present
    [key: string]: unknown;
  };

  const calculateReportData = (
    transactions: Transaction[],
    expenses: Expense[] = [],
    stocks: Stock[] = [],
  ): ReportData => {
    // Normalize various currency labels to either 'THB' or 'MMK'
    const normalizeCurrency = (c?: string) => {
      if (!c) return "THB";
      const s = String(c).trim().toUpperCase();
      if (s === "MMK" || s === "KS" || s.includes("KYAT") || s === "K")
        return "MMK";
      if (s === "THB" || s.includes("BAHT") || s === "฿") return "THB";
      if (s.startsWith("M")) return "MMK";
      return "THB";
    };
    // Filter for revenue-generating transactions (completed, partially refunded, and refunded)
    const revenueTransactions = transactions.filter(
      (t) =>
        t.status === "completed" ||
        t.status === "partially_refunded" ||
        t.status === "refunded",
    );

    // Calculate net revenue after refunds
    const totalRevenue = revenueTransactions.reduce((sum, t) => {
      const refundedAmount =
        t.refunds?.reduce(
          (refundSum, refund) => refundSum + refund.totalAmount,
          0,
        ) || 0;
      return sum + Math.max(0, t.total - refundedAmount);
    }, 0);

    // Calculate net revenue for transactions sold in MMK only
    const totalRevenueMMK = revenueTransactions
      .filter((t) => normalizeCurrency(t.sellingCurrency) === "MMK")
      .reduce((sum, t) => {
        const refundedAmount =
          t.refunds?.reduce(
            (refundSum, refund) => refundSum + refund.totalAmount,
            0,
          ) || 0;
        return sum + Math.max(0, t.total - refundedAmount);
      }, 0);

    // Calculate net revenue for transactions sold in THB only
    const totalRevenueTHB = revenueTransactions
      .filter((t) => normalizeCurrency(t.sellingCurrency) === "THB")
      .reduce((sum, t) => {
        const refundedAmount =
          t.refunds?.reduce(
            (refundSum, refund) => refundSum + refund.totalAmount,
            0,
          ) || 0;
        return sum + Math.max(0, t.total - refundedAmount);
      }, 0);

    // Calculate total profit (Original Price - Unit Price for each item)
    const totalProfit = revenueTransactions.reduce((sum, t) => {
      const transactionProfit = t.items.reduce((itemTotal, item) => {
        const profitPerItem =
          (item.unitPrice - item.originalPrice) * item.quantity;
        console.log(
          "Reports - Item:",
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
      }, 0);

      // Subtract refunded profit
      const refundedProfit =
        t.refunds?.reduce((refundTotal, refund) => {
          return (
            refundTotal +
            refund.items.reduce((refundItemTotal, refundItem) => {
              const originalItem = t.items[refundItem.itemIndex];
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

      return sum + Math.max(0, transactionProfit - refundedProfit);
    }, 0);

    // Calculate total profit split by currency (THB / MMK), considering refunds
    let totalProfitTHB = 0;
    let totalProfitMMK = 0;
    revenueTransactions.forEach((t) => {
      const refundedQuantities: { [itemIndex: number]: number } = {};
      if (t.refunds) {
        t.refunds.forEach((refund) => {
          refund.items.forEach((ri) => {
            refundedQuantities[ri.itemIndex] =
              (refundedQuantities[ri.itemIndex] || 0) + ri.quantity;
          });
        });
      }

      const transactionProfit = t.items.reduce((itemTotal, item, idx) => {
        const refundedQty = refundedQuantities[idx] || 0;
        const netQty = Math.max(0, item.quantity - refundedQty);
        return itemTotal + (item.unitPrice - item.originalPrice) * netQty;
      }, 0);

      const sellingCurrency = normalizeCurrency(t.sellingCurrency);
      if (sellingCurrency === "THB") totalProfitTHB += transactionProfit;
      else totalProfitMMK += transactionProfit;
    });

    const totalTransactions = transactions.length;
    const uniqueCustomers = new Set(
      transactions.map((t) => t.customer?.uid).filter(Boolean),
    ).size;
    const averageOrderValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Top selling items
    const itemSales: { [key: string]: { quantity: number; revenue: number } } =
      {};

    const isProbablyId = (s?: string) => !!s && /(^cv|[-_].+-)/.test(s);
    const getDisplayColor = (item: {
      colorCode?: string;
      selectedColor?: string;
    }) => {
      const hex = item?.colorCode || "#000000";
      if (item?.selectedColor && !isProbablyId(item.selectedColor)) {
        return item.selectedColor;
      }
      try {
        return detectColorName(hex) || hex;
      } catch (e) {
        return hex;
      }
    };

    // Only include items from revenue-generating transactions
    revenueTransactions.forEach((transaction) => {
      // Calculate refunded quantities for each item in this transaction
      const refundedQuantities: { [itemIndex: number]: number } = {};
      if (transaction.refunds) {
        transaction.refunds.forEach((refund) => {
          refund.items.forEach((refundItem) => {
            refundedQuantities[refundItem.itemIndex] =
              (refundedQuantities[refundItem.itemIndex] || 0) +
              refundItem.quantity;
          });
        });
      }

      transaction.items.forEach((item, index) => {
        const colorLabel = getDisplayColor(item);
        const key = `${item.groupName} - ${colorLabel} - ${item.selectedSize}`;
        if (!itemSales[key]) {
          itemSales[key] = { quantity: 0, revenue: 0 };
        }

        // Calculate net quantity (original quantity minus refunded quantity)
        const refundedQty = refundedQuantities[index] || 0;
        const netQuantity = item.quantity - refundedQty;
        const netRevenue = item.unitPrice * netQuantity;

        // Only add positive quantities and revenue
        if (netQuantity > 0) {
          itemSales[key].quantity += netQuantity;
          itemSales[key].revenue += netRevenue;
        }
      });
    });

    const topSellingItems = Object.entries(itemSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Daily sales (last 7 days)
    const dailySales: {
      [key: string]: { revenue: number; transactions: number };
    } = {};
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    last7Days.forEach((date) => {
      dailySales[date] = { revenue: 0, transactions: 0 };
    });

    transactions.forEach((transaction) => {
      const date = new Date(transaction.timestamp).toISOString().split("T")[0];
      if (dailySales[date]) {
        // Only include revenue from completed, partially_refunded, and refunded transactions
        if (
          transaction.status === "completed" ||
          transaction.status === "partially_refunded" ||
          transaction.status === "refunded"
        ) {
          // Calculate refunded amount from refunds array
          const refundedAmount =
            transaction.refunds?.reduce(
              (sum, refund) => sum + refund.totalAmount,
              0,
            ) || 0;
          const netAmount = transaction.total - refundedAmount;
          dailySales[date].revenue += Math.max(0, netAmount);
        }
        dailySales[date].transactions += 1;
      }
    });

    const dailySalesArray = Object.entries(dailySales).map(([date, data]) => ({
      date,
      ...data,
    }));

    // Inventory totals (sell value and original cost)
    const totalStockSellValueTHB = (stocks || []).reduce((acc, stock) => {
      const variants = stock.colorVariants || [];
      const qty = variants.reduce((vAcc: number, v: StockVariant) => {
        const sizes = v.sizeQuantities || [];
        const sizeTotal = sizes.reduce(
          (sAcc: number, s: StockSizeQuantity) => sAcc + (s.quantity || 0),
          0,
        );
        return vAcc + sizeTotal;
      }, 0);
      return acc + (stock.unitPrice || 0) * qty;
    }, 0);

    const totalStockOriginalTHB = (stocks || []).reduce((acc, stock) => {
      const variants = stock.colorVariants || [];
      const qty = variants.reduce((vAcc: number, v: StockVariant) => {
        const sizes = v.sizeQuantities || [];
        const sizeTotal = sizes.reduce(
          (sAcc: number, s: StockSizeQuantity) => sAcc + (s.quantity || 0),
          0,
        );
        return vAcc + sizeTotal;
      }, 0);
      return acc + (stock.originalPrice || 0) * qty;
    }, 0);

    const currencyRate = businessSettings?.currencyRate || 0;
    const defaultCurrency =
      (businessSettings?.defaultCurrency as "THB" | "MMK") || "THB";

    const totalStockSellValueMMK = SettingsService.convertPrice(
      totalStockSellValueTHB,
      "THB",
      "MMK",
      currencyRate,
      defaultCurrency,
    );

    const totalStockOriginalMMK = SettingsService.convertPrice(
      totalStockOriginalTHB,
      "THB",
      "MMK",
      currencyRate,
      defaultCurrency,
    );

    // Daily status: profit, expense, net (THB and MMK) for a wider range
    const maxDailyDays = 90;
    const lastNDays = Array.from({ length: maxDailyDays }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    const dailyStatusMap: {
      [key: string]: {
        profitTHB: number;
        profitMMK: number;
        expenseTHB: number;
        expenseMMK: number;
        totalSalesTHB: number;
        totalSalesMMK: number;
        originalPriceTHB: number;
        originalPriceMMK: number;
      };
    } = {};

    lastNDays.forEach((d) => {
      dailyStatusMap[d] = {
        profitTHB: 0,
        profitMMK: 0,
        expenseTHB: 0,
        expenseMMK: 0,
        totalSalesTHB: 0,
        totalSalesMMK: 0,
        originalPriceTHB: 0,
        originalPriceMMK: 0,
      };
    });

    // Compute profit per transaction per day
    const isRevenueStatus = (s: string) =>
      s === "completed" || s === "partially_refunded" || s === "refunded";

    transactions.forEach((transaction) => {
      const dateKey = new Date(transaction.timestamp)
        .toISOString()
        .split("T")[0];
      if (!dailyStatusMap[dateKey]) return;
      if (!isRevenueStatus(transaction.status)) return;

      const sellingCurrency = normalizeCurrency(transaction.sellingCurrency);
      const exchangeRate = transaction.exchangeRate || 1;

      // Compute refunded quantities map for this transaction
      const refundedQuantities: { [itemIndex: number]: number } = {};
      if (transaction.refunds) {
        transaction.refunds.forEach((refund) => {
          refund.items.forEach((ri) => {
            refundedQuantities[ri.itemIndex] =
              (refundedQuantities[ri.itemIndex] || 0) + ri.quantity;
          });
        });
      }

      transaction.items.forEach((item, idx) => {
        const refundedQty = refundedQuantities[idx] || 0;
        const netQty = Math.max(0, item.quantity - refundedQty);

        // Item prices are always stored in THB (base currency)
        const profitTHB = (item.unitPrice - item.originalPrice) * netQty;
        const salesAmountTHB = item.unitPrice * netQty;
        const originalAmountTHB = item.originalPrice * netQty;

        // Add to the correct currency bucket based on transaction's selling currency
        if (sellingCurrency === "THB") {
          dailyStatusMap[dateKey].profitTHB += profitTHB;
          dailyStatusMap[dateKey].totalSalesTHB += salesAmountTHB;
          dailyStatusMap[dateKey].originalPriceTHB += originalAmountTHB;
        } else {
          // Convert THB amounts to MMK using the transaction's exchange rate
          dailyStatusMap[dateKey].profitMMK += profitTHB * exchangeRate;
          dailyStatusMap[dateKey].totalSalesMMK +=
            salesAmountTHB * exchangeRate;
          dailyStatusMap[dateKey].originalPriceMMK +=
            originalAmountTHB * exchangeRate;
        }
      });
    });

    // Compute expenses per day
    (expenses || []).forEach((exp: Expense) => {
      const dateKey = new Date(exp.date).toISOString().split("T")[0];
      if (!dailyStatusMap[dateKey]) return;
      const ec = normalizeCurrency(exp.currency as string | undefined);
      if (ec === "THB") dailyStatusMap[dateKey].expenseTHB += exp.amount || 0;
      else if (ec === "MMK")
        dailyStatusMap[dateKey].expenseMMK += exp.amount || 0;
    });

    const dailyStatus = Object.entries(dailyStatusMap).map(([date, v]) => ({
      date,
      profitTHB: v.profitTHB,
      profitMMK: v.profitMMK,
      expenseTHB: v.expenseTHB,
      expenseMMK: v.expenseMMK,
      totalSalesTHB: v.totalSalesTHB,
      totalSalesMMK: v.totalSalesMMK,
      originalPriceTHB: v.originalPriceTHB,
      originalPriceMMK: v.originalPriceMMK,
      netTHB: v.profitTHB - v.expenseTHB,
      netMMK: v.profitMMK - v.expenseMMK,
      // Net Sales = Total Sales - Expense
      netSalesTHB: v.totalSalesTHB - v.expenseTHB,
      netSalesMMK: v.totalSalesMMK - v.expenseMMK,
    }));

    // Payment method breakdown
    const paymentMethods: { [key: string]: number } = {};
    transactions.forEach((transaction) => {
      paymentMethods[transaction.paymentMethod] =
        (paymentMethods[transaction.paymentMethod] || 0) + 1;
    });

    const paymentMethodBreakdown = Object.entries(paymentMethods).map(
      ([method, count]) => ({
        method,
        count,
        percentage:
          totalTransactions > 0 ? (count / totalTransactions) * 100 : 0,
      }),
    );

    // Get recent transactions (sorted by timestamp, pagination will be applied in render)
    const recentTransactions = transactions.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Calculate expenses totals by currency for the given date range
    const totalsByCurrency = (expenses || []).reduce(
      (acc: { THB: number; MMK: number }, exp: Expense) => {
        if (exp.currency === "THB") acc.THB += exp.amount || 0;
        else if (exp.currency === "MMK") acc.MMK += exp.amount || 0;
        return acc;
      },
      { THB: 0, MMK: 0 },
    );

    // Total net profit per currency = profit per currency - expenses per currency
    const totalNetTHB =
      (typeof totalProfitTHB !== "undefined" ? totalProfitTHB : 0) -
      totalsByCurrency.THB;
    const totalNetMMK =
      (typeof totalProfitMMK !== "undefined" ? totalProfitMMK : 0) -
      totalsByCurrency.MMK;

    return {
      totalRevenue,
      totalRevenueMMK,
      totalRevenueTHB,
      totalProfit,
      totalNetTHB,
      totalNetMMK,
      totalStockSellValueTHB,
      totalStockSellValueMMK,
      totalStockOriginalTHB,
      totalStockOriginalMMK,
      totalExpenseTHB: totalsByCurrency.THB,
      totalExpenseMMK: totalsByCurrency.MMK,
      totalTransactions,
      totalCustomers: uniqueCustomers,
      averageOrderValue,
      topSellingItems,
      dailySales: dailySalesArray,
      dailyStatus,
      paymentMethodBreakdown,
      recentTransactions,
    };
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReportData();
    setRefreshing(false);
  };

  const exportToCSV = () => {
    const transactions = reportData?.recentTransactions || [];
    if (transactions.length === 0) {
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
    const rows = transactions.map((transaction) => {
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
      `reports_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      ", " +
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
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

  // Pagination calculations for recent transactions
  const allTransactions = reportData?.recentTransactions || [];
  const totalPages = Math.ceil(allTransactions.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTransactions = allTransactions.slice(startIndex, endIndex);

  const formatInMMK = (amount: number) => {
    const from = (businessSettings?.defaultCurrency as "THB" | "MMK") || "THB";
    const rate = businessSettings?.currencyRate || 0;
    const converted = SettingsService.convertPrice(
      amount,
      from,
      "MMK",
      rate,
      (businessSettings?.defaultCurrency as "THB" | "MMK" | undefined) || "THB",
    );
    return SettingsService.formatPrice(converted, "MMK");
  };

  // Compute displayed daily status based on `dailyRange` and custom dates
  const displayedDailyStatus = (() => {
    const allDaily = reportData?.dailyStatus || [];
    if (!allDaily || allDaily.length === 0) return [] as typeof allDaily;

    let start: Date | null = null;
    let end: Date | null = null;

    if (dailyRange === "all") {
      start = null;
      end = null;
    } else if (dailyRange === "custom") {
      if (dailyStartDate) start = new Date(dailyStartDate);
      if (dailyEndDate) {
        end = new Date(dailyEndDate);
        end.setHours(23, 59, 59, 999);
      }
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
      start = new Date();
      if (dailyRange === "today") start.setHours(0, 0, 0, 0);
      else if (dailyRange === "7d") start.setDate(start.getDate() - 6);
      else if (dailyRange === "30d") start.setDate(start.getDate() - 29);
      else if (dailyRange === "90d") start.setDate(start.getDate() - 89);
      if (start) start.setHours(0, 0, 0, 0);
    }

    const filtered = allDaily.filter((row) => {
      if (!start || !end) return true;
      const d = new Date(row.date);
      return d >= start && d <= end;
    });

    return filtered.slice().sort((a, b) => b.date.localeCompare(a.date));
  })();

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="hidden md:block">
          <Sidebar
            activeItem="reports"
            onItemClick={() => {}}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isCartModalOpen={isCartModalOpen}
          />
        </div>

        <div className="md:hidden">
          <Sidebar
            activeItem="reports"
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

          <main className="flex-1 overflow-y-auto flex items-center justify-center px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading reports...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden md:block">
        <Sidebar
          activeItem="reports"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      <div className="md:hidden">
        <Sidebar
          activeItem="reports"
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
                Reports & Analytics
              </h1>
              <p className="text-gray-600">
                Comprehensive business insights and performance metrics
              </p>
            </div> */}

            {/* Key Metrics - row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Sales
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPrice(reportData?.totalRevenue || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Profit
                    </p>
                    <p className="text-2xl font-bold text-orange-600">
                      {formatPrice(reportData?.totalProfit || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Transactions
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData?.totalTransactions || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Customers
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData?.totalCustomers || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <hr className="text-gray-300 p-3"></hr>
            </div>

            {/* Key Metrics - row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Sales (฿)
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPrice(reportData?.totalRevenue || 0)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Sale (Ks)
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {formatInMMK(reportData?.totalRevenueMMK || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Expense (฿)
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatPrice(reportData?.totalExpenseTHB || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Expense (Ks)
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {SettingsService.formatPrice(
                        reportData?.totalExpenseMMK || 0,
                        "MMK",
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <hr className="text-gray-300 p-3"></hr>
            </div>

            {/* Inventory Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Remaining Stock Value (Unit Price)
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPrice(reportData?.totalStockSellValueTHB || 0)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {SettingsService.formatPrice(
                        reportData?.totalStockSellValueMMK || 0,
                        "MMK",
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Remaining Stock Value (Original Price)
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {formatPrice(reportData?.totalStockOriginalTHB || 0)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {SettingsService.formatPrice(
                        reportData?.totalStockOriginalMMK || 0,
                        "MMK",
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      Total Net Profit
                    </p>
                    <p className="text-2xl font-bold text-orange-600">
                      {formatPrice(reportData?.totalNetTHB || 0)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {SettingsService.formatPrice(
                        reportData?.totalNetMMK || 0,
                        "MMK",
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <hr className="text-gray-300 p-3"></hr>
            </div>

            {/* Charts and Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Daily Sales Chart
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Daily Sales (Last 7 Days)
                </h3>
                <div className="space-y-4">
                  {reportData?.dailySales.map((day, index) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span className="text-sm text-gray-600">
                          {formatDate(day.date)}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatPrice(day.revenue)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {day.transactions} transactions
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div> */}

              {/* Payment Methods */}
              {/* <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Payment Methods
                </h3>
                <div className="space-y-4">
                  {reportData?.paymentMethodBreakdown.map((method, index) => (
                    <div
                      key={method.method}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
                        <span className="text-sm text-gray-900 capitalize">
                          {method.method}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {method.count} transactions
                        </div>
                        <div className="text-xs text-gray-500">
                          {method.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div> */}
            </div>

            {/* Daily Status Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Daily Status
                  </h3>
                  <div className="flex items-center space-x-2">
                    <select
                      aria-label="Daily status branch"
                      value={filterBranch || "all"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterBranch(v);
                        setDailyCurrentPage(1);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-2 border border-gray-300 bg-white text-sm text-gray-900"
                    >
                      <option value="all">All Branches</option>
                      {shops.map((shop) => (
                        <option key={shop.id} value={shop.name}>
                          {shop.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Daily status range"
                      value={dailyRange}
                      onChange={(e) => {
                        const v = e.target.value as
                          | "today"
                          | "7d"
                          | "30d"
                          | "90d"
                          | "all"
                          | "custom";
                        setDailyRange(v);
                        if (v !== "custom") {
                          const end = new Date();
                          const start = new Date();
                          if (v === "today") start.setHours(0, 0, 0, 0);
                          else if (v === "7d")
                            start.setDate(start.getDate() - 6);
                          else if (v === "30d")
                            start.setDate(start.getDate() - 29);
                          else if (v === "90d")
                            start.setDate(start.getDate() - 89);
                          setDailyStartDate(start.toISOString().split("T")[0]);
                          setDailyEndDate(end.toISOString().split("T")[0]);
                        }
                      }}
                      className="px-3 py-2 border border-gray-300 bg-white text-sm text-gray-900"
                    >
                      <option value="today">Today</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="90d">Last 90 Days</option>
                      <option value="all">All</option>
                      <option value="custom">Custom</option>
                    </select>
                    {dailyRange === "custom" && (
                      <>
                        <input
                          title="Start date"
                          type="date"
                          value={dailyStartDate}
                          onChange={(e) => setDailyStartDate(e.target.value)}
                          className="px-2 py-2 border border-gray-300 text-gray-900 text-sm"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          title="End date"
                          type="date"
                          value={dailyEndDate}
                          onChange={(e) => setDailyEndDate(e.target.value)}
                          className="px-2 py-2 border border-gray-300 text-sm text-gray-900"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                {/* Compute displayed daily status based on dailyRange/dates */}
                {(() => {
                  const allDaily = reportData?.dailyStatus || [];
                  let start: Date | null = null;
                  let end: Date | null = null;

                  if (dailyRange === "all") {
                    start = null;
                    end = null;
                  } else if (dailyRange === "custom") {
                    if (dailyStartDate) start = new Date(dailyStartDate);
                    if (dailyEndDate) {
                      end = new Date(dailyEndDate);
                      end.setHours(23, 59, 59, 999);
                    }
                  } else {
                    end = new Date();
                    end.setHours(23, 59, 59, 999);
                    start = new Date();
                    if (dailyRange === "today") {
                      start.setHours(0, 0, 0, 0);
                    } else if (dailyRange === "7d") {
                      start.setDate(start.getDate() - 6);
                      start.setHours(0, 0, 0, 0);
                    } else if (dailyRange === "30d") {
                      start.setDate(start.getDate() - 29);
                      start.setHours(0, 0, 0, 0);
                    } else if (dailyRange === "90d") {
                      start.setDate(start.getDate() - 89);
                      start.setHours(0, 0, 0, 0);
                    }
                  }

                  // Filter rows by date range if start/end provided
                  const filtered = allDaily.filter((row) => {
                    if (!start || !end) return true;
                    const d = new Date(row.date);
                    return d >= start! && d <= end!;
                  });

                  // Attach filtered list to a ref on window so JSX mapping below can access it via a variable
                  (
                    window as Window & {
                      __displayedDailyStatus?: ReportData["dailyStatus"];
                    }
                  ).__displayedDailyStatus = filtered
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date));
                  return null;
                })()}
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Sales
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Original Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Profit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expense
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net Sales
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      const total = displayedDailyStatus.length;
                      const dailyTotalPages = Math.max(
                        1,
                        Math.ceil(total / dailyRowsPerPage),
                      );
                      const dailyStartIndex =
                        (dailyCurrentPage - 1) * dailyRowsPerPage;
                      const dailyEndIndex = dailyStartIndex + dailyRowsPerPage;
                      const dailyPageRows = displayedDailyStatus.slice(
                        dailyStartIndex,
                        dailyEndIndex,
                      );
                      return dailyPageRows.map((row) => (
                        <tr key={row.date} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(() => {
                              const d = new Date(row.date);
                              return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.totalSalesTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.totalSalesMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.originalPriceTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.originalPriceMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.profitTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.profitMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.expenseTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.expenseMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.netSalesTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.netSalesMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatPrice(row.netTHB || 0)}</div>
                            <div className="text-xs text-gray-500">
                              {SettingsService.formatPrice(
                                row.netMMK || 0,
                                "MMK",
                              )}
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
                {/* Daily Status Pagination */}
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() =>
                        setDailyCurrentPage(Math.max(1, dailyCurrentPage - 1))
                      }
                      disabled={dailyCurrentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setDailyCurrentPage((p) =>
                          Math.min(
                            Math.ceil(
                              (displayedDailyStatus.length || 1) /
                                dailyRowsPerPage,
                            ),
                            p + 1,
                          ),
                        )
                      }
                      disabled={
                        dailyCurrentPage ===
                        Math.ceil(
                          (displayedDailyStatus.length || 1) / dailyRowsPerPage,
                        )
                      }
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
                        value={dailyRowsPerPage}
                        onChange={(e) => {
                          setDailyRowsPerPage(Number(e.target.value));
                          setDailyCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <p className="text-sm text-gray-700">
                        Showing{" "}
                        {Math.min(
                          displayedDailyStatus.length,
                          (dailyCurrentPage - 1) * dailyRowsPerPage + 1,
                        )}
                        –
                        {Math.min(
                          dailyCurrentPage * dailyRowsPerPage,
                          displayedDailyStatus.length,
                        )}{" "}
                        of {displayedDailyStatus.length} days
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
                            setDailyCurrentPage(
                              Math.max(1, dailyCurrentPage - 1),
                            )
                          }
                          disabled={dailyCurrentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          title="Go to next page"
                          onClick={() =>
                            setDailyCurrentPage((p) =>
                              Math.min(
                                Math.ceil(
                                  (displayedDailyStatus.length || 1) /
                                    dailyRowsPerPage,
                                ),
                                p + 1,
                              ),
                            )
                          }
                          disabled={
                            dailyCurrentPage ===
                            Math.ceil(
                              (displayedDailyStatus.length || 1) /
                                dailyRowsPerPage,
                            )
                          }
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

            {/* Top Selling Items */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Top Selling Items
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity Sold
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Sale
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Performance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData?.topSellingItems.map((item, index) => (
                      <tr key={item.name} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {index + 1}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {item.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.quantity} units
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatPrice(item.revenue)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (item.quantity /
                                      (reportData?.topSellingItems[0]
                                        ?.quantity || 1)) *
                                      100,
                                  )}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600">
                              {Math.round(
                                (item.quantity /
                                  (reportData?.topSellingItems[0]?.quantity ||
                                    1)) *
                                  100,
                              )}
                              %
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                  <option value="partially_refunded">Partially Refunded</option>
                </select>

                {/* Payment Method Filter */}
                <select
                  aria-label="Filter by payment method"
                  value={filterPaymentMethod}
                  onChange={(e) => {
                    setFilterPaymentMethod(
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
                  <option value="all">All Payment Methods</option>
                  <option value="cash">Cash</option>
                  <option value="scan">Scan Payment</option>
                  <option value="wallet">Wallet</option>
                  <option value="cod">COD</option>
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
                  <option value="all">All Branches</option>
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
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Range</option>
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
                  Export
                </button>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Recent Transactions
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subtotal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Discount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tax
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Profit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Branch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sold By
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date & Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                          #{transaction.transactionId}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {transaction.customer?.displayName
                            ? transaction.customer.displayName
                            : "Walk-in customer"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {transaction.items.reduce(
                                (total, item) => total + item.quantity,
                                0,
                              )}
                            </span>
                            <span className="text-xs text-gray-500">
                              {transaction.items.length} type(s)
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatPrice(transaction.subtotal)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {transaction.discount > 0 ? (
                            <span className="text-red-600 font-medium">
                              -{formatPrice(transaction.discount)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatPrice(transaction.tax)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {(() => {
                            const refundedAmount =
                              transaction.refunds?.reduce(
                                (sum, refund) => sum + refund.totalAmount,
                                0,
                              ) || 0;
                            const netTotal = transaction.total - refundedAmount;

                            if (refundedAmount > 0) {
                              return (
                                <div className="flex flex-col">
                                  <span className="text-gray-900">
                                    {formatPrice(netTotal)}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    (Original: {formatPrice(transaction.total)})
                                  </span>
                                </div>
                              );
                            }

                            return formatPrice(transaction.total);
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                          {(() => {
                            // Calculate profit: (selling price - original price) * quantity for each item
                            const totalProfit = transaction.items.reduce(
                              (sum, item) => {
                                const sellingPrice =
                                  item.discountedPrice || item.unitPrice;
                                const profit =
                                  (sellingPrice - item.originalPrice) *
                                  item.quantity;
                                return sum + profit;
                              },
                              0,
                            );

                            // Calculate profit lost from refunds (not the entire refund amount)
                            const refundedProfit =
                              transaction.refunds?.reduce(
                                (refundTotal, refund) => {
                                  return (
                                    refundTotal +
                                    refund.items.reduce(
                                      (refundItemTotal, refundItem) => {
                                        const originalItem =
                                          transaction.items[
                                            refundItem.itemIndex
                                          ];
                                        if (originalItem) {
                                          const itemSellingPrice =
                                            originalItem.discountedPrice ||
                                            originalItem.unitPrice;
                                          const refundedItemProfit =
                                            (itemSellingPrice -
                                              originalItem.originalPrice) *
                                            refundItem.quantity;
                                          return (
                                            refundItemTotal + refundedItemProfit
                                          );
                                        }
                                        return refundItemTotal;
                                      },
                                      0,
                                    )
                                  );
                                },
                                0,
                              ) || 0;

                            const netProfit = totalProfit - refundedProfit;
                            const isProfitable = netProfit >= 0;

                            return (
                              <span
                                className={
                                  isProfitable
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {formatPrice(netProfit)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center">
                            {getPaymentMethodIcon(transaction.paymentMethod)}
                            <span className="ml-2 text-sm text-gray-900 capitalize">
                              {transaction.paymentMethod}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {transaction.branchName || "Main Branch"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                              <span className="text-xs font-medium text-blue-800">
                                {user?.email?.charAt(0).toUpperCase() || "S"}
                              </span>
                            </div>
                            <span className="text-gray-700">
                              {user?.email?.split("@")[0] || "System"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              transaction.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : transaction.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : transaction.status === "cancelled"
                                    ? "bg-red-100 text-red-800"
                                    : transaction.status === "refunded"
                                      ? "bg-gray-100 text-gray-800"
                                      : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {transaction.status === "completed"
                              ? "Completed"
                              : transaction.status === "pending"
                                ? "Pending"
                                : transaction.status === "cancelled"
                                  ? "Cancelled"
                                  : transaction.status === "refunded"
                                    ? "Refunded"
                                    : transaction.status ===
                                        "partially_refunded"
                                      ? "Partially Refunded"
                                      : transaction.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(transaction.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                      {Math.min(endIndex, allTransactions.length)} of{" "}
                      {allTransactions.length} transactions
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
    </div>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <ReportsPageContent />
    </ProtectedRoute>
  );
}
