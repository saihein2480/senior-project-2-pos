"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Transaction } from "@/services/transactionService";
import { 
  FileText, 
  CheckCircle, 
  Calendar,
  User,
  CreditCard,
  Package,
  Search,
  Filter,
  Download,
} from "lucide-react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function RefundReportPage() {
  const { user } = useAuth();
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
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");
  const [filterType, setFilterType] = useState<"all" | "cancellation" | "partial">("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load all refunds (completed and pending)
  useEffect(() => {
    setLoading(true);
    
    const transactionsRef = collection(db!, "transactions");
    const q = query(transactionsRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const refunds: Array<{
        transaction: Transaction;
        refund?: any;
        type: "cancellation" | "partial";
      }> = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as Transaction;
        const transaction = { ...data, id: doc.id };
        
        // Check for cancellation refund (any status)
        if ((data as any).cancellationRefund) {
          refunds.push({
            transaction,
            type: "cancellation",
          });
        }
        
        // Check for partial refunds (any status)
        const transactionRefunds = data.refunds || [];
        transactionRefunds.forEach((refund) => {
          refunds.push({
            transaction,
            refund,
            type: "partial",
          });
        });
      });
      
      setAllRefunds(refunds);
      setFilteredRefunds(refunds);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Apply filters
  useEffect(() => {
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

    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter((item) => {
        const status = item.type === "cancellation"
          ? (item.transaction as any).cancellationRefund?.status
          : item.refund?.status;
        return status === filterStatus;
      });
    }

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((item) => item.type === filterType);
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

    setFilteredRefunds(filtered);
  }, [searchQuery, filterStatus, filterType, dateRange, allRefunds]);

  const getRefundDate = (item: typeof allRefunds[0]) => {
    if (item.type === "cancellation") {
      const timestamp = (item.transaction as any).cancellationRefund?.requestedAt;
      if (!timestamp) return "";
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toISOString().split("T")[0];
    } else {
      const timestamp = item.refund?.createdAt;
      if (!timestamp) return "";
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toISOString().split("T")[0];
    }
  };

  const getRefundAmount = (item: typeof allRefunds[0]) => {
    if (item.type === "cancellation") {
      return (item.transaction as any).cancellationRefund?.amount || 0;
    }
    return item.refund?.totalAmount || 0;
  };

  const getRefundStatus = (item: typeof allRefunds[0]) => {
    if (item.type === "cancellation") {
      return (item.transaction as any).cancellationRefund?.status || "unknown";
    }
    return item.refund?.status || "unknown";
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalRefundAmount = filteredRefunds.reduce((sum, item) => sum + getRefundAmount(item), 0);
  const completedRefunds = filteredRefunds.filter((item) => getRefundStatus(item) === "completed");
  const pendingRefunds = filteredRefunds.filter((item) => getRefundStatus(item) === "pending");

  const exportToCSV = () => {
    const headers = ["Date", "Transaction ID", "Customer", "Type", "Amount", "Status", "Payment Method", "Confirmed By"];
    const rows = filteredRefunds.map((item) => {
      const refundDate = item.type === "cancellation"
        ? formatDate((item.transaction as any).cancellationRefund?.requestedAt)
        : formatDate(item.refund?.createdAt);
      
      const status = getRefundStatus(item);
      const amount = getRefundAmount(item);
      const paymentMethod = item.type === "cancellation"
        ? (item.transaction as any).cancellationRefund?.method || "-"
        : item.refund?.refundMethod || "-";
      const confirmedBy = item.type === "cancellation"
        ? (item.transaction as any).cancellationRefund?.confirmedBy || "-"
        : item.refund?.refundedBy || "-";

      return [
        refundDate,
        item.transaction.transactionId,
        item.transaction.customer?.displayName || "Walk-in",
        item.type === "cancellation" ? "Cancellation" : "Partial Refund",
        amount,
        status,
        paymentMethod,
        confirmedBy,
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
    a.download = `refund-report-${new Date().toISOString().split("T")[0]}.csv`;
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
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                      Refund Report
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      Complete history of all refunds
                    </p>
                  </div>
                </div>
                <button
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Refunds</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {filteredRefunds.length}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {completedRefunds.length}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">
                      {pendingRefunds.length}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <Calendar className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatPrice(totalRefundAmount)}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <CreditCard className="w-6 h-6 text-gray-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div className="lg:col-span-2">
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                {/* Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="cancellation">Cancellation</option>
                    <option value="partial">Partial Refund</option>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {(searchQuery || filterStatus !== "all" || filterType !== "all" || dateRange.start) && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterStatus("all");
                      setFilterType("all");
                      setDateRange({ start: "", end: "" });
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
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
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transaction ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment Method
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Confirmed By
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRefunds.map((item, index) => {
                        const status = getRefundStatus(item);
                        const amount = getRefundAmount(item);
                        const refundDate = item.type === "cancellation"
                          ? formatDate((item.transaction as any).cancellationRefund?.requestedAt)
                          : formatDate(item.refund?.createdAt);
                        const paymentMethod = item.type === "cancellation"
                          ? (item.transaction as any).cancellationRefund?.method || "-"
                          : item.refund?.refundMethod || "-";
                        const confirmedBy = item.type === "cancellation"
                          ? (item.transaction as any).cancellationRefund?.confirmedBy || "-"
                          : item.refund?.refundedBy || "-";

                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {refundDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.transaction.transactionId}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.transaction.customer?.displayName || "Walk-in"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                item.type === "cancellation"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}>
                                {item.type === "cancellation" ? "Cancellation" : "Partial Refund"}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {formatPrice(amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                              {paymentMethod.replace("_", " ")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {confirmedBy}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
