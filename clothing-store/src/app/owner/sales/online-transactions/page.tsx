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

function OnlineTransactionsContent() {
  const [rows, setRows] = useState<OnlineTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "completed" | "pending" | "failed" | "cancelled"
  >("all");
  const [filterOrderStatus, setFilterOrderStatus] = useState<
    "all" | Exclude<OrderWorkflowStatus, "unknown">
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
      (row.status || "").toLowerCase() === filterStatus;

    const resolvedOrderStatus = row.onlineOrderId
      ? (orderStatusByOrderRef[row.onlineOrderId] ?? "unknown")
      : "unknown";
    const matchesOrderStatus =
      filterOrderStatus === "all" || resolvedOrderStatus === filterOrderStatus;

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
      matchesSearch && matchesStatus && matchesOrderStatus && matchesDateRange
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
            <h1 className="text-2xl font-semibold text-gray-900">
              Online Transactions
            </h1>
            <p className="mt-1 text-sm text-gray-600">
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          | "cancelled",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Order Ref</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Total (THB)</th>
                    <th className="px-4 py-3">Total (MMK)</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Loading online transactions...
                      </td>
                    </tr>
                  ) : currentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No matching online transactions found.
                      </td>
                    </tr>
                  ) : (
                    currentRows.map((row) => (
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
                          {Number(row.total || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {Number(row.sellingTotal || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row.status || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.timestamp
                            ? new Date(row.timestamp).toLocaleString()
                            : "-"}
                        </td>
                      </tr>
                    ))
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
