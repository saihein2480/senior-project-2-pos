"use client";

import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { detectColorName } from "@/lib/colorUtils";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import Link from "next/link";
import {
  Package,
  BarChart3,
  ShoppingCart,
  User,
  RefreshCw,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Wallet,
  Receipt,
  TrendingUp,
  Coins,
  Banknote,
  QrCode,
  Truck,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { transactionService, Transaction } from "@/services/transactionService";
import { ChartCard } from "@/components/analytics/ChartCard";
import {
  getNetProfit,
  getNetRevenue,
  getSellingPrice,
  isRevenueTransaction,
  calculateChannelSplit,
  calculateDailyNetMargin,
  calculatePromotedProducts,
  calculateReturnRateBySize,
  calculateRevenueSeries,
  calculateSellThroughBySize,
  calculateStaffPerformance,
  chooseTimeGrain,
  grainLabel,
  type ChannelSplitPoint,
  type DailyNetMargin,
  type PromotedProduct,
  type RevenueSeriesPoint,
  type SizeReturnRate,
  type SizeSellThrough,
  type StaffPerformance,
  type TimeGrain,
} from "@/lib/analytics/retailAnalytics";
import { timeAxisProps } from "@/components/analytics/timeAxis";
import { SellThroughBySizeChart } from "@/components/analytics/SellThroughBySizeChart";
import { NetMarginChart } from "@/components/analytics/NetMarginChart";
import { ReturnRateBySizeChart } from "@/components/analytics/ReturnRateBySizeChart";
import { StaffPerformanceChart } from "@/components/analytics/StaffPerformanceChart";
import { ChannelSplitChart } from "@/components/analytics/ChannelSplitChart";
import { PromotionRevenueByProductChart } from "@/components/analytics/PromotionRevenueByProductChart";
import { StockService } from "@/services/stockService";
import { CustomerService } from "@/services/customerService";
import { ShopService } from "@/services/shopService";
import { StockItem } from "@/types/stock";
import { Customer } from "@/types/customer";
import { authFetch } from "@/lib/authFetch";
import {
  LEGACY_UNASSIGNED_BRANCH_NAME,
  branchKey,
  matchesBranch,
  resolveBranchFilter,
  toBranchRefs,
} from "@/lib/branch";

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
  netProfitTHB: number;
  netProfitMMK: number;
  remainingStockValueUnitPriceTHB: number;
  remainingStockValueUnitPriceMMK: number;
  remainingStockValueOriginalPriceTHB: number;
  remainingStockValueOriginalPriceMMK: number;
}

/** Sales by how the customer paid. */
interface RevenueByMethod {
  /** Walk-in cash at the till. */
  cash: number;
  /** Storefront QR payment ("scan", or "wallet" on older records). */
  onlineQr: number;
  /** Cash on delivery. */
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

type OrderStatusKey =
  | "completed"
  | "pending"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

/**
 * One bar of the order status chart.
 *
 * Holds the Firestore status `key` and the raw counts only — the axis label is
 * resolved at render time. Two reasons: the colour map used to be keyed on the
 * English display text, so renaming or translating a label silently dropped that
 * bar to the fallback grey; and the data is built inside the loader, which does
 * not re-run when the user switches language, so a label baked in here would go
 * stale until the next refresh.
 */
interface OrderStatusChart {
  key: OrderStatusKey;
  value: number;
  percentage: number;
}

/**
 * Bar colour per status, keyed on the Firestore value rather than the label.
 *
 * Green reads as money earned, amber as waiting on someone, red as lost, and the
 * two refund states share a purple family so they group visually while staying
 * distinguishable.
 */
const STATUS_COLORS: Record<OrderStatusKey, string> = {
  completed: "#10b981",
  pending: "#f59e0b",
  cancelled: "#ef4444",
  partially_refunded: "#a78bfa",
  refunded: "#7c3aed",
};

interface Expense {
  date: string;
  currency?: "THB" | "MMK" | string;
  amount?: number;
}

/** Totals for the period before the selected one, for the growth chips. */
interface PeriodTotals {
  revenue: number;
  profit: number;
  orders: number;
}

/** 12_300 -> "12.3K", for chart axes where full prices would crowd. */
const compactNumber = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

/**
 * Percentage change, or null when there is no earlier figure to compare with
 * (a jump from zero has no meaningful percentage).
 */
const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

/** Up/down chip for a KPI; hidden when there is nothing to compare with. */
function GrowthChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const tone =
    rounded > 0
      ? "bg-emerald-50 text-emerald-700"
      : rounded < 0
        ? "bg-red-50 text-red-700"
        : "bg-gray-100 text-gray-600";
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(rounded).toFixed(1)}%
    </span>
  );
}

