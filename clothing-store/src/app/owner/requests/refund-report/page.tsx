"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Transaction, RefundItem } from "@/services/transactionService";
import { 
  FileText, 
  Clock,
  CreditCard,
  Package,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { collection, onSnapshot, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";

/** One line of a refund, resolved back to the order it came from. */
type RefundedLine = {
  name: string;
  variant: string;
  quantity: number;
};

/**
 * Coerce a stored date to a `Date`.
 *
 * Refund dates arrive as Firestore `Timestamp`s from the POS and as ISO strings
 * from the storefront, so both have to be handled. Returns null rather than an
 * Invalid Date so callers can render a dash.
 */
function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const maybeTimestamp = value as { toDate?: () => Date };
  if (typeof maybeTimestamp.toDate === "function") {
    try {
      return maybeTimestamp.toDate();
    } catch {
      return null;
    }
  }

  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The moment shown in the Date column, as a sortable number.
 *
 * Mirrors the same fallback chain the cell renders: a cancellation is dated by
 * when its refund was requested, a partial refund by when the refund record was
 * created, and anything missing both falls back to the order date. Rows with no
 * usable date sort last. Note this is deliberately not the transaction's
 * `createdAt` for every row — one order can produce several refunds on
 * different days, so ordering by the order date alone leaves the table looking
 * unsorted.
 */
function refundSortTime(item: {
  transaction: Transaction;
  refund?: { createdAt?: unknown };
  type: "cancellation" | "partial";
}): number {
  const raw =
    item.type === "cancellation" && item.transaction.cancellationRefund?.requestedAt
      ? item.transaction.cancellationRefund.requestedAt
      : item.refund?.createdAt || item.transaction.createdAt;

  return toDateSafe(raw)?.getTime() ?? 0;
}

/**
 * True when the order came from the web storefront rather than the till.
 *
 * No single field is reliable: of the online transactions in the database some
 * carry only `orderSource`, others only `source` + `paymentProvider` +
 * `onlineOrderId`. Checking one marker alone silently drops whole batches of
 * orders, so every known marker is ORed together.
 */
function isOnlineTransaction(transaction: Transaction): boolean {
  return (
    transaction.orderSource === "web_storefront" ||
    transaction.source === "online" ||
    transaction.paymentProvider === "MMPAY" ||
    Boolean(transaction.onlineOrderId) ||
    transaction.customer?.customerType === "online"
  );
}

/** Markers the storefront writes on line items instead of a real shop id. */
const ONLINE_SHOP_MARKERS = new Set(["online", "online_store", "web", "storefront"]);

/**
 * Work out which branch a refunded order belongs to.
 *
 * `branchName` is only persisted by the POS till and by the COD checkout route,
 * so most online orders (and every order taken before that field existed) store
 * nothing at all. Rather than render a dash for them, walk a chain of weaker
 * signals that are still present on the document:
 *
 * 1. `branchName` / `shopId` written directly on the transaction.
 * 2. `items[].shop` — the shop the line was sold from.
 * 3. `stocks/{stockId}.shop` — the shop that owns the stock record.
 * 4. "Online Store" when the order came from the storefront.
 *
 * `shopNames` maps a shop id to its display name; `stockShops` maps a stock id
 * to its owning shop id. Both are empty until their lookups resolve, in which
 * case the chain simply falls through to the next signal.
 */
function resolveBranchName(
  transaction: Transaction,
  shopNames: Record<string, string>,
  stockShops: Record<string, string>
): string {
  if (transaction.branchName) return transaction.branchName;
  if (transaction.shopId && shopNames[transaction.shopId]) {
    return shopNames[transaction.shopId];
  }

  const items = transaction.items || [];
  let sawOnlineMarker = false;

  for (const item of items) {
    const shop = (item?.shop || "").trim();
    if (!shop) continue;
    if (ONLINE_SHOP_MARKERS.has(shop.toLowerCase())) {
      sawOnlineMarker = true;
      continue;
    }
    if (shopNames[shop]) return shopNames[shop];
  }

  for (const item of items) {
    const shop = stockShops[item?.stockId || ""];
    if (shop && shopNames[shop]) return shopNames[shop];
  }

  const isOnline =
    sawOnlineMarker ||
    transaction.orderSource === "web_storefront" ||
    Boolean(transaction.onlineOrderId);

  return isOnline ? "Online Store" : "-";
}

function RefundReportContent() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const { formatPrice } = useCurrency();
  const [allRefunds, setAllRefunds] = useState<Array<{
    transaction: Transaction;
    refund?: any;
    type: "cancellation" | "partial";
  }>>([]);
  const [filteredRefunds, setFilteredRefunds] = useState<Array<{
    transaction: Transaction;
    refund?: any;
    type: "cancellation" | "partial";
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<"all" | "refunded" | "partially_refunded" | "pending_refund" | "refund_rejected">("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<"all" | "cash" | "scan" | "cod">("all");
  /**
   * Whether the refund came from a returned order or a cancelled one. Mirrors
   * the row `type`, where "partial" is a return against a delivered order and
   * "cancellation" is a refund owed on a cancelled order.
   */
  const [filterOrderType, setFilterOrderType] = useState<"all" | "return" | "cancelled">("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Branch lookups used to backfill the Branch column (see resolveBranchName).
  const [shopNames, setShopNames] = useState<Record<string, string>>({});
  const [stockShops, setStockShops] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [shopSnap, stockSnap] = await Promise.all([
          getDocs(collection(db!, "shops")),
          getDocs(collection(db!, "stocks")),
        ]);
        if (cancelled) return;

        const names: Record<string, string> = {};
        shopSnap.forEach((doc) => {
          const data = doc.data() as { name?: string; shopName?: string };
          const name = data.name || data.shopName;
          if (name) names[doc.id] = name;
        });

        const stocks: Record<string, string> = {};
        stockSnap.forEach((doc) => {
          const shop = (doc.data() as { shop?: string }).shop;
          if (shop) stocks[doc.id] = shop;
        });

        setShopNames(names);
        setStockShops(stocks);
      } catch (error) {
        // A failed lookup only costs us the fallback, so keep the report usable.
        console.error("Failed to load branch lookups:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load all refunds (transactions with refund-related payment statuses)
  useEffect(() => {
    setLoading(true);
    
    const transactionsRef = collection(db!, "transactions");
    const q = query(transactionsRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("=== LOADING REFUNDS ===");
      console.log("Total transactions:", snapshot.size);
      
      const refunds: Array<{
        transaction: Transaction;
        refund?: any;
        type: "cancellation" | "partial";
      }> = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as Transaction;
        const transaction = { ...data, id: doc.id };
        
        // Check both paymentStatus and status fields (case-insensitive)
        const paymentStatus = (data.paymentStatus || "").toLowerCase();
        const status = (data.status || "").toLowerCase();
        
        // Check for refund-related statuses in both fields
        const isRefundRelated = 
          /(pending_refund)/.test(paymentStatus) ||
          /(pending_refund)/.test(status) ||
          /(refund_rejected)/.test(paymentStatus) ||
          /(refund_rejected)/.test(status) ||
          /(partially_refunded|partial)/.test(paymentStatus) ||
          /(partially_refunded|partial)/.test(status) ||
          /(refunded)/.test(paymentStatus) ||
          /(refunded)/.test(status) ||
          /(fully_refunded)/.test(paymentStatus) ||
          /(fully_refunded)/.test(status);
        
        // This report covers storefront orders only. Walk-in refunds are
        // settled at the till and are reported under Walk-In Sales.
        if (isRefundRelated && isOnlineTransaction(transaction)) {
          console.log("Found refund order:", transaction.transactionId, "PaymentStatus:", data.paymentStatus, "Status:", data.status);
          
          // Determine type based on refund data
          if (data.cancellationRefund) {
            refunds.push({
              transaction,
              type: "cancellation",
            });
          } else if (data.refunds && data.refunds.length > 0) {
            // Add entry for each partial refund
            data.refunds.forEach((refund) => {
              refunds.push({
                transaction,
                refund,
                type: "partial",
              });
            });
          } else {
            // No specific refund data but has refund status
            refunds.push({
              transaction,
              type: "partial", // default to partial
            });
          }
        }
      });
      
      // Newest refund first. The snapshot is ordered by the *order* date, which
      // is not the same thing once an order carries several refunds.
      refunds.sort((a, b) => refundSortTime(b) - refundSortTime(a));

      console.log("Total refunds found:", refunds.length);
      setAllRefunds(refunds);
      setFilteredRefunds(refunds);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Apply filters
  useEffect(() => {
    console.log("=== APPLYING FILTERS ===");
    console.log("Filter Payment Status:", filterPaymentStatus);
    console.log("Filter Payment Method:", filterPaymentMethod);
    console.log("Total refunds before filter:", allRefunds.length);
    
    // Log first few items to see data structure
    if (allRefunds.length > 0) {
      console.log("Sample refund data:", {
        paymentStatus: allRefunds[0].transaction.paymentStatus,
        paymentMethod: allRefunds[0].transaction.paymentMethod,
        transactionId: allRefunds[0].transaction.transactionId,
      });
    }
    
    let filtered = [...allRefunds];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((item) => {
        const txnId = item.transaction.transactionId?.toLowerCase() || "";
        const customerName = item.transaction.customer?.displayName?.toLowerCase() || "";
        return txnId.includes(searchQuery.toLowerCase()) || 
               customerName.includes(searchQuery.toLowerCase());
      });
    }

    // Filter by payment status (refund payment status from transaction)
    if (filterPaymentStatus !== "all") {
      console.log("Filtering by payment status:", filterPaymentStatus);
      const beforeCount = filtered.length;
      filtered = filtered.filter((item) => {
        const paymentStatus = (item.transaction.paymentStatus || "").toLowerCase();
        const status = (item.transaction.status || "").toLowerCase();
        
        let matches = false;
        if (filterPaymentStatus === "pending_refund") {
          matches = /(pending_refund)/.test(paymentStatus) || /(pending_refund)/.test(status);
        } else if (filterPaymentStatus === "refund_rejected") {
          matches = /(refund_rejected)/.test(paymentStatus) || /(refund_rejected)/.test(status);
        } else if (filterPaymentStatus === "partially_refunded") {
          matches = /(partially_refunded|partial)/.test(paymentStatus) || /(partially_refunded|partial)/.test(status);
        } else if (filterPaymentStatus === "refunded") {
          // Match "refunded" or "fully_refunded"
          matches = (/(refunded)/.test(paymentStatus) && !/(partially_refunded|partial|pending_refund|refund_rejected)/.test(paymentStatus)) ||
                    (/(refunded)/.test(status) && !/(partially_refunded|partial|pending_refund|refund_rejected)/.test(status)) ||
                    /(fully_refunded)/.test(paymentStatus) ||
                    /(fully_refunded)/.test(status);
        }
        
        if (!matches) {
          console.log("No match - PaymentStatus:", item.transaction.paymentStatus, "Status:", item.transaction.status, "Filter:", filterPaymentStatus);
        }
        return matches;
      });
      console.log("After payment status filter:", filtered.length, "from", beforeCount);
    }

    // Filter by payment method
    if (filterPaymentMethod !== "all") {
      console.log("Filtering by payment method:", filterPaymentMethod);
      const beforeCount = filtered.length;
      filtered = filtered.filter((item) => {
        const paymentMethod = item.transaction.paymentMethod || "";
        const matches = paymentMethod === filterPaymentMethod;
        if (!matches) {
          console.log("No match - Transaction payment method:", paymentMethod, "Filter:", filterPaymentMethod);
        }
        return matches;
      });
      console.log("After payment method filter:", filtered.length, "from", beforeCount);
    }

    // Filter by order type (return vs cancelled)
    if (filterOrderType !== "all") {
      const wanted = filterOrderType === "cancelled" ? "cancellation" : "partial";
      filtered = filtered.filter((item) => item.type === wanted);
    }

    // Filter by date range
    if (dateRange.start) {
      filtered = filtered.filter((item) => {
        const refundDate = getRefundDate(item);
        return refundDate >= dateRange.start;
      });
    }
    if (dateRange.end) {
      filtered = filtered.filter((item) => {
        const refundDate = getRefundDate(item);
        return refundDate <= dateRange.end;
      });
    }

    console.log("Final filtered count:", filtered.length);
    setFilteredRefunds(filtered);
  }, [searchQuery, filterPaymentStatus, filterPaymentMethod, filterOrderType, dateRange, allRefunds]);

  /** ISO `yyyy-mm-dd`, used by the date-range filter. */
  const getRefundDate = (item: typeof allRefunds[0]) => {
    const raw =
      item.type === "cancellation"
        ? item.transaction.cancellationRefund?.requestedAt
        : item.refund?.createdAt;

    const date = toDateSafe(raw);
    return date ? date.toISOString().split("T")[0] : "";
  };

  const getRefundAmount = (item: typeof allRefunds[0]) => {
    if (item.type === "cancellation") {
      return item.transaction.cancellationRefund?.amount || 0;
    }
    return item.refund?.totalAmount || 0;
  };

  // A changed filter invalidates the current page position, so start over.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    filterPaymentStatus,
    filterPaymentMethod,
    filterOrderType,
    dateRange,
    rowsPerPage,
  ]);

  // Pagination calculations
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRefunds.length / rowsPerPage),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRefunds = filteredRefunds.slice(startIndex, endIndex);

  /**
   * Which items a refund covers.
   *
   * Partial refunds list item indexes, so resolve those back to the order lines.
   * A cancellation returns the whole order, so every line counts.
   */
  const getRefundedItems = (
    item: typeof allRefunds[0],
  ): RefundedLine[] => {
    const orderItems = item.transaction.items || [];

    if (item.type === "cancellation" || !item.refund?.items?.length) {
      return orderItems.map((line) => ({
        name: line.groupName,
        variant: [line.selectedColor, line.selectedSize]
          .filter(Boolean)
          .join(" / "),
        quantity: line.quantity,
      }));
    }

    return item.refund.items.map((refundItem: RefundItem) => {
      const line = orderItems[refundItem.itemIndex];
      return {
        name: line?.groupName || `Item ${refundItem.itemIndex + 1}`,
        variant: line
          ? [line.selectedColor, line.selectedSize].filter(Boolean).join(" / ")
          : "",
        quantity: refundItem.quantity,
      };
    });
  };

  const getRefundMethodLabel = (item: typeof allRefunds[0]) => {
    const method =
      item.type === "cancellation"
        ? item.transaction.cancellationRefund?.method
        : item.refund?.refundMethod;

    if (!method) return "-";
    if (method === "cash") return "💵 Cash";
    if (method === "bank_transfer") return "🏦 Bank Transfer";
    if (method === "original_payment") return "💳 Original Payment";
    return String(method).replace("_", " ");
  };

  const getRefundStatus = (item: typeof allRefunds[0]) => {
    if (item.type === "cancellation") {
      return item.transaction.cancellationRefund?.status || "unknown";
    }
    return item.refund?.status || "unknown";
  };

  const formatDate = (timestamp: unknown) => {
    const date = toDateSafe(timestamp);
    if (!date) return "-";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalRefundAmount = filteredRefunds.reduce((sum, item) => sum + getRefundAmount(item), 0);

  /**
   * Headline figures for the rows currently in view, so the summary always
   * agrees with the table and the CSV rather than with the unfiltered set.
   *
   * `settledAmount` and `pendingAmount` are split on the refund's own status,
   * not the order's, because an order can sit at "refunded" while an individual
   * refund line is still awaiting payment.
   */
  const summary = filteredRefunds.reduce(
    (acc, item) => {
      const amount = getRefundAmount(item);
      const status = getRefundStatus(item).toLowerCase();

      if (status === "completed") acc.settledAmount += amount;
      else if (status === "pending") acc.pendingAmount += amount;

      if (item.type === "cancellation") acc.cancellations += 1;
      else acc.returns += 1;

      acc.orderTotal += item.transaction.total ?? 0;

      const orderKey = item.transaction.id || item.transaction.transactionId;
      if (orderKey) acc.orders.add(orderKey);

      const customerKey =
        item.transaction.customer?.uid || item.transaction.customer?.email;
      if (customerKey) acc.customers.add(customerKey);

      return acc;
    },
    {
      settledAmount: 0,
      pendingAmount: 0,
      cancellations: 0,
      returns: 0,
      orderTotal: 0,
      orders: new Set<string>(),
      customers: new Set<string>(),
    },
  );

  /** Share of the affected orders' value that was handed back. */
  const refundRate =
    summary.orderTotal > 0 ? (totalRefundAmount / summary.orderTotal) * 100 : 0;

  const exportToCSV = () => {
    // Doc: "Export Reports" - Owner + Manager only.
    if (!permissions.canExportReports) return;

    // Kept in step with the on-screen columns so the export is the same report.
    const headers = [
      "Transaction ID",
      "Order Ref",
      "Customer",
      "Email",
      "Phone",
      "Delivery Address",
      "Type",
      "Items Refunded",
      "Order Total",
      "Refund Amount",
      "Status",
      "Payment Method",
      "Refund Method",
      "Reason",
      "Branch",
      "Confirmed By",
      "Date",
    ];
    const rows = filteredRefunds.map((item) => {
      const refundDate = item.type === "cancellation"
        ? formatDate(item.transaction.cancellationRefund?.requestedAt)
        : formatDate(item.refund?.createdAt);
      
      const status = getRefundStatus(item);
      const amount = getRefundAmount(item);
      const paymentMethod = item.transaction.paymentMethod || "-";
      const confirmedBy = item.type === "cancellation"
        ? item.transaction.cancellationRefund?.confirmedBy || "-"
        : item.refund?.refundedBy || "-";
      const reason =
        item.type === "cancellation"
          ? item.transaction.cancellationRefund?.reason ||
            item.transaction.cancelReason ||
            "-"
          : item.refund?.reason || "-";
      const itemsSummary = getRefundedItems(item)
        .map(
          (line) =>
            `${line.name}${line.variant ? ` (${line.variant})` : ""} x${line.quantity}`,
        )
        .join("; ");

      return [
        item.transaction.transactionId,
        item.transaction.onlineOrderId || "-",
        item.transaction.customer?.displayName || "Online Customer",
        item.transaction.customer?.email || "-",
        item.transaction.customer?.phone || "-",
        item.transaction.customer?.address || "-",
        item.type === "cancellation" ? "Cancellation" : "Return",
        itemsSummary || "-",
        item.transaction.total ?? 0,
        amount,
        status,
        paymentMethod,
        getRefundMethodLabel(item),
        reason,
        resolveBranchName(item.transaction, shopNames, stockShops),
        confirmedBy,
        refundDate,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `online-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="refund-report"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="refund-report"
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
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                      Online Report
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      Refunds and cancellations on online store orders
                    </p>
                  </div>
                </div>
                {/* Doc: "Export Reports" - Owner + Manager only. */}
                {permissions.canExportReports && (
                  <button
                    onClick={exportToCSV}
                    className="px-4 py-2 border border-gray-300 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* Summary. Every figure reflects the active filters, so it always
                matches the table and the exported CSV. */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Refunds</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {filteredRefunds.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.returns} return
                      {summary.returns === 1 ? "" : "s"} ·{" "}
                      {summary.cancellations} cancelled
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-rose-50 to-pink-100 rounded-lg">
                    <FileText className="w-6 h-6 text-rose-500" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Refunded</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatPrice(totalRefundAmount)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {refundRate.toFixed(1)}% of{" "}
                      {formatPrice(summary.orderTotal)} order value
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-rose-50 to-pink-100 rounded-lg">
                    <CreditCard className="w-6 h-6 text-rose-500" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Awaiting Payment</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">
                      {formatPrice(summary.pendingAmount)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatPrice(summary.settledAmount)} already paid out
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Orders Affected</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {summary.orders.size}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.customers.size} customer
                      {summary.customers.size === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <Package className="w-6 h-6 text-gray-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by transaction ID or customer..."
                      className="w-full pl-10 pr-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                </div>

                {/* Payment Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Status
                  </label>
                  <select
                    value={filterPaymentStatus}
                    onChange={(e) => setFilterPaymentStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 text-gray-900 bg-white"
                  >
                    <option value="all">All Payment Status</option>
                    <option value="fully_refunded">Fully Refunded</option>
                    <option value="partially_refunded">Partially Refunded</option>
                    <option value="pending_refund">Pending Refund</option>
                    <option value="refund_rejected">Refund Rejected</option>
                  </select>
                </div>

                {/* Payment Method Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={filterPaymentMethod}
                    onChange={(e) => setFilterPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 text-gray-900 bg-white"
                  >
                    <option value="all">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="scan">QR Scan</option>
                    <option value="cod">COD</option>
                  </select>
                </div>

                {/* Order Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Type
                  </label>
                  <select
                    value={filterOrderType}
                    onChange={(e) =>
                      setFilterOrderType(
                        e.target.value as "all" | "return" | "cancelled",
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 text-gray-900 bg-white"
                  >
                    <option value="all">All Order Types</option>
                    <option value="return">Return</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>

              {(searchQuery || filterPaymentStatus !== "all" || filterPaymentMethod !== "all" || filterOrderType !== "all" || dateRange.start) && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterPaymentStatus("all");
                      setFilterPaymentMethod("all");
                      setFilterOrderType("all");
                      setDateRange({ start: "", end: "" });
                    }}
                    className="text-sm text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Clear Filters
                  </button>
                  <span className="text-sm text-gray-500">
                    ({filteredRefunds.length} of {allRefunds.length} refunds)
                  </span>
                </div>
              )}
            </div>

            {/* Refunds Table */}
            {loading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading refunds...</p>
              </div>
            ) : filteredRefunds.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No refunds found</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    {/* Column set mirrors the detailed report table on
                        /owner/sales/reports, with the online-order fields
                        (order ref, contact, delivery address, source) that a
                        refund enquiry actually needs. */}
                    <thead className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100">
                      <tr>
                        {[
                          "Transaction ID",
                          "Order Ref",
                          "Customer",
                          "Contact",
                          "Delivery Address",
                          "Type",
                          "Items Refunded",
                          "Order Total",
                          "Refund Amount",
                          "Status",
                          "Payment Method",
                          "Refund Method",
                          "Reason",
                          "Branch",
                          "Confirmed By",
                          "Date",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentRefunds.map((item, index) => {
                        // Get refund status from transaction paymentStatus or status field
                        const paymentStatus = (item.transaction.paymentStatus || "").toLowerCase();
                        const status = (item.transaction.status || "").toLowerCase();
                        
                        // Normalize to match purchases page logic
                        let normalizedStatus = "unknown";
                        if (/(pending_refund)/.test(paymentStatus) || /(pending_refund)/.test(status)) {
                          normalizedStatus = "pending_refund";
                        } else if (/(refund_rejected)/.test(paymentStatus) || /(refund_rejected)/.test(status)) {
                          normalizedStatus = "refund_rejected";
                        } else if (/(partially_refunded|partial)/.test(paymentStatus) || /(partially_refunded|partial)/.test(status)) {
                          normalizedStatus = "partially_refunded";
                        } else if (/(refunded)/.test(paymentStatus) || /(refunded)/.test(status) || /(fully_refunded)/.test(paymentStatus) || /(fully_refunded)/.test(status)) {
                          normalizedStatus = "refunded";
                        }
                        
                        // Get amount - use transaction total if no specific refund amount
                        const amount = getRefundAmount(item) || item.transaction.total || 0;
                        
                        // Get date - use transaction createdAt if no refund date
                        const refundDate = item.type === "cancellation" && item.transaction.cancellationRefund?.requestedAt
                          ? formatDate(item.transaction.cancellationRefund.requestedAt)
                          : item.refund?.createdAt
                          ? formatDate(item.refund.createdAt)
                          : formatDate(item.transaction.createdAt);
                        
                        // Get payment method from transaction
                        const paymentMethod = item.transaction.paymentMethod || "-";
                        
                        // Get confirmed by
                        const confirmedBy = item.type === "cancellation"
                          ? item.transaction.cancellationRefund?.confirmedBy || "-"
                          : item.refund?.refundedBy || "-";

                        const refundedItems = getRefundedItems(item);
                        const reason =
                          item.type === "cancellation"
                            ? item.transaction.cancellationRefund
                                ?.reason ||
                              item.transaction.cancelReason ||
                              "-"
                            : item.refund?.reason || "-";

                        return (
                          <tr key={index} className="hover:bg-rose-50/40">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.transaction.transactionId || "-"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {item.transaction.onlineOrderId || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.transaction.customer?.displayName ||
                                "Online Customer"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {/* Every row here is an online order, so a
                                  contact route is the norm rather than the
                                  exception. */}
                              {item.transaction.customer?.email ||
                              item.transaction.customer?.phone ? (
                                <div className="leading-tight">
                                  {item.transaction.customer?.email && (
                                    <div className="text-xs">
                                      {item.transaction.customer.email}
                                    </div>
                                  )}
                                  {item.transaction.customer?.phone && (
                                    <div className="text-xs text-gray-500">
                                      {item.transaction.customer.phone}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <span className="block max-w-[200px] truncate" title={item.transaction.customer?.address || ""}>
                                {item.transaction.customer?.address || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                                  item.type === "cancellation"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {item.type === "cancellation"
                                  ? "Cancellation"
                                  : "Return"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {refundedItems.length === 0 ? (
                                "-"
                              ) : (
                                <div className="leading-tight">
                                  {refundedItems.slice(0, 2).map((line, i) => (
                                    <div key={i} className="text-xs">
                                      {line.name}
                                      {line.variant && (
                                        <span className="text-gray-400">
                                          {" "}
                                          ({line.variant})
                                        </span>
                                      )}
                                      <span className="text-gray-500">
                                        {" "}
                                        ×{line.quantity}
                                      </span>
                                    </div>
                                  ))}
                                  {refundedItems.length > 2 && (
                                    <div className="text-[11px] text-gray-400">
                                      +{refundedItems.length - 2} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {formatPrice(item.transaction.total || 0)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-rose-600">
                              {formatPrice(amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                normalizedStatus === "refunded"
                                  ? "bg-green-100 text-green-800"
                                  : normalizedStatus === "pending_refund"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : normalizedStatus === "refund_rejected"
                                  ? "bg-red-100 text-red-800"
                                  : normalizedStatus === "partially_refunded"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}>
                                {normalizedStatus === "refunded" ? "Fully Refunded" :
                                 normalizedStatus === "partially_refunded" ? "Partially Refunded" :
                                 normalizedStatus === "pending_refund" ? "Pending Refund" :
                                 normalizedStatus === "refund_rejected" ? "Refund Rejected" :
                                 item.transaction.paymentStatus || item.transaction.status || "Unknown"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                              {paymentMethod === "scan" ? "QR Scan" : 
                               paymentMethod === "cod" ? "COD" :
                               paymentMethod.replace("_", " ")}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {getRefundMethodLabel(item)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <span
                                className="block max-w-[180px] truncate"
                                title={reason}
                              >
                                {reason}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {resolveBranchName(item.transaction, shopNames, stockShops)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {confirmedBy}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {refundDate}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination — same layout and controls as the transactions table */}
                <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                  <div className="flex items-center justify-between sm:hidden">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, safeCurrentPage - 1))
                      }
                      disabled={safeCurrentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))
                      }
                      disabled={safeCurrentPage === totalPages}
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
                        Showing {filteredRefunds.length === 0 ? 0 : startIndex + 1}
                        -{Math.min(endIndex, filteredRefunds.length)} of{" "}
                        {filteredRefunds.length}
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
                            setCurrentPage(Math.max(1, safeCurrentPage - 1))
                          }
                          disabled={safeCurrentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          title="Go to next page"
                          onClick={() =>
                            setCurrentPage(
                              Math.min(totalPages, safeCurrentPage + 1),
                            )
                          }
                          disabled={safeCurrentPage === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function RefundReportPage() {
  // Doc: "View Refund Reports" - Owner + Manager only.
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <RefundReportContent />
    </ProtectedRoute>
  );
}
