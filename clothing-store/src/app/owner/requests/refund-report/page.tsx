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
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<"all" | "refunded" | "partially_refunded" | "pending_refund" | "refund_rejected">("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<"all" | "cash" | "scan" | "cod">("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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
        
        if (isRefundRelated) {
          console.log("Found refund order:", transaction.transactionId, "PaymentStatus:", data.paymentStatus, "Status:", data.status);
          
          // Determine type based on refund data
          if ((data as any).cancellationRefund) {
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
  }, [searchQuery, filterPaymentStatus, filterPaymentMethod, dateRange, allRefunds]);

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

  const exportToCSV = () => {
    const headers = ["Date", "Transaction ID", "Customer", "Amount", "Status", "Payment Method", "Confirmed By"];
    const rows = filteredRefunds.map((item) => {
      const refundDate = item.type === "cancellation"
        ? formatDate((item.transaction as any).cancellationRefund?.requestedAt)
        : formatDate(item.refund?.createdAt);
      
      const status = getRefundStatus(item);
      const amount = getRefundAmount(item);
      const paymentMethod = item.transaction.paymentMethod || "-";
      const confirmedBy = item.type === "cancellation"
        ? (item.transaction as any).cancellationRefund?.confirmedBy || "-"
        : item.refund?.refundedBy || "-";

      return [
        refundDate,
        item.transaction.transactionId,
        item.transaction.customer?.displayName || "Walk-in",
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
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="all">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="scan">QR Scan</option>
                    <option value="cod">COD</option>
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

              {(searchQuery || filterPaymentStatus !== "all" || filterPaymentMethod !== "all" || dateRange.start) && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterPaymentStatus("all");
                      setFilterPaymentMethod("all");
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
                        const refundDate = item.type === "cancellation" && (item.transaction as any).cancellationRefund?.requestedAt
                          ? formatDate((item.transaction as any).cancellationRefund.requestedAt)
                          : item.refund?.createdAt
                          ? formatDate(item.refund.createdAt)
                          : formatDate(item.transaction.createdAt);
                        
                        // Get payment method from transaction
                        const paymentMethod = item.transaction.paymentMethod || "-";
                        
                        // Get confirmed by
                        const confirmedBy = item.type === "cancellation"
                          ? (item.transaction as any).cancellationRefund?.confirmedBy || "-"
                          : item.refund?.refundedBy || "-";

                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {refundDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.transaction.transactionId || "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.transaction.customer?.displayName || "Walk-in"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {formatPrice(amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                              {paymentMethod === "scan" ? "QR Scan" : 
                               paymentMethod === "cod" ? "COD" :
                               paymentMethod.replace("_", " ")}
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
