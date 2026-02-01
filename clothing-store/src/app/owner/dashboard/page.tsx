"use client";

import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  Store,
  Package,
  BarChart3,
  ShoppingCart,
  User,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { transactionService, Transaction } from "@/services/transactionService";
import { StockService } from "@/services/stockService";
import { CustomerService } from "@/services/customerService";
import { ShopService } from "@/services/shopService";
import { SettingsService } from "@/services/settingsService";
import { StockItem } from "@/types/stock";
import { Customer } from "@/types/customer";

interface DashboardStats {
  totalRevenue: number;
  totalRevenueMMK: number;
  totalRevenueTHB: number;
  totalProfit: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  refundPayments: number;
  partialRefunds: number;
  totalExpenseTHB: number;
  totalExpenseMMK: number;
  totalCustomers: number;
  newCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  totalItemsSold: number;
  revenueGrowth: number;
  ordersGrowth: number;
  customersGrowth: number;
  averageOrderValue: number;
}

interface RevenueByMethod {
  cash: number;
  scan: number;
  wallet: number;
  cod: number;
}

interface TopProduct {
  id: string;
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}

interface RecentActivity {
  id: string;
  type: "sale" | "refund" | "customer" | "stock";
  description: string;
  timestamp: Date;
  amount?: number;
  status?: string;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface PaymentMethodChart {
  name: string;
  value: number;
  percentage: number;
}

interface OrderStatusChart {
  name: string;
  value: number;
  percentage: number;
}

interface Expense {
  date: string;
  currency?: "THB" | "MMK" | string;
  amount?: number;
}

function OwnerDashboardContent() {
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "custom"
  >("30d");

  // Data states
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalRevenueMMK: 0,
    totalRevenueTHB: 0,
    totalProfit: 0,
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    refundPayments: 0,
    partialRefunds: 0,
    totalExpenseTHB: 0,
    totalExpenseMMK: 0,
    totalCustomers: 0,
    newCustomers: 0,
    totalProducts: 0,
    lowStockProducts: 0,
    totalItemsSold: 0,
    revenueGrowth: 0,
    ordersGrowth: 0,
    customersGrowth: 0,
    averageOrderValue: 0,
  });
  const [revenueByMethod, setRevenueByMethod] = useState<RevenueByMethod>({
    cash: 0,
    scan: 0,
    wallet: 0,
    cod: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dailyRevenueData, setDailyRevenueData] = useState<DailyRevenue[]>([]);
  const [paymentMethodChartData, setPaymentMethodChartData] = useState<
    PaymentMethodChart[]
  >([]);
  const [orderStatusChartData, setOrderStatusChartData] = useState<
    OrderStatusChart[]
  >([]);

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
      start.setDate(start.getDate() - 30); // Default to last 30 days

      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, endDate]);

  // Calculate daily revenue data for chart
  const calculateDailyRevenue = (
    transactions: Transaction[],
    startDate: Date,
    endDate: Date,
  ): DailyRevenue[] => {
    const dailyData = new Map<
      string,
      { revenue: number; profit: number; orders: number }
    >();

    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0];
      dailyData.set(dateKey, { revenue: 0, profit: 0, orders: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate transaction data by date
    transactions.forEach((transaction) => {
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        const dateKey = new Date(transaction.timestamp)
          .toISOString()
          .split("T")[0];
        const existing = dailyData.get(dateKey);

        if (existing) {
          const totalRefunded =
            transaction.refunds?.reduce(
              (sum, refund) => sum + refund.totalAmount,
              0,
            ) || 0;
          const netAmount = Math.max(0, transaction.total - totalRefunded);

          const transactionProfit = transaction.items.reduce(
            (sum, item) =>
              sum + (item.unitPrice - item.originalPrice) * item.quantity,
            0,
          );

          const refundedProfit =
            transaction.refunds?.reduce((refundTotal, refund) => {
              return (
                refundTotal +
                refund.items.reduce((refundItemTotal, refundItem) => {
                  const originalItem = transaction.items[refundItem.itemIndex];
                  if (originalItem) {
                    return (
                      refundItemTotal +
                      (originalItem.unitPrice - originalItem.originalPrice) *
                        refundItem.quantity
                    );
                  }
                  return refundItemTotal;
                }, 0)
              );
            }, 0) || 0;

          existing.revenue += netAmount;
          existing.profit += Math.max(0, transactionProfit - refundedProfit);
          existing.orders += 1;
        }
      }
    });

    // Convert to array and format dates
    return Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: data.revenue,
        profit: data.profit,
        orders: data.orders,
      }))
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
  };

  // Calculate payment method chart data
  const calculatePaymentMethodChart = (
    methods: RevenueByMethod,
    totalRevenue: number,
  ): PaymentMethodChart[] => {
    return [
      {
        name: "Cash",
        value: methods.cash,
        percentage: totalRevenue > 0 ? (methods.cash / totalRevenue) * 100 : 0,
      },
      {
        name: "Scan",
        value: methods.scan,
        percentage: totalRevenue > 0 ? (methods.scan / totalRevenue) * 100 : 0,
      },
      {
        name: "Wallet",
        value: methods.wallet,
        percentage:
          totalRevenue > 0 ? (methods.wallet / totalRevenue) * 100 : 0,
      },
      {
        name: "COD",
        value: methods.cod,
        percentage: totalRevenue > 0 ? (methods.cod / totalRevenue) * 100 : 0,
      },
    ].filter((item) => item.value > 0);
  };

  // Calculate order status chart data
  const calculateOrderStatusChart = (
    stats: DashboardStats,
  ): OrderStatusChart[] => {
    const total = stats.totalOrders;
    return [
      {
        name: "Completed",
        value: stats.completedOrders,
        percentage: total > 0 ? (stats.completedOrders / total) * 100 : 0,
      },
      {
        name: "Pending",
        value: stats.pendingOrders,
        percentage: total > 0 ? (stats.pendingOrders / total) * 100 : 0,
      },
      {
        name: "Cancelled",
        value: stats.cancelledOrders,
        percentage: total > 0 ? (stats.cancelledOrders / total) * 100 : 0,
      },
      {
        name: "Refund Payments",
        value: stats.refundPayments,
        percentage: total > 0 ? (stats.refundPayments / total) * 100 : 0,
      },
      {
        name: "Partial Refunds",
        value: stats.partialRefunds,
        percentage: total > 0 ? (stats.partialRefunds / total) * 100 : 0,
      },
    ].filter((item) => item.value > 0);
  };

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // Calculate date range
      const getDateRange = (range: string) => {
        const now = new Date();
        let calcStartDate: Date;
        let calcEndDate: Date = now;

        // Use custom dates if available and range is custom
        if (range === "custom" && startDate && endDate) {
          calcStartDate = new Date(startDate);
          calcEndDate = new Date(endDate);
          // Set end date to end of day
          calcEndDate.setHours(23, 59, 59, 999);
        } else {
          switch (range) {
            case "today":
              calcStartDate = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
              );
              break;
            case "7d":
              calcStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case "30d":
              calcStartDate = new Date(
                now.getTime() - 30 * 24 * 60 * 60 * 1000,
              );
              break;
            case "90d":
              calcStartDate = new Date(
                now.getTime() - 90 * 24 * 60 * 60 * 1000,
              );
              break;
            default:
              calcStartDate = new Date(
                now.getTime() - 30 * 24 * 60 * 60 * 1000,
              );
          }
        }

        return { startDate: calcStartDate, endDate: calcEndDate };
      };

      // Fetch all data in parallel (include shops to resolve branch names/ids)
      const [transactions, stocks, customers, expensesRes, shopsData] =
        await Promise.all([
          transactionService.getTransactions(),
          StockService.getAllStocks(),
          CustomerService.getAllCustomers(),
          fetch("/api/expenses"),
          ShopService.getAllShops(),
        ]);

      const expensesJson = await expensesRes.json();
      const expenses = expensesJson?.success ? expensesJson.data : [];
      // Ensure local shops state is up-to-date for the UI
      if (shopsData && Array.isArray(shopsData)) {
        setShops(shopsData || []);
      }

      const { startDate: rangeStartDate, endDate: rangeEndDate } =
        getDateRange(dateRange);

      // Filter transactions by date range and branch
      let filteredTransactions = transactions.filter(
        (t) =>
          new Date(t.timestamp) >= rangeStartDate &&
          new Date(t.timestamp) <= rangeEndDate,
      );

      if (filterBranch && filterBranch !== "all") {
        filteredTransactions = filteredTransactions.filter(
          (t) => t.branchName === filterBranch,
        );
      }

      // Calculate previous period for growth comparison
      const periodDays = Math.ceil(
        (rangeEndDate.getTime() - rangeStartDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const previousStartDate = new Date(
        rangeStartDate.getTime() - periodDays * 24 * 60 * 60 * 1000,
      );

      const previousTransactions = transactions.filter((t) => {
        const date = new Date(t.timestamp);
        return date >= previousStartDate && date < rangeStartDate;
      });

      // Filter expenses by date range
      const filteredExpenses = expenses.filter((e: { date: string }) => {
        const d = new Date(e.date);
        return d >= rangeStartDate && d <= rangeEndDate;
      });

      // Filter stocks by selected branch so low-stock counts respect branch filter
      let stocksForStats = stocks;
      if (filterBranch && filterBranch !== "all") {
        const branchShop = (shopsData || shops).find(
          (s) => s.name === filterBranch || s.id === filterBranch,
        );
        const branchId = branchShop?.id;
        stocksForStats = stocks.filter(
          (s) =>
            s.shop === filterBranch ||
            s.shop === branchId ||
            (!s.shop && filterBranch === "Main Branch") ||
            (s.shop === "" && filterBranch === "Main Branch"),
        );
      }

      // Calculate stats
      const dashboardStats = calculateStats(
        filteredTransactions,
        previousTransactions,
        stocksForStats,
        customers,
        rangeStartDate,
        filteredExpenses,
      );

      const paymentMethods = calculateRevenueByMethod(filteredTransactions);
      const products = calculateTopProducts(filteredTransactions);
      const activities = generateRecentActivity(
        filteredTransactions,
        customers,
      );

      // Calculate chart data
      const dailyRevenue = calculateDailyRevenue(
        filteredTransactions,
        rangeStartDate,
        rangeEndDate,
      );
      const paymentChart = calculatePaymentMethodChart(
        paymentMethods,
        dashboardStats.totalRevenue,
      );
      const statusChart = calculateOrderStatusChart(dashboardStats);

      setStats(dashboardStats);
      setRevenueByMethod(paymentMethods);
      setTopProducts(products);
      setRecentActivity(activities);
      setDailyRevenueData(dailyRevenue);
      setPaymentMethodChartData(paymentChart);
      setOrderStatusChartData(statusChart);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, filterBranch, startDate, endDate]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // Calculate dashboard statistics
  const calculateStats = (
    transactions: Transaction[],
    previousTransactions: Transaction[],
    stocks: StockItem[],
    customers: Customer[],
    startDate: Date,
    expenses: Expense[] = [],
  ): DashboardStats => {
    let totalRevenue = 0;
    let totalRevenueMMK = 0;
    let totalRevenueTHB = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let completedOrders = 0;
    let pendingOrders = 0;
    let cancelledOrders = 0;
    let refundPayments = 0;
    let partialRefunds = 0;
    let totalExpenseTHB = 0;
    let totalExpenseMMK = 0;

    transactions.forEach((transaction) => {
      const totalRefunded =
        transaction.refunds?.reduce(
          (sum, refund) => sum + refund.totalAmount,
          0,
        ) || 0;
      const netAmount = Math.max(0, transaction.total - totalRefunded);

      // Only count completed, partially_refunded, and refunded for revenue
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        totalRevenue += netAmount;

        const currency = (transaction.sellingCurrency || "THB").toUpperCase();
        if (currency === "MMK") totalRevenueMMK += netAmount;
        else totalRevenueTHB += netAmount;

        // Calculate profit
        const transactionProfit = transaction.items.reduce(
          (itemTotal, item) => {
            return (
              itemTotal + (item.unitPrice - item.originalPrice) * item.quantity
            );
          },
          0,
        );

        const refundedProfit =
          transaction.refunds?.reduce((refundTotal, refund) => {
            return (
              refundTotal +
              refund.items.reduce((refundItemTotal, refundItem) => {
                const originalItem = transaction.items[refundItem.itemIndex];
                if (originalItem) {
                  return (
                    refundItemTotal +
                    (originalItem.unitPrice - originalItem.originalPrice) *
                      refundItem.quantity
                  );
                }
                return refundItemTotal;
              }, 0)
            );
          }, 0) || 0;

        totalProfit += Math.max(0, transactionProfit - refundedProfit);
      }

      // Count items sold
      transaction.items.forEach((item) => {
        totalItemsSold += item.quantity;
      });

      // Status counts
      switch (transaction.status) {
        case "completed":
          completedOrders++;
          break;
        case "pending":
          pendingOrders++;
          break;
        case "cancelled":
          cancelledOrders++;
          break;
        case "refunded":
          refundPayments++;
          break;
        case "partially_refunded":
          partialRefunds++;
          break;
      }
    });

    // Calculate previous period stats for growth
    let previousRevenue = 0;
    previousTransactions.forEach((transaction) => {
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        const totalRefunded =
          transaction.refunds?.reduce(
            (sum, refund) => sum + refund.totalAmount,
            0,
          ) || 0;
        previousRevenue += Math.max(0, transaction.total - totalRefunded);
      }
    });

    const revenueGrowth =
      previousRevenue > 0
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
        : totalRevenue > 0
          ? 100
          : 0;

    const ordersGrowth =
      previousTransactions.length > 0
        ? ((transactions.length - previousTransactions.length) /
            previousTransactions.length) *
          100
        : transactions.length > 0
          ? 100
          : 0;

    // Customer stats
    const newCustomers = customers.filter(
      (c) => new Date(c.createdAt) >= startDate,
    ).length;

    const previousNewCustomers = customers.filter((c) => {
      const createdDate = new Date(c.createdAt);
      const periodDays = Math.ceil(
        (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const previousStartDate = new Date(
        startDate.getTime() - periodDays * 24 * 60 * 60 * 1000,
      );
      return createdDate >= previousStartDate && createdDate < startDate;
    }).length;

    const customersGrowth =
      previousNewCustomers > 0
        ? ((newCustomers - previousNewCustomers) / previousNewCustomers) * 100
        : newCustomers > 0
          ? 100
          : 0;

    // Stock stats
    // Count low-stock at variant level (variants with total quantity >0 and <=10)
    const lowStockVariantCount = stocks.reduce((count, stock) => {
      const variantLowCount = stock.colorVariants.reduce((vCount, variant) => {
        const variantTotal = variant.sizeQuantities.reduce(
          (sizeSum, sq) => sizeSum + sq.quantity,
          0,
        );
        return vCount + (variantTotal > 0 && variantTotal <= 10 ? 1 : 0);
      }, 0);
      return count + variantLowCount;
    }, 0);

    const lowStockProducts = lowStockVariantCount;

    const averageOrderValue =
      transactions.length > 0 ? totalRevenue / transactions.length : 0;

    // Sum expenses by currency
    (expenses || []).forEach((exp) => {
      if (!exp) return;
      if (exp.currency === "THB") totalExpenseTHB += exp.amount || 0;
      else if (exp.currency === "MMK") totalExpenseMMK += exp.amount || 0;
    });

    return {
      totalRevenue,
      totalRevenueMMK,
      totalRevenueTHB,
      totalProfit,
      totalOrders: transactions.length,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      refundPayments,
      partialRefunds,
      totalExpenseTHB,
      totalExpenseMMK,
      totalCustomers: customers.length,
      newCustomers,
      totalProducts: stocks.length,
      lowStockProducts,
      totalItemsSold,
      revenueGrowth,
      ordersGrowth,
      customersGrowth,
      averageOrderValue,
    };
  };

  // Calculate revenue by payment method
  const calculateRevenueByMethod = (
    transactions: Transaction[],
  ): RevenueByMethod => {
    const methods: RevenueByMethod = { cash: 0, scan: 0, wallet: 0, cod: 0 };

    transactions.forEach((transaction) => {
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        const totalRefunded =
          transaction.refunds?.reduce(
            (sum, refund) => sum + refund.totalAmount,
            0,
          ) || 0;
        const netAmount = Math.max(0, transaction.total - totalRefunded);

        switch (transaction.paymentMethod) {
          case "cash":
            methods.cash += netAmount;
            break;
          case "scan":
            methods.scan += netAmount;
            break;
          case "wallet":
            methods.wallet += netAmount;
            break;
          case "cod":
            methods.cod += netAmount;
            break;
        }
      }
    });

    return methods;
  };

  // Calculate top selling products
  const calculateTopProducts = (transactions: Transaction[]): TopProduct[] => {
    const productMap = new Map<
      string,
      {
        name: string;
        category: string;
        quantity: number;
        revenue: number;
        profit: number;
      }
    >();

    transactions.forEach((transaction) => {
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        transaction.items.forEach((item) => {
          const key = `${item.groupName}-${item.selectedColor || "default"}`;
          const existing = productMap.get(key);
          const itemRevenue = item.unitPrice * item.quantity;
          const itemProfit =
            (item.unitPrice - item.originalPrice) * item.quantity;

          if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += itemRevenue;
            existing.profit += itemProfit;
          } else {
            productMap.set(key, {
              name: `${item.groupName}${
                item.selectedColor ? ` (${item.selectedColor})` : ""
              }`,
              category: item.groupName,
              quantity: item.quantity,
              revenue: itemRevenue,
              profit: itemProfit,
            });
          }
        });
      }
    });

    const products: TopProduct[] = Array.from(productMap.entries()).map(
      ([id, data]) => ({
        id,
        name: data.name,
        category: data.category,
        quantitySold: data.quantity,
        revenue: data.revenue,
        profit: data.profit,
      }),
    );

    return products.sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  };

  // Generate recent activity
  const generateRecentActivity = (
    transactions: Transaction[],
    customers: Customer[],
  ): RecentActivity[] => {
    const activities: RecentActivity[] = [];

    // Recent transactions
    transactions
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 5)
      .forEach((transaction) => {
        activities.push({
          id: transaction.id || "",
          type:
            transaction.status === "refunded" ||
            transaction.status === "partially_refunded"
              ? "refund"
              : "sale",
          description: `${
            transaction.status === "refunded" ? "Refund" : "Sale"
          } #${transaction.transactionId} - ${
            transaction.customer?.displayName || "Walk-in"
          }`,
          timestamp: new Date(transaction.timestamp),
          amount: transaction.total,
          status: transaction.status,
        });
      });

    // Recent customers (last 3)
    customers
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3)
      .forEach((customer) => {
        activities.push({
          id: customer.uid,
          type: "customer",
          description: `New customer: ${customer.displayName}`,
          timestamp: new Date(customer.createdAt),
        });
      });

    // Sort all activities by timestamp
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  };

  // Format time ago
  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityIcon = (type: string, status?: string) => {
    switch (type) {
      case "sale":
        return status === "completed" ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : status === "pending" ? (
          <Clock className="h-4 w-4 text-yellow-600" />
        ) : (
          <ShoppingCart className="h-4 w-4 text-blue-600" />
        );
      case "refund":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "customer":
        return <User className="h-4 w-4 text-purple-600" />;
      case "stock":
        return <Package className="h-4 w-4 text-orange-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar (hidden on small screens) */}
      <div className="hidden md:block">
        <Sidebar
          activeItem="dashboard"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar overlay */}
      <div className="md:hidden">
        <Sidebar
          activeItem="dashboard"
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
            {/* Header */}
            <div className="mb-8">
              {/* <div className="mb-4">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Owner Dashboard
                </h1>
                <p className="text-gray-600">
                  Comprehensive analytics and performance metrics for your
                  clothing store
                </p>
              </div> */}

              {/* Filters */}
              <div className="flex flex-wrap gap-4">
                <select
                  title="Filter by Branch"
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="all">All Branches</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.name}>
                      {shop.name}
                    </option>
                  ))}
                </select>
                <select
                  title="Date Range"
                  value={dateRange}
                  onChange={(e) => {
                    const range = e.target.value as
                      | "today"
                      | "7d"
                      | "30d"
                      | "90d"
                      | "custom";
                    setDateRange(range);

                    // Auto-set dates based on quick range selection
                    if (range !== "custom") {
                      const end = new Date();
                      const start = new Date();

                      switch (range) {
                        case "today":
                          // Start and end are today
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

                      setStartDate(start.toISOString().split("T")[0]);
                      setEndDate(end.toISOString().split("T")[0]);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300  focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="custom">Custom Range</option>
                </select>

                {/* Custom Date Range Inputs */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDateRange("custom");
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    max={endDate}
                    aria-label="Start Date"
                    placeholder="Start Date"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDateRange("custom");
                    }}
                    className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    min={startDate}
                    max={new Date().toISOString().split("T")[0]}
                    aria-label="End Date"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                
                {/* Key Performance Indicators */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {/* Total Revenue */}
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Sales
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatPrice(stats.totalRevenue)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Total Profit */}
                  <div className="bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Profit
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatPrice(stats.totalProfit)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Total Orders */}
                  <div className="bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Orders
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {stats.totalOrders}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Total Customers */}
                  <div className="bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Customers
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {stats.totalCustomers}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <hr className="text-gray-300 p-3"></hr>
                </div>

                {/* Currency Specific Totals */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Sales (฿)
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatPrice(stats.totalRevenueTHB || 0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Sale (Ks)
                        </p>
                        <p className="text-2xl font-bold text-purple-600">
                          {SettingsService.formatPrice(
                            stats.totalRevenueMMK || 0,
                            "MMK",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Expense (฿)
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {formatPrice(stats.totalExpenseTHB || 0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Expense (Ks)
                        </p>
                        <p className="text-2xl font-bold text-purple-600">
                          {SettingsService.formatPrice(
                            stats.totalExpenseMMK || 0,
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

                {/* Secondary Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {/* Average Order Value */}
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Avg Order Value
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatPrice(stats.averageOrderValue)}
                        </p>
                      </div>
                      <BarChart3 className="h-6 w-6 text-gray-400" />
                    </div>
                  </div>

                  {/* Items Sold */}
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Items Sold
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {stats.totalItemsSold}
                        </p>
                      </div>
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  </div>

                  {/* Total Products */}
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Total Products
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {stats.totalProducts}
                        </p>
                      </div>
                      <Store className="h-6 w-6 text-gray-400" />
                    </div>
                  </div>

                  {/* Low Stock Alert */}
                  <div className="bg-white p-6  shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Low Stock Items
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {stats.lowStockProducts}
                        </p>
                      </div>
                      <AlertCircle className="h-6 w-6 text-orange-600" />
                    </div>
                  </div>
                </div>
                
                <div>
                  <hr className="text-gray-300 p-3"></hr>
                </div>

                {/* Order Status Breakdown */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Order Status Breakdown
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Completed
                        </p>
                        <p className="text-2xl font-bold text-green-600">
                          {stats.completedOrders}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalOrders > 0
                            ? (
                                (stats.completedOrders / stats.totalOrders) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Pending
                        </p>
                        <p className="text-2xl font-bold text-yellow-600">
                          {stats.pendingOrders}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalOrders > 0
                            ? (
                                (stats.pendingOrders / stats.totalOrders) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                      <Clock className="h-8 w-8 text-yellow-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Cancelled
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {stats.cancelledOrders}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalOrders > 0
                            ? (
                                (stats.cancelledOrders / stats.totalOrders) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                      <XCircle className="h-8 w-8 text-red-600" />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Refund Payments
                        </p>
                        <p className="text-2xl font-bold text-purple-600">
                          {stats.refundPayments}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalOrders > 0
                            ? (
                                (stats.refundPayments / stats.totalOrders) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                      <AlertCircle className="h-8 w-8 text-purple-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Partial Refunds
                        </p>
                        <p className="text-2xl font-bold te900xt-indigo-600">
                          {stats.partialRefunds}900
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalOrders > 0
                            ? (
                                (stats.partialRefunds / stats.totalOrders) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total
                        </p>
                      </div>
                      <XCircle className="h-8 w-8 text-indigo-600" />
                    </div>
                  </div>
                </div>

                {/* Revenue by Payment Method */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Total Sale by Payment Method
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Cash
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatPrice(revenueByMethod.cash)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalRevenue > 0
                            ? (
                                (revenueByMethod.cash / stats.totalRevenue) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total sale
                        </p>
                      </div>
                      <DollarSign className="h-6 w-6 text-gray-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Scan
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatPrice(revenueByMethod.scan)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalRevenue > 0
                            ? (
                                (revenueByMethod.scan / stats.totalRevenue) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total sale
                        </p>
                      </div>
                      <ShoppingCart className="h-6 w-6 text-gray-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Wallet
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatPrice(revenueByMethod.wallet)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalRevenue > 0
                            ? (
                                (revenueByMethod.wallet / stats.totalRevenue) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total sale
                        </p>
                      </div>
                      <Package className="h-6 w-6 text-gray-600" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-500">COD</p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatPrice(revenueByMethod.cod)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stats.totalRevenue > 0
                            ? (
                                (revenueByMethod.cod / stats.totalRevenue) *
                                100
                              ).toFixed(1)
                            : 0}
                          % of total sale
                        </p>
                      </div>
                      <Calendar className="h-6 w-6 text-gray-600" />
                    </div>
                  </div>
                </div>

                {/* Data Visualization Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Revenue & Profit Trend Chart */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Total Sale & Profit Trend
                    </h2>
                    {dailyRevenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={dailyRevenueData}>
                          <defs>
                            <linearGradient
                              id="colorRevenue"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#3b82f6"
                                stopOpacity={0.8}
                              />
                              <stop
                                offset="95%"
                                stopColor="#3b82f6"
                                stopOpacity={0.1}
                              />
                            </linearGradient>
                            <linearGradient
                              id="colorProfit"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#10b981"
                                stopOpacity={0.8}
                              />
                              <stop
                                offset="95%"
                                stopColor="#10b981"
                                stopOpacity={0.1}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            stroke="#6b7280"
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            stroke="#6b7280"
                            tickFormatter={(value) => `$${value}`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "8px",
                            }}
                            formatter={(value: number | undefined) =>
                              value !== undefined ? formatPrice(value) : "N/A"
                            }
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#3b82f6"
                            fillOpacity={1}
                            fill="url(#colorRevenue)"
                            name="Total Sale"
                          />
                          <Area
                            type="monotone"
                            dataKey="profit"
                            stroke="#10b981"
                            fillOpacity={1}
                            fill="url(#colorProfit)"
                            name="Profit"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16">
                        <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No data available</p>
                      </div>
                    )}
                  </div>

                  {/* Payment Method Distribution Pie Chart */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Payment Method Distribution
                    </h2>
                    {paymentMethodChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={
                              paymentMethodChartData as unknown as Array<
                                Record<string, string | number>
                              >
                            }
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                            label
                          >
                            {paymentMethodChartData.map((entry, index) => {
                              const COLORS = [
                                "#3b82f6",
                                "#10b981",
                                "#f59e0b",
                                "#8b5cf6",
                              ];
                              return (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              );
                            })}
                          </Pie>
                          <Tooltip
                            formatter={(value: number | undefined) =>
                              value !== undefined ? formatPrice(value) : "N/A"
                            }
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16">
                        <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">
                          No payment data available
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Order Status Distribution Bar Chart */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Order Status Distribution
                    </h2>
                    {orderStatusChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={orderStatusChartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12 }}
                            stroke="#6b7280"
                          />
                          <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "8px",
                            }}
                            formatter={(value?: number, name?: string) => {
                              if (value === undefined) return "N/A";
                              if (name === "value") {
                                return [`${value} orders`, "Count"];
                              }
                              return value;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="value" name="Orders">
                            {orderStatusChartData.map((entry, index) => {
                              const COLORS = {
                                Completed: "#10b981",
                                Pending: "#f59e0b",
                                Cancelled: "#ef4444",
                                Refunded: "#8b5cf6",
                              };
                              return (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={
                                    COLORS[entry.name as keyof typeof COLORS] ||
                                    "#6b7280"
                                  }
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16">
                        <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No order data available</p>
                      </div>
                    )}
                  </div>

                  {/* Daily Orders Trend Line Chart */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Daily Orders Trend
                    </h2>
                    {dailyRevenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dailyRevenueData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            stroke="#6b7280"
                          />
                          <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "8px",
                            }}
                            formatter={(value?: number) =>
                              value !== undefined
                                ? [`${value} orders`, "Orders"]
                                : ["N/A", "Orders"]
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="orders"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={{ fill: "#8b5cf6", r: 4 }}
                            activeDot={{ r: 6 }}
                            name="Daily Orders"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16">
                        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No order data available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Charts and Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Top Selling Products */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Top Selling Products
                    </h2>
                    {topProducts.length > 0 ? (
                      <div className="space-y-4">
                        {topProducts.map((product, index) => (
                          <div
                            key={product.id}
                            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-bold">
                                #{index + 1}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {product.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {product.category}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">
                                {formatPrice(product.revenue)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {product.quantitySold} sold
                              </p>
                              <p className="text-xs text-green-600">
                                Profit: {formatPrice(product.profit)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Package className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No sales data available</p>
                      </div>
                    )}
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Recent Activity
                    </h2>
                    {recentActivity.length > 0 ? (
                      <div className="space-y-4">
                        {recentActivity.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-start space-x-3"
                          >
                            <div className="flex-shrink-0 mt-1">
                              <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                                {getActivityIcon(
                                  activity.type,
                                  activity.status,
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {activity.description}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatTimeAgo(activity.timestamp)}
                              </p>
                            </div>
                            {activity.amount && (
                              <div className="flex-shrink-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {formatPrice(activity.amount)}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Clock className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  return (
    <ProtectedRoute requiredRole="owner">
      <OwnerDashboardContent />
    </ProtectedRoute>
  );
}
