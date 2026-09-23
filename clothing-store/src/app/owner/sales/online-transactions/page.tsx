"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import {
  onlineOrderService,
  OnlineTransaction,
} from "@/services/onlineOrderService";
import {
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  User,
  Package,
  CreditCard,
} from "lucide-react";

type OrderWorkflowStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "unknown";

function getNormalizedOrderStatus(
  status?: string,
  paymentStatus?: string,
): OrderWorkflowStatus {
  const combined = `${(status || "").toLowerCase()} ${(paymentStatus || "").toLowerCase()}`;

  if (/(packaging|packed|preparing)/.test(combined)) return "packaging";
  if (/(delivering|shipping|shipped|in_transit)/.test(combined)) {
    return "delivering";
  }
  if (/(delivered|fulfilled|received)/.test(combined)) return "delivered";
  if (
    /(cancelled|canceled|void|refunded|fail|failed|error|declined)/.test(
      combined,
    )
  ) {
    return "cancelled";
  }
  if (
    /(pending|processing|created|initiated|paid|success|succeeded|completed)/.test(
      combined,
    )
  ) {
    return "pending";
  }

  return "unknown";
}

/** Human label for a payment method code. */
function getPaymentMethodLabel(method?: string) {
  const value = (method || "").toLowerCase();
  if (value === "cod") return "💵 COD";
  if (value === "cash") return "💵 Cash";
  if (value === "scan" || value === "wallet") return "📱 QR Scan";
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Trim floating point noise so a rate reads "7%" not "7.000000001%". */
function formatRatePercent(percent: number) {
  return String(Math.round(percent * 100) / 100);
}

/**
 * Rebuild the money breakdown from what was stored at purchase time, so the
 * figures always reconcile with what the customer actually paid.
 *
 * `discount` holds promotion savings only; coupon savings live separately in
 * `couponDiscountTHB`.
 */
function getPaymentBreakdown(row: OnlineTransaction) {
  const itemsSubtotal = (row.items || []).reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 1),
    0,
  );

  const storedSubtotal = Number(row.subtotal || 0);
  const subtotal = storedSubtotal > 0 ? storedSubtotal : itemsSubtotal;

  const promotionDiscount = Math.max(0, Number(row.discount || 0));
  const couponDiscount = Math.max(0, Number(row.couponDiscountTHB || 0));
  const taxableBase = Math.max(
    0,
    subtotal - promotionDiscount - couponDiscount,
  );
  const tax = Math.max(0, Number(row.tax || 0));

  // Prefer the rate stored with the order; older records predate that field.
  const storedRate = Number(row.taxRate || 0);
  const taxPercent =
    storedRate > 0
      ? storedRate
      : taxableBase > 0 && tax > 0
        ? (tax / taxableBase) * 100
        : 0;

  const total = Number(row.total || 0) || taxableBase + tax;

  return {
    subtotal,
    promotionDiscount,
    couponDiscount,
    tax,
    taxPercent,
    total,
  };
}

