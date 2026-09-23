"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { transactionService, Transaction } from "@/services/transactionService";
import { 
  XCircle, 
  CheckCircle, 
  Clock, 
  User,
  Calendar,
  Package,
  AlertCircle,
  X,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function CancellationRequestsPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <CancellationRequestsContent />
    </ProtectedRoute>
  );
}

function CancellationRequestsContent() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const { formatPrice } = useCurrency();
  const [requests, setRequests] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Transaction | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load cancellation requests
  useEffect(() => {
    setLoading(true);
    
    const transactionsRef = collection(db!, "transactions");
    const q = query(
      transactionsRef,
      where("status", "!=", "cancelled")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cancelRequests: Transaction[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as Transaction;
        if ((data as any).cancellationRequest?.status === "pending") {
          cancelRequests.push({
            ...data,
            id: doc.id,
          });
        }
      });
      
      // Sort by request time (newest first)
      cancelRequests.sort((a, b) => {
        const aTime = (a as any).cancellationRequest?.requestedAt || "";
        const bTime = (b as any).cancellationRequest?.requestedAt || "";
        return bTime.localeCompare(aTime);
      });
      
      setRequests(cancelRequests);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleApprove = async (transaction: Transaction) => {
    if (!transaction.id) return;

    // Doc: "Handle Cancellations" - Owner + Manager only.
    if (!permissions.canHandleCancellations) {
      toast.error("You do not have permission to approve cancellations.");
      return;
    }

    // Check if this is a paid order (cash/scan)
    const isPaidOrder = transaction.paymentMethod === "cash" || transaction.paymentMethod === "scan";
    
    const confirmMessage = isPaidOrder
      ? `Approve cancellation for Transaction ${transaction.transactionId}?\n\nThis will:\n- Cancel the order\n- Restore inventory\n- Create cancellation refund (${transaction.paymentMethod === "cash" ? "Cash" : "Scan"} payment)\n- Refund amount: ${formatPrice(transaction.total)}\n\nYou will need to confirm the payment in "Pending Refund Payments" after approving.`
      : `Approve cancellation for Transaction ${transaction.transactionId}?\n\nThis will:\n- Cancel the order\n- Restore inventory\n- Update customer notification`;
    
    const confirmed = window.confirm(confirmMessage);
    
    if (!confirmed) return;
    
    setProcessing(transaction.id);
    
    try {
      // Use appropriate cancellation method based on payment status
      if (isPaidOrder) {
        // For paid orders (cash/scan/wallet), use cancelPaidTransaction which creates refund
        await transactionService.cancelPaidTransaction(
          transaction.id,
          transaction,
          (transaction as any).cancellationRequest?.reason || "Approved by owner",
          user?.email || "Owner"
        );
      } else {
        // For COD orders, use regular cancellation
        await transactionService.cancelTransaction(
          transaction.id,
          transaction,
          (transaction as any).cancellationRequest?.reason || "Approved by owner",
          user?.email || "Owner"
        );
      }
      
      // Update cancellation request status
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db!, "transactions", transaction.id), {
        "cancellationRequest.status": "approved",
        "cancellationRequest.approvedAt": new Date().toISOString(),
        "cancellationRequest.approvedBy": user?.email || "Owner",
      });
      
      if (isPaidOrder) {
        toast.success("Cancellation approved! Refund payment confirmation needed.");
      } else {
        toast.success("Cancellation approved successfully!");
      }
    } catch (error) {
      console.error("Error approving cancellation:", error);
      toast.error("Failed to approve cancellation");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (transaction: Transaction) => {
    if (!transaction.id) return;

    // Doc: "Handle Cancellations" - Owner + Manager only.
    if (!permissions.canHandleCancellations) {
      toast.error("You do not have permission to reject cancellations.");
      return;
    }

    const reason = prompt("Enter reason for rejection:");
    if (!reason) return;
    
    setProcessing(transaction.id);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const cancellationRequest = (transaction as any).cancellationRequest;
      
      await updateDoc(doc(db!, "transactions", transaction.id), {
        cancellationRequest: {
          ...cancellationRequest,
          status: "rejected",
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason,
          rejectedBy: user?.email || "Owner",
        },
      });
      
      toast.success("Cancellation rejected");
    } catch (error) {
      console.error("Error rejecting cancellation:", error);
      toast.error("Failed to reject cancellation");
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="cancellation-requests"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="cancellation-requests"
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
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                      Order Cancellation Requests
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      Review and process customer cancellations
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    {requests.length} Pending
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
                    <p className="text-3xl font-bold text-amber-600 mt-2">
                      {requests.length}
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Requests List */}
            {loading ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-rose-200 border-t-rose-500 mx-auto"></div>
                <p className="mt-4 text-gray-600 font-medium">Loading requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-sm border-2 border-dashed border-gray-300 p-12 text-center">
                <div className="inline-flex p-4 bg-white rounded-full shadow-sm mb-4">
                  <XCircle className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Requests</h3>
                <p className="text-gray-500">All cancellation requests have been processed</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => {
                  const cancelReq = (request as any).cancellationRequest;
                  const isProcessing = processing === request.id;
                  const isPaidOrder = request.paymentMethod === "cash" || request.paymentMethod === "scan";
                  
                  return (
                    <div
                      key={request.id}
                      className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-200 overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          {/* Left: Request Info */}
                          <div className="flex-1">
                            <div className="flex items-start gap-3">
                              <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex-shrink-0">
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                {/* Header */}
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <h3 className="text-base font-bold text-gray-900">
                                    {request.transactionId}
                                  </h3>
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                                    PENDING
                                  </span>
                                  {isPaidOrder && (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full border border-rose-200">
                                      REFUND REQUIRED
                                    </span>
                                  )}
                                </div>
                                
                                {/* Details Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-gray-100 rounded-md">
                                      <User className="w-3.5 h-3.5 text-gray-600" />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Customer</p>
                                      <p className="text-xs font-semibold text-gray-900 truncate">
                                        {request.customer?.displayName || "Walk-in"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-gray-100 rounded-md">
                                      <Package className="w-3.5 h-3.5 text-gray-600" />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Items</p>
                                      <p className="text-xs font-semibold text-gray-900">
                                        {request.items.length} item{request.items.length !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-gray-100 rounded-md">
                                      <Calendar className="w-3.5 h-3.5 text-gray-600" />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Requested</p>
                                      <p className="text-xs font-semibold text-gray-900">
                                        {new Date(cancelReq.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-gray-100 rounded-md">
                                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Total</p>
                                      <p className="text-xs font-bold text-gray-900">
                                        {formatPrice(request.total)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Reason */}
                                {cancelReq.reason && (
                                  <div className="mt-2 p-2.5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cancellation Reason</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{cancelReq.reason}</p>
                                  </div>
                                )}

                                {/* QR Code Preview for Scan */}
                                {(request.paymentMethod === "scan") && cancelReq.qrCodeImage && (
                                  <div className="mt-2 p-2.5 bg-rose-50 rounded-lg border border-rose-200">
                                    <div className="flex items-center gap-1.5">
                                      <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                      </svg>
                                      <p className="text-xs font-semibold text-rose-900">Customer Payment Account Attached</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex flex-row sm:flex-row lg:flex-col gap-2 lg:min-w-[140px]">
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowDetailsModal(true);
                              }}
                              className="flex-1 lg:w-full px-3 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-xs"
                            >
                              View Details
                            </button>
                            
                            <button
                              onClick={() => handleApprove(request)}
                              disabled={isProcessing}
                              className="flex-1 lg:w-full px-3 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-lg shadow-green-500/30"
                            >
                              {isProcessing ? (
                                <>
                                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </>
                              )}
                            </button>
                            
                            <button
                              onClick={() => handleReject(request)}
                              disabled={isProcessing}
                              className="flex-1 lg:w-full px-3 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-semibold transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-lg shadow-red-500/30"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-fit max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="px-3 py-1.5 bg-gradient-to-r from-rose-500 to-pink-500 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-xs font-bold text-white">
                  Order #{selectedRequest.transactionId}
                </h2>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-1 hover:bg-white/20 rounded transition-colors text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-2.5 bg-gray-50">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                {/* Transaction Info - Compact Inline */}
                <div className="bg-white rounded p-2 border border-gray-200 col-span-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-0.5 h-2.5 bg-gradient-to-b from-rose-500 to-pink-500 rounded"></div>
                    <h3 className="text-xs font-bold text-gray-700">Transaction</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <span className="text-gray-500 text-xs">Customer</span>
                      <p className="font-semibold text-gray-900 truncate">
                        {selectedRequest.customer?.displayName || "Walk-in"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Payment</span>
                      <p className="font-semibold text-gray-900 capitalize">
                        {selectedRequest.paymentMethod}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Order Summary - Compact */}
                <div className="bg-white rounded p-2 border border-gray-200 col-span-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-0.5 h-2.5 bg-gradient-to-b from-rose-500 to-pink-500 rounded"></div>
                    <h3 className="text-xs font-bold text-gray-700">Summary</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-semibold">{formatPrice(selectedRequest.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tax</span>
                        <span className="font-semibold">{formatPrice(selectedRequest.tax)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center items-end">
                      <span className="text-xs text-gray-500">Total</span>
                      <span className="text-sm font-bold text-rose-600">{formatPrice(selectedRequest.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                {/* Items - Left side */}
                <div className="bg-white rounded p-2 border border-gray-200 lg:col-span-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-0.5 h-2.5 bg-gradient-to-b from-rose-500 to-pink-500 rounded"></div>
                    <h3 className="text-xs font-bold text-gray-700">Items ({selectedRequest.items.length})</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedRequest.items.map((item, index) => (
                      <div
                        key={index}
                        className="bg-gray-50 rounded px-2 py-1.5 flex items-center gap-2 border border-gray-200"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.groupName}
                            className="w-8 h-8 object-cover rounded border border-gray-300 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 text-xs truncate leading-tight">
                            {item.groupName}
                          </h4>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-xs text-gray-600 truncate">
                              {item.selectedColor && `${item.selectedColor}`}
                              {item.selectedColor && item.selectedSize && " · "}
                              {item.selectedSize && `${item.selectedSize}`}
                            </p>
                            <div className="flex items-center gap-1 text-xs flex-shrink-0">
                              <span className="text-gray-600">{item.quantity}</span>
                              <span className="text-gray-400">×</span>
                              <span className="font-bold text-gray-900">{formatPrice(item.quantity * item.unitPrice)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* QR Code - Right side (if exists) */}
                {(selectedRequest.paymentMethod === "scan") && (selectedRequest as any).cancellationRequest?.qrCodeImage ? (
                  <div className="bg-white rounded p-2 border border-rose-200">
                    <div className="flex items-center gap-1 mb-1.5">
                      <svg className="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <div>
                        <p className="text-xs font-bold text-rose-900 leading-tight">Refund QR</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5 border border-gray-200">
                      <img
                        src={(selectedRequest as any).cancellationRequest.qrCodeImage}
                        alt="QR Code"
                        className="w-full rounded"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded p-2 border border-gray-200 flex items-center justify-center">
                    <p className="text-xs text-gray-500 text-center">No QR code required for {selectedRequest.paymentMethod} payment</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-3 py-1.5 bg-white border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-3 py-1 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded font-semibold transition-all text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