/** One headline number: label, value, and a short line of context. */
function KpiCard({
  label,
  value,
  icon: Icon,
  valueClassName = "text-gray-900",
  children,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  valueClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-bold tracking-tight tabular ${valueClassName}`}>
        {value}
      </p>
      {children && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          {children}
        </div>
      )}
    </div>
  );
}

/** Plain white card with a title row, used by the overview panels. */
function Panel({
  title,
  aside,
  className = "",
  children,
}: {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function OwnerDashboardContent() {
  const { formatPrice } = useCurrency();
  const { businessSettings, branch: currentBranch } = useSettings();
  const { t } = useLanguage();
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
    netProfitTHB: 0,
    netProfitMMK: 0,
    remainingStockValueUnitPriceTHB: 0,
    remainingStockValueUnitPriceMMK: 0,
    remainingStockValueOriginalPriceTHB: 0,
    remainingStockValueOriginalPriceMMK: 0,
  });
  const [revenueByMethod, setRevenueByMethod] = useState<RevenueByMethod>({
    cash: 0,
    onlineQr: 0,
    cod: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dailyRevenueData, setDailyRevenueData] = useState<RevenueSeriesPoint[]>(
    [],
  );
  /**
   * Promoted products, ranked by the revenue they actually earned.
   *
   * Replaces the previous promotion-versus-revenue time series, which could only
   * show that discounting and revenue moved together in the same period. That
   * told the owner nothing about *which* promotion to repeat, because a single
   * strong product and twenty weak ones produce the same line.
   */
  const [promotedProducts, setPromotedProducts] = useState<PromotedProduct[]>(
    [],
  );
  /**
   * Bucket size the time-series charts are currently aggregated to.
   *
   * Surfaced in the UI because a chart silently switching from daily to
   * quarterly totals would otherwise look like revenue had jumped an order of
   * magnitude.
   */
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("day");
  const [orderStatusChartData, setOrderStatusChartData] = useState<
    OrderStatusChart[]
  >([]);

  // Retail analytics series (see src/lib/analytics/retailAnalytics.ts)
  const [sizeSellThrough, setSizeSellThrough] = useState<SizeSellThrough[]>([]);
  const [netMarginData, setNetMarginData] = useState<DailyNetMargin[]>([]);
  const [returnRateBySize, setReturnRateBySize] = useState<SizeReturnRate[]>(
    [],
  );
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>(
    [],
  );
  const [channelSplit, setChannelSplit] = useState<ChannelSplitPoint[]>([]);
  const [previousPeriod, setPreviousPeriod] = useState<PeriodTotals>({
    revenue: 0,
    profit: 0,
    orders: 0,
  });
  /** First load shows a skeleton; later refreshes keep the numbers on screen. */
  const [hasLoaded, setHasLoaded] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

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

  // Default the branch filter to this user's branch (by id; a legacy branch
  // that is not a shop falls back to its name). See src/lib/branch.ts.
  const currentBranchKey = branchKey(currentBranch);
  useEffect(() => {
    if (currentBranchKey) {
      setFilterBranch(currentBranchKey);
    }
  }, [currentBranchKey]);

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


  /**
   * Counts for the five transaction statuses, in lifecycle order.
   *
   * Every status is always returned, including the ones sitting at zero. A
   * previous version filtered empty statuses out, which made the chart change
   * shape between date ranges and — worse — made "no cancellations" and "we do
   * not track cancellations" look identical. A zero-height bar with a label is
   * information; a missing bar is not.
   */
  const calculateOrderStatusChart = (
    stats: DashboardStats,
  ): OrderStatusChart[] => {
    const total = stats.totalOrders;
    const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

    return [
      {
        key: "completed",
        value: stats.completedOrders,
        percentage: share(stats.completedOrders),
      },
      {
        key: "pending",
        value: stats.pendingOrders,
        percentage: share(stats.pendingOrders),
      },
      {
        key: "cancelled",
        value: stats.cancelledOrders,
        percentage: share(stats.cancelledOrders),
      },
      {
        key: "partially_refunded",
        value: stats.partialRefunds,
        percentage: share(stats.partialRefunds),
      },
      {
        key: "refunded",
        value: stats.refundPayments,
        percentage: share(stats.refundPayments),
      },
    ];
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
          authFetch("/api/expenses"),
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

      // Branch filter: id first, legacy names (current or former) as fallback.
      const branchFilter = resolveBranchFilter(
        filterBranch,
        toBranchRefs(shopsData || []),
      );
      if (branchFilter) {
        filteredTransactions = filteredTransactions.filter((t) =>
          matchesBranch(t, branchFilter),
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

      // Same branch as the current period, otherwise a single branch would be
      // compared against the whole business and growth would read as a drop.
      const previousTransactions = transactions.filter((t) => {
        const date = new Date(t.timestamp);
        return (
          date >= previousStartDate &&
          date < rangeStartDate &&
          (!branchFilter || matchesBranch(t, branchFilter))
        );
      });

      // Same definitions as the revenue series, so the chips compare like
      // with like.
      const previousPaid = previousTransactions.filter(isRevenueTransaction);
      setPreviousPeriod({
        revenue: previousPaid.reduce((sum, tx) => sum + getNetRevenue(tx), 0),
        profit: previousPaid.reduce((sum, tx) => sum + getNetProfit(tx), 0),
        orders: previousPaid.length,
      });

      // Filter expenses by date range
      const filteredExpenses = expenses.filter((e: { date: string }) => {
        const d = new Date(e.date);
        return d >= rangeStartDate && d <= rangeEndDate;
      });

      // Filter stocks by selected branch so low-stock counts respect branch filter
      // Stock rows with no branch at all count as "Main Branch" (legacy).
      let stocksForStats = stocks;
      if (branchFilter) {
        stocksForStats = stocks.filter((s) =>
          matchesBranch(s, branchFilter, {
            unassignedBranchName: LEGACY_UNASSIGNED_BRANCH_NAME,
          }),
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
        businessSettings?.currencyRate || 130,
      );

      const paymentMethods = calculateRevenueByMethod(filteredTransactions);
      const products = calculateTopProducts(
        filteredTransactions,
        stocksForStats,
      );
      const activities = generateRecentActivity(
        filteredTransactions,
        customers,
      );

      // One grain for every time series on the page, so the charts stack up
      // against each other and the badge describes all of them.
      const grain = chooseTimeGrain(rangeStartDate, rangeEndDate);
      setTimeGrain(grain);

      const dailyRevenue = calculateRevenueSeries(
        filteredTransactions,
        rangeStartDate,
        rangeEndDate,
        grain,
      );
      // Promoted products are ranked, not bucketed by time, so this needs no grain.
      const promoted = calculatePromotedProducts(filteredTransactions);
      const statusChart = calculateOrderStatusChart(dashboardStats);

      // Retail analytics. Stock-based series use the branch-filtered stock list
      // so sell-through matches the branch the owner is looking at.
      const currencyRate = businessSettings?.currencyRate || 130;

      setSizeSellThrough(
        calculateSellThroughBySize(filteredTransactions, stocksForStats),
      );
      setNetMarginData(
        calculateDailyNetMargin(
          filteredTransactions,
          filteredExpenses,
          rangeStartDate,
          rangeEndDate,
          currencyRate,
          grain,
        ),
      );
      setReturnRateBySize(calculateReturnRateBySize(filteredTransactions));
      setStaffPerformance(calculateStaffPerformance(filteredTransactions));
      setChannelSplit(
        calculateChannelSplit(
          filteredTransactions,
          rangeStartDate,
          rangeEndDate,
          grain,
        ),
      );

      setStats(dashboardStats);
      setRevenueByMethod(paymentMethods);
      setTopProducts(products);
      setRecentActivity(activities);
      setDailyRevenueData(dailyRevenue);
      setPromotedProducts(promoted);
      setOrderStatusChartData(statusChart);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
    // `businessSettings` is a real dependency: it supplies the currency rate for
    // net margin and the reward tiers for the points-liability estimate. It
    // arrives from context a beat after first paint, so without it here the
    // liability would stay empty until the owner changed a filter.
  }, [dateRange, filterBranch, startDate, endDate, businessSettings]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  /**
   * Status bars with their axis labels attached, resolved on every render so a
   * language switch takes effect immediately rather than waiting for a refetch.
   */
  const statusLabels: Record<OrderStatusKey, string> = {
    completed: t.completed,
    pending: t.pending,
    cancelled: t.cancelled,
    partially_refunded: t.partiallyRefunded,
    refunded: t.fullyRefunded,
  };

  const orderStatusChartRows = orderStatusChartData.map((row) => ({
    ...row,
    name: statusLabels[row.key],
  }));

  // Calculate dashboard statistics
  const calculateStats = (
    transactions: Transaction[],
    previousTransactions: Transaction[],
    stocks: StockItem[],
    customers: Customer[],
    startDate: Date,
    expenses: Expense[] = [],
    currencyRate: number = 130,
  ): DashboardStats => {
    let totalRevenue = 0;
    let totalRevenueMMK = 0;
    let totalRevenueTHB = 0;
    let totalProfit = 0;
    let totalProfitTHB = 0;
    let totalProfitMMK = 0;
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

        const baseProfit = Math.max(0, transactionProfit - refundedProfit);
        totalProfit += baseProfit;

        if (currency === "MMK") {
          const txRate = transaction.exchangeRate || currencyRate;
          totalProfitMMK += baseProfit * txRate;
        } else {
          totalProfitTHB += baseProfit;
        }
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

    // Convert stock stats to both currencies
    let remainingStockValueUnitPriceTHB = 0;
    let remainingStockValueOriginalPriceTHB = 0;

    stocks.forEach((stock) => {
      let totalStockQuantity = 0;
      stock.colorVariants.forEach((variant) => {
        totalStockQuantity += variant.sizeQuantities.reduce(
          (sizeSum, sq) => sizeSum + sq.quantity,
          0,
        );
      });
      remainingStockValueUnitPriceTHB += totalStockQuantity * stock.unitPrice;
      remainingStockValueOriginalPriceTHB +=
        totalStockQuantity * stock.originalPrice;
    });

    const remainingStockValueUnitPriceMMK =
      remainingStockValueUnitPriceTHB * currencyRate;
    const remainingStockValueOriginalPriceMMK =
      remainingStockValueOriginalPriceTHB * currencyRate;

    const netProfitTHB = totalProfitTHB - totalExpenseTHB;
    const netProfitMMK = totalProfitMMK - totalExpenseMMK;

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
      netProfitTHB,
      netProfitMMK,
      remainingStockValueUnitPriceTHB,
      remainingStockValueUnitPriceMMK,
      remainingStockValueOriginalPriceTHB,
      remainingStockValueOriginalPriceMMK,
    };
  };

  // Calculate revenue by payment method
  const calculateRevenueByMethod = (
    transactions: Transaction[],
  ): RevenueByMethod => {
    const methods: RevenueByMethod = { cash: 0, onlineQr: 0, cod: 0 };

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
          // The storefront's QR payment (MyanMyanPay) is stored as "scan";
          // "wallet" only appears on older records of the same thing.
          case "scan":
          case "wallet":
            methods.onlineQr += netAmount;
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
  const calculateTopProducts = (
    transactions: Transaction[],
    stocks: StockItem[],
  ): TopProduct[] => {
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

    // Create a lookup map for faster color name resolution
    const colorIdToNameMap = new Map<string, string>();
    stocks.forEach((stock) => {
      stock.colorVariants.forEach((variant) => {
        colorIdToNameMap.set(variant.id, variant.color);
      });
    });

    const isProbablyId = (s?: string) =>
      !!s &&
      (/(^cv|[-_].+-)/.test(s) || // Original ID patterns
        /^\d{13,}/.test(s) || // Long numeric IDs (timestamps)
        /^[a-f0-9]{16,}$/i.test(s) || // Long hex IDs
        /^\d+[a-z]{5,}$/i.test(s)); // Timestamp + random chars

    transactions.forEach((transaction) => {
      if (
        transaction.status === "completed" ||
        transaction.status === "partially_refunded" ||
        transaction.status === "refunded"
      ) {
        transaction.items.forEach((item) => {
          const key = `${item.groupName}-${item.selectedColor || "default"}`;
          const existing = productMap.get(key);
          // The price actually charged (after promotions), matching the KPIs.
          const sellingPrice = getSellingPrice(item);
          const itemRevenue = sellingPrice * item.quantity;
          const itemProfit =
            (sellingPrice - item.originalPrice) * item.quantity;

          let displayColorName = item.selectedColor;
          if (item.selectedColor) {
            if (colorIdToNameMap.has(item.selectedColor)) {
              displayColorName = colorIdToNameMap.get(item.selectedColor);
            } else if (isProbablyId(item.selectedColor)) {
              try {
                // If it looks like an ID or hex, try to detect it from the code or fallback
                displayColorName = item.colorCode
                  ? detectColorName(item.colorCode)
                  : detectColorName(item.selectedColor) || item.selectedColor;
              } catch {
                displayColorName = item.selectedColor;
              }
            }
          }

          if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += itemRevenue;
            existing.profit += itemProfit;
          } else {
            productMap.set(key, {
              name: `${item.groupName}${
                displayColorName ? ` (${displayColorName})` : ""
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
          <Clock className="h-4 w-4 text-gray-500" />
        ) : (
          <ShoppingCart className="h-4 w-4 text-rose-600" />
        );
      case "refund":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "customer":
        return <User className="h-4 w-4 text-rose-500" />;
      case "stock":
        return <Package className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };


  // ---------------------------------------------------------------------
  // Figures for the overview. Everything comes from the same per-transaction
  // helpers as the revenue series, so cards, chart and growth agree.
  // ---------------------------------------------------------------------
  const periodTotals = dailyRevenueData.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      profit: acc.profit + row.profit,
      orders: acc.orders + row.orders,
    }),
    { revenue: 0, profit: 0, orders: 0 },
  );
  const periodExpenses = netMarginData.reduce(
    (sum, row) => sum + row.expense,
    0,
  );
  const netProfit = periodTotals.profit - periodExpenses;
  const profitMargin =
    periodTotals.revenue > 0
      ? (periodTotals.profit / periodTotals.revenue) * 100
      : 0;
  const averageOrder =
    periodTotals.orders > 0 ? periodTotals.revenue / periodTotals.orders : 0;

  const revenueGrowth = percentChange(
    periodTotals.revenue,
    previousPeriod.revenue,
  );
  const profitGrowth = percentChange(
    periodTotals.profit,
    previousPeriod.profit,
  );
  const ordersGrowth = percentChange(
    periodTotals.orders,
    previousPeriod.orders,
  );

  const paymentRows: {
    key: string;
    label: string;
    value: number;
    icon: LucideIcon;
  }[] = [
    { key: "cash", label: t.cash, value: revenueByMethod.cash, icon: Banknote },
    { key: "onlineQr", label: t.onlineQrPayment, value: revenueByMethod.onlineQr, icon: QrCode },
    { key: "cod", label: t.cod, value: revenueByMethod.cod, icon: Truck },
  ];
  const paymentTotal = paymentRows.reduce((sum, row) => sum + row.value, 0);

  const rangePresets: { value: typeof dateRange; label: string }[] = [
    { value: "today", label: t.today },
    { value: "7d", label: t.last7Days },
    { value: "30d", label: t.last30Days },
    { value: "90d", label: t.last90Days },
    { value: "custom", label: t.customRange },
  ];

  const applyRange = (range: typeof dateRange) => {
    setDateRange(range);
    if (range === "custom") return;

    const end = new Date();
    const start = new Date();
    if (range === "7d") start.setDate(start.getDate() - 7);
    if (range === "30d") start.setDate(start.getDate() - 30);
    if (range === "90d") start.setDate(start.getDate() - 90);

    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const formatDay = (value: string) =>
    value
      ? new Date(value).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";
  const periodLabel =
    startDate === endDate
      ? formatDay(startDate)
      : `${formatDay(startDate)} – ${formatDay(endDate)}`;

  const hasSales = periodTotals.orders > 0;

  return (
    <div className="flex h-screen bg-canvas">
      {/* Desktop sidebar (hidden on small screens) */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="dashboard"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar overlay */}
      <div className="lg:hidden">
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
          <div className="max-w-screen-2xl mx-auto space-y-6">
            {/* ================= Header & filters ================= */}
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  {t.dashboard}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {t.dashboardSubtitle}{" "}
                  <span className="font-medium text-gray-700">{periodLabel}</span>
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {/* Period */}
                <div
                  role="radiogroup"
                  aria-label={t.customRange}
                  className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
                >
                  {rangePresets.map((preset) => {
                    const isActive = dateRange === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => applyRange(preset.value)}
                        className={`h-8 flex-shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                          isActive
                            ? "bg-brand text-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Branch */}
                <select
                  aria-label={t.branch}
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm font-medium text-gray-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <option value="all">{t.allBranches}</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || loading}
                  aria-label={t.refresh}
                  title={t.refresh}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing || loading ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            {/* Custom dates only when asked for */}
            {dateRange === "custom" && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm">
                <Calendar className="ml-1 h-4 w-4 text-rose-500" aria-hidden="true" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  aria-label="Start date"
                  className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={new Date().toISOString().split("T")[0]}
                  aria-label="End date"
                  className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
                />
              </div>
            )}

            {!hasLoaded ? (
              /* First load */
              <div className="space-y-6" aria-busy="true">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="h-80 animate-pulse rounded-2xl border border-gray-200/80 bg-white lg:col-span-2" />
                  <div className="h-80 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
                </div>
              </div>
            ) : (
              <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
                {/* ================= Alert ================= */}
                {stats.lowStockProducts > 0 && (
                  <Link
                    href="/owner/inventory/stocks"
                    className="group flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 transition-colors hover:bg-rose-50"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-rose-500 shadow-sm">
                      <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <p className="flex-1 text-sm text-gray-700">
                      <span className="font-bold text-gray-900 tabular">
                        {stats.lowStockProducts}
                      </span>{" "}
                      {t.lowStockAlertSuffix}
                    </p>
                    <span className="hidden items-center gap-1 text-sm font-semibold text-rose-600 sm:inline-flex">
                      {t.viewStock}
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                )}

                {/* ================= KPIs ================= */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label={t.totalSales}
                    value={formatPrice(periodTotals.revenue)}
                    icon={TrendingUp}
                  >
                    <GrowthChip value={revenueGrowth} />
                    {revenueGrowth !== null && <span>{t.vsPreviousPeriod}</span>}
                  </KpiCard>

                  <KpiCard
                    label={t.grossProfit}
                    value={formatPrice(periodTotals.profit)}
                    icon={Coins}
                  >
                    <GrowthChip value={profitGrowth} />
                    <span className="tabular">
                      {profitMargin.toFixed(1)}% {t.marginLabel}
                    </span>
                  </KpiCard>

                  <KpiCard
                    label={t.netProfit}
                    value={formatPrice(netProfit)}
                    icon={Wallet}
                    valueClassName={netProfit < 0 ? "text-red-600" : "text-gray-900"}
                  >
                    <span className="tabular">
                      {t.expenses}: {formatPrice(periodExpenses)}
                    </span>
                  </KpiCard>

                  <KpiCard
                    label={t.paidOrders}
                    value={periodTotals.orders.toLocaleString()}
                    icon={Receipt}
                  >
                    <GrowthChip value={ordersGrowth} />
                    <span className="tabular">
                      {t.avgOrderValue}: {formatPrice(averageOrder)}
                    </span>
                  </KpiCard>
                </div>

                {/* ================= Trend & order status ================= */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <Panel
                    title={t.totalSaleProfitTrend}
                    className="lg:col-span-2"
                    aside={
                      <div className="flex items-center gap-3 text-xs font-medium text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden="true" />
                          {t.totalSales}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                          {t.profit}
                        </span>
                        {/* Bucket size, so a switch from daily to monthly totals
                            is not mistaken for a jump in sales. */}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                          {grainLabel(timeGrain)}
                        </span>
                      </div>
                    }
                  >
                    {hasSales ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart
                          data={dailyRevenueData}
                          margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
                        >
                          <defs>
                            <linearGradient id="dashSales" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="dashProfit" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="#f1f1f4" />
                          <XAxis
                            dataKey="date"
                            {...timeAxisProps(dailyRevenueData.length)}
                            stroke="#9ca3af"
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                            axisLine={false}
                            tickLine={false}
                            width={52}
                            tickFormatter={(value: number) => compactNumber(value)}
                          />
                          <Tooltip
                            cursor={{ stroke: "#fda4af", strokeDasharray: "4 4" }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as RevenueSeriesPoint;
                              return (
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs shadow-lg">
                                  <p className="mb-1.5 font-semibold text-gray-900">{label}</p>
                                  <p className="flex justify-between gap-6 text-gray-600">
                                    <span>{t.totalSales}</span>
                                    <span className="font-semibold text-rose-600 tabular">{formatPrice(row.revenue)}</span>
                                  </p>
                                  <p className="flex justify-between gap-6 text-gray-600">
                                    <span>{t.profit}</span>
                                    <span className="font-semibold text-emerald-600 tabular">{formatPrice(row.profit)}</span>
                                  </p>
                                  <p className="flex justify-between gap-6 text-gray-600">
                                    <span>{t.paidOrders}</span>
                                    <span className="font-semibold text-gray-900 tabular">{row.orders}</span>
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#f43f5e"
                            strokeWidth={2}
                            fill="url(#dashSales)"
                            name={t.totalSales}
                            activeDot={{ r: 4 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="profit"
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#dashProfit)"
                            name={t.profit}
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[280px] flex-col items-center justify-center text-center">
                        <BarChart3 className="mb-2 h-10 w-10 text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">{t.noRevenueData}</p>
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title={t.orderStatusDistribution}
                    aside={
                      <span className="text-xs font-medium text-gray-500 tabular">
                        {stats.totalOrders} {t.orders}
                      </span>
                    }
                  >
                    {stats.totalOrders > 0 ? (
                      <>
                        {/* One stacked bar reads faster than five columns. */}
                        <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                          {orderStatusChartRows
                            .filter((row) => row.value > 0)
                            .map((row) => (
                              <div
                                key={row.key}
                                title={`${row.name}: ${row.value}`}
                                style={{
                                  width: `${row.percentage}%`,
                                  backgroundColor: STATUS_COLORS[row.key],
                                }}
                              />
                            ))}
                        </div>
                        <ul className="space-y-3">
                          {orderStatusChartRows.map((row) => (
                            <li key={row.key} className="flex items-center gap-3 text-sm">
                              <span
                                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: STATUS_COLORS[row.key] }}
                                aria-hidden="true"
                              />
                              <span className="flex-1 text-gray-600">{row.name}</span>
                              <span className="font-semibold text-gray-900 tabular">{row.value}</span>
                              <span className="w-12 text-right text-xs text-gray-400 tabular">
                                {row.percentage.toFixed(0)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <div className="flex h-[240px] flex-col items-center justify-center text-center">
                        <ShoppingCart className="mb-2 h-10 w-10 text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">{t.noOrderData}</p>
                      </div>
                    )}
                  </Panel>
                </div>

                {/* ================= Payments, products, activity ================= */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <Panel title={t.paymentMethodsBreakdown}>
                    {paymentTotal > 0 ? (
                      <ul className="space-y-4">
                        {paymentRows.map((row) => {
                          const share = (row.value / paymentTotal) * 100;
                          const Icon = row.icon;
                          return (
                            <li key={row.key}>
                              <div className="mb-1.5 flex items-center gap-2.5 text-sm">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                                  <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="flex-1 font-medium text-gray-700">{row.label}</span>
                                <span className="font-semibold text-gray-900 tabular">
                                  {formatPrice(row.value)}
                                </span>
                                <span className="w-10 text-right text-xs text-gray-400 tabular">
                                  {share.toFixed(0)}%
                                </span>
                              </div>
                              <div className="ml-[38px] h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-brand"
                                  style={{ width: `${share}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="py-10 text-center text-sm text-gray-500">{t.noSalesData}</p>
                    )}
                  </Panel>

                  <Panel
                    title={t.topSellingProducts}
                    aside={
                      <span className="text-xs font-medium text-gray-500 tabular">
                        {stats.totalItemsSold} {t.itemsSold}
                      </span>
                    }
                  >
                    {topProducts.length > 0 ? (
                      <ol className="space-y-1">
                        {topProducts.slice(0, 5).map((product, index) => (
                          <li
                            key={product.id}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50"
                          >
                            <span
                              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                index === 0
                                  ? "bg-brand text-white"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900" title={product.name}>
                                {product.name}
                              </p>
                              <p className="text-xs text-gray-500 tabular">
                                {product.quantitySold} {t.sold}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 tabular">
                              {formatPrice(product.revenue)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Package className="mb-2 h-10 w-10 text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">{t.noSalesData}</p>
                      </div>
                    )}
                  </Panel>

                  <Panel title={t.recentActivity}>
                    {recentActivity.length > 0 ? (
                      <ul className="space-y-1">
                        {recentActivity.slice(0, 6).map((activity) => (
                          <li
                            key={`${activity.type}-${activity.id}`}
                            className="flex items-center gap-3 rounded-xl px-2 py-2"
                          >
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
                              {getActivityIcon(activity.type, activity.status)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-gray-800" title={activity.description}>
                                {activity.description}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatTimeAgo(activity.timestamp)}
                              </p>
                            </div>
                            {activity.amount !== undefined && (
                              <span className="text-sm font-semibold text-gray-900 tabular">
                                {formatPrice(activity.amount)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Clock className="mb-2 h-10 w-10 text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">{t.noRecentActivity}</p>
                      </div>
                    )}
                  </Panel>
                </div>

                {/* ================= Detailed analytics (on demand) ================= */}
                <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowInsights((open) => !open)}
                    aria-expanded={showInsights}
                    aria-controls="dashboard-insights"
                    className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left hover:bg-gray-50/60"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                        <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-base font-semibold text-gray-900">
                          {t.detailedAnalytics}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {t.detailedAnalyticsHint}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-rose-600">
                      {showInsights ? t.hideDetails : t.showDetails}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${showInsights ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                </section>

                {showInsights && (
                  <div id="dashboard-insights" className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <NetMarginChart data={netMarginData} />
                      <ChannelSplitChart data={channelSplit} />
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <PromotionRevenueByProductChart data={promotedProducts} />
                      <ChartCard
                        title={t.dailyOrdersTrend}
                        isEmpty={!hasSales}
                        emptyIcon={<Calendar className="h-12 w-12" />}
                        emptyMessage={t.noOrderData}
                      >
                        <ResponsiveContainer width="100%" height={320}>
                          <LineChart
                            data={dailyRevenueData}
                            margin={{ top: 8, right: 8, bottom: 8 }}
                          >
                            <CartesianGrid vertical={false} stroke="#f1f1f4" />
                            <XAxis
                              dataKey="date"
                              {...timeAxisProps(dailyRevenueData.length)}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 12 }}
                              stroke="#6b7280"
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                              }}
                              formatter={(value?: number) =>
                                value !== undefined
                                  ? [`${value} ${t.orders}`, t.dailyOrders]
                                  : ["N/A", t.dailyOrders]
                              }
                            />
                            <Line
                              type="monotone"
                              dataKey="orders"
                              stroke="#ec4899"
                              strokeWidth={2}
                              dot={
                                dailyRevenueData.length <= 40
                                  ? { fill: "#ec4899", r: 3 }
                                  : false
                              }
                              activeDot={{ r: 5 }}
                              name={t.dailyOrders}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <SellThroughBySizeChart data={sizeSellThrough} />
                      <ReturnRateBySizeChart data={returnRateBySize} />
                    </div>
                    <StaffPerformanceChart data={staffPerformance} />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <OwnerDashboardContent />
    </ProtectedRoute>
  );
}