/** Small labelled value used throughout the details modal. */
function DetailRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span
        className={`text-right text-sm ${
          emphasis ? "font-bold text-gray-900" : "font-medium text-gray-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Section wrapper so the three detail groups share one look. */
function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-pink-100 px-4 py-2.5">
        <span className="text-rose-500">{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-rose-600">
          {title}
        </h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

/**
 * Full breakdown of one online transaction: who bought it, what they bought,
 * and how the money added up. The table only has room for a summary, so the
 * shipping address, per-item variants and tax/coupon lines live here.
 */
function TransactionDetailsModal({
  row,
  orderStatus,
  onClose,
}: {
  row: OnlineTransaction;
  orderStatus: OrderWorkflowStatus;
  onClose: () => void;
}) {
  const items = row.items || [];
  const money = getPaymentBreakdown(row);
  const couponCode = row.couponCode || row.appliedCouponCode;
  const currency = row.sellingCurrency === "MMK" ? "Ks" : "THB";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">
              Transaction Details
            </h2>
            <p className="mt-0.5 truncate text-xs text-white/80">
              {row.transactionId || row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="flex-shrink-0 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 px-5 py-4">
          {/* Customer */}
          <DetailSection
            title="Customer Information"
            icon={<User className="h-4 w-4" />}
          >
            <div className="divide-y divide-gray-100">
              <DetailRow
                label="Name"
                value={row.customer?.displayName || "-"}
                emphasis
              />
              <DetailRow label="Email" value={row.customer?.email || "-"} />
              <DetailRow label="Phone" value={row.customer?.phone || "-"} />
              <DetailRow
                label="Delivery Address"
                value={row.customer?.address || "-"}
              />
              <DetailRow
                label="Customer ID"
                value={
                  <span className="font-mono text-xs">
                    {row.customer?.uid || "-"}
                  </span>
                }
              />
            </div>
          </DetailSection>

          {/* Products */}
          <DetailSection
            title={`Product Details (${items.length})`}
            icon={<Package className="h-4 w-4" />}
          >
            {items.length === 0 ? (
              <p className="py-2 text-center text-sm text-gray-500">
                No item detail was recorded for this transaction.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <th className="pb-2 pr-3">Product</th>
                      <th className="pb-2 pr-3">Variant</th>
                      <th className="pb-2 pr-3 text-right">Unit Price</th>
                      <th className="pb-2 pr-3 text-right">Qty</th>
                      <th className="pb-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, index) => {
                      const quantity = Number(item.quantity || 1);
                      const unitPrice = Number(item.unitPrice || 0);
                      const variant = [item.selectedColor, item.selectedSize]
                        .filter(Boolean)
                        .join(" / ");

                      return (
                        <tr key={`${row.id}-item-${index}`}>
                          <td className="py-2 pr-3 font-medium text-gray-900">
                            {item.groupName || "Item"}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {variant || "-"}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-700">
                            ฿ {unitPrice.toFixed(2)}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-700">
                            {quantity}
                          </td>
                          <td className="py-2 text-right font-semibold text-gray-900">
                            ฿ {(unitPrice * quantity).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          {/* Payment */}
          <DetailSection
            title="Payment Details"
            icon={<CreditCard className="h-4 w-4" />}
          >
            <div className="divide-y divide-gray-100">
              <DetailRow
                label="Payment Method"
                value={getPaymentMethodLabel(row.paymentMethod)}
              />
              <DetailRow
                label="Provider"
                value={row.paymentProvider || "-"}
              />
              <DetailRow
                label="Payment Status"
                value={row.paymentStatus || row.status || "-"}
              />
              <DetailRow
                label="Order Status"
                value={<span className="capitalize">{orderStatus}</span>}
              />
              <DetailRow label="Order Ref" value={row.onlineOrderId || "-"} />
              <DetailRow
                label="Date"
                value={
                  row.timestamp
                    ? new Date(row.timestamp).toLocaleString()
                    : "-"
                }
              />
            </div>

            {/* Money breakdown */}
            <div className="mt-3 space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">
                  ฿ {money.subtotal.toFixed(2)}
                </span>
              </div>

              {money.promotionDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Promotion Discount</span>
                  <span className="font-medium">
                    -฿ {money.promotionDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              {money.couponDiscount > 0 && (
                <div className="flex items-center justify-between text-purple-700">
                  <span className="flex items-center gap-1.5">
                    Coupon Discount
                    {couponCode && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                        {couponCode}
                      </span>
                    )}
                  </span>
                  <span className="font-medium">
                    -฿ {money.couponDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  Tax ({formatRatePercent(money.taxPercent)}%)
                </span>
                <span className="font-medium text-gray-900">
                  ฿ {money.tax.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-dashed border-gray-300 pt-2">
                <span className="font-bold text-gray-900">Total (THB)</span>
                <span className="text-base font-bold text-rose-600">
                  ฿ {money.total.toFixed(2)}
                </span>
              </div>

              {Number(row.sellingTotal || row.amountMmk || 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total ({currency})</span>
                  <span className="font-semibold text-gray-900">
                    {Number(
                      row.sellingTotal || row.amountMmk || 0,
                    ).toLocaleString()}{" "}
                    {currency}
                  </span>
                </div>
              )}

              {Number(row.exchangeRate || 0) > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Exchange Rate</span>
                  <span>1 THB = {row.exchangeRate} MMK</span>
                </div>
              )}
            </div>
          </DetailSection>
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineTransactionsContent() {
  const [selectedRow, setSelectedRow] = useState<OnlineTransaction | null>(
    null,
  );
  const [rows, setRows] = useState<OnlineTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    | "all"
    | "completed"
    | "pending"
    | "failed"
    | "cancelled"
    | "pending_refund"
    | "refunded"
    | "partially_refunded"
  >("all");
  const [filterOrderStatus, setFilterOrderStatus] = useState<
    "all" | Exclude<OrderWorkflowStatus, "unknown">
  >("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<
    "all" | "cod" | "scan"
  >("all");
  const [orderStatusByOrderRef, setOrderStatusByOrderRef] = useState<
    Record<string, OrderWorkflowStatus>
  >({});
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const load = async () => {
      try {
        const [txData, orderData] = await Promise.all([
          onlineOrderService.getOnlineTransactions(),
          onlineOrderService.getOnlineOrders(),
        ]);

        const nextMap: Record<string, OrderWorkflowStatus> = {};
        orderData.forEach((order) => {
          const normalized = getNormalizedOrderStatus(
            order.status,
            order.paymentStatus,
          );
          nextMap[order.id] = normalized;
          if (order.orderId) {
            nextMap[order.orderId] = normalized;
          }
        });

        setRows(txData);
        setOrderStatusByOrderRef(nextMap);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    filterStatus,
    filterOrderStatus,
    filterPaymentMethod,
    dateRange,
    startDate,
    endDate,
    rowsPerPage,
  ]);

  useEffect(() => {
    if (dateRange === "custom" && (!startDate || !endDate)) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [dateRange, startDate, endDate]);

  const filteredRows = rows.filter((row) => {
    const searchText = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !searchText ||
      (row.transactionId || row.id).toLowerCase().includes(searchText) ||
      (row.onlineOrderId || "").toLowerCase().includes(searchText) ||
      row.customer?.displayName?.toLowerCase().includes(searchText) ||
      row.customer?.email?.toLowerCase().includes(searchText);

    const matchesStatus =
      filterStatus === "all" ||
      (row.paymentStatus || row.status || "").toLowerCase() === filterStatus;

    const resolvedOrderStatus = row.onlineOrderId
      ? (orderStatusByOrderRef[row.onlineOrderId] ?? "unknown")
      : "unknown";
    const matchesOrderStatus =
      filterOrderStatus === "all" || resolvedOrderStatus === filterOrderStatus;

    const paymentMethod = (row.paymentMethod || "").toLowerCase();
    const matchesPaymentMethod =
      filterPaymentMethod === "all" ||
      (filterPaymentMethod === "cod" && paymentMethod === "cod") ||
      (filterPaymentMethod === "scan" && (paymentMethod === "scan" || paymentMethod === "wallet"));

    let matchesDateRange = true;
    if (dateRange !== "all") {
      const now = new Date();
      let rangeStart = new Date();
      let rangeEnd = now;

      if (dateRange === "custom" && startDate && endDate) {
        rangeStart = new Date(startDate);
        rangeEnd = new Date(endDate);
        rangeEnd.setHours(23, 59, 59, 999);
      } else {
        switch (dateRange) {
          case "today":
            rangeStart = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            );
            break;
          case "7d":
            rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "90d":
            rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        }
      }

      const referenceDate = new Date(row.timestamp || "");
      matchesDateRange =
        !Number.isNaN(referenceDate.getTime()) &&
        referenceDate >= rangeStart &&
        referenceDate <= rangeEnd;
    }

    return (
      matchesSearch && matchesStatus && matchesOrderStatus && matchesPaymentMethod && matchesDateRange
    );
  });

  const sortedFilteredRows = [...filteredRows].sort((a, b) => {
    const aTime = new Date(a.timestamp || "").getTime();
    const bTime = new Date(b.timestamp || "").getTime();
    return bTime - aTime;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFilteredRows.length / rowsPerPage),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const currentRows = sortedFilteredRows.slice(
    startIndex,
    startIndex + rowsPerPage,
  );

  const totalSalesMmk = sortedFilteredRows.reduce(
    (sum, row) => sum + Number(row.sellingTotal || 0),
    0,
  );

  const uniqueCustomerKeys = new Set(
    sortedFilteredRows
      .map(
        (row) =>
          row.customer?.uid ||
          row.customer?.email ||
          row.customer?.displayName ||
          "",
      )
      .filter(Boolean),
  );

  const totalTransactions = sortedFilteredRows.length;
  const totalCustomers = uniqueCustomerKeys.size;

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          activeItem="online-transactions"
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          activeItem="online-transactions"
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar
          onMenuToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-screen-2xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
              Online Transactions
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Transactions generated from successful MyanMyanPay callbacks.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  Total Sales
                </h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {Math.round(totalSalesMmk).toLocaleString()} MMK
                </p>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  Total Transactions
                </h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {totalTransactions}
                </p>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">
                  Total Customers
                </h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {totalCustomers}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search transaction, order ref, or customer..."
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>

                <div className="relative">
                  <Filter
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(
                        e.target.value as
                          | "all"
                          | "completed"
                          | "pending"
                          | "failed"
                          | "cancelled"
                          | "pending_refund"
                          | "refunded"
                          | "partially_refunded",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 appearance-none"
                  >
                    <option value="all">All Payment Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="pending_refund">Pending Refund</option>
                    <option value="refunded">Fully Refunded</option>
                    <option value="partially_refunded">Partially Refunded</option>
                  </select>
                </div>

                <div className="relative">
                  <Filter
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={filterOrderStatus}
                    onChange={(e) =>
                      setFilterOrderStatus(
                        e.target.value as
                          | "all"
                          | "pending"
                          | "packaging"
                          | "delivering"
                          | "delivered"
                          | "cancelled",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 appearance-none"
                  >
                    <option value="all">All Order Status</option>
                    <option value="pending">Pending</option>
                    <option value="packaging">Packaging</option>
                    <option value="delivering">Delivering</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="relative">
                  <Filter
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={filterPaymentMethod}
                    onChange={(e) =>
                      setFilterPaymentMethod(
                        e.target.value as "all" | "cod" | "scan"
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 appearance-none"
                  >
                    <option value="all">All Payment Methods</option>
                    <option value="cod">💵 Cash on Delivery</option>
                    <option value="scan">📱 QR Scan</option>
                  </select>
                </div>

                <div className="relative">
                  <Calendar
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={dateRange}
                    onChange={(e) =>
                      setDateRange(
                        e.target.value as
                          | "today"
                          | "7d"
                          | "30d"
                          | "90d"
                          | "all"
                          | "custom",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 appearance-none"
                  >
                    <option value="today">Today</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="custom">Custom Range</option>
                    <option value="all">All Time</option>
                  </select>
                </div>
              </div>

              {dateRange === "custom" && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gradient-to-r from-pink-50 to-pink-100 border-b border-gray-100 text-left text-gray-700">
                  <tr>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Order Ref</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Total (THB)</th>
                    <th className="px-4 py-3">Total (MMK)</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Loading online transactions...
                      </td>
                    </tr>
                  ) : currentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No matching online transactions found.
                      </td>
                    </tr>
                  ) : (
                    currentRows.map((row) => {
                      const paymentMethodLabel = getPaymentMethodLabel(
                        row.paymentMethod,
                      );

                      return (
                        <tr key={row.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {row.transactionId || row.id}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {row.onlineOrderId || "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {row.customer?.displayName ||
                              row.customer?.email ||
                              "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {paymentMethodLabel}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {Number(row.total || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {Number(row.sellingTotal || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                (row.paymentStatus || row.status || "").toLowerCase() === "pending_refund"
                                  ? "bg-amber-100 text-amber-800"
                                  : (row.paymentStatus || row.status || "").toLowerCase() === "refund_rejected"
                                  ? "bg-red-100 text-red-800"
                                  : (row.paymentStatus || row.status || "").toLowerCase() === "refunded"
                                  ? "bg-purple-100 text-purple-800"
                                  : (row.paymentStatus || row.status || "").toLowerCase() === "partially_refunded"
                                  ? "bg-purple-100 text-purple-800"
                                  : (row.paymentStatus || row.status || "").toLowerCase().includes("success") ||
                                    (row.paymentStatus || row.status || "").toLowerCase().includes("completed")
                                  ? "bg-green-100 text-green-800"
                                  : (row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase().includes("fail")
                                  ? "bg-red-100 text-red-800"
                                  : (row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase().includes("cancel")
                                  ? "bg-gray-100 text-gray-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {(row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase() === "pending_refund"
                                ? "Pending Refund"
                                : (row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase() === "refund_rejected"
                                ? "Refund Rejected"
                                : (row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase() === "refunded"
                                ? "Fully Refunded"
                                : (row.paymentStatus || row.paymentStatus || row.status || "").toLowerCase() === "partially_refunded"
                                ? "Partially Refunded"
                                : row.paymentStatus || row.paymentStatus || row.status || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {row.timestamp
                              ? new Date(row.timestamp).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRow(row)}
                              title="View customer, product and payment details"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="rounded-md border border-gray-300 bg-white text-gray-900 px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>
                  Showing {sortedFilteredRows.length === 0 ? 0 : startIndex + 1}
                  -
                  {Math.min(
                    startIndex + rowsPerPage,
                    sortedFilteredRows.length,
                  )}{" "}
                  of {sortedFilteredRows.length}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <nav
                  className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                  aria-label="Pagination"
                >
                  <button
                    title="Go to previous page"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={safeCurrentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    title="Go to next page"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
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
        </main>
      </div>

      {selectedRow && (
        <TransactionDetailsModal
          row={selectedRow}
          orderStatus={
            (selectedRow.onlineOrderId
              ? orderStatusByOrderRef[selectedRow.onlineOrderId]
              : undefined) ??
            getNormalizedOrderStatus(
              selectedRow.status,
              selectedRow.paymentStatus,
            )
          }
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}

export default function OnlineTransactionsPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <OnlineTransactionsContent />
    </ProtectedRoute>
  );
}
