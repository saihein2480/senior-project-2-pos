"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { transactionService, Transaction } from "@/services/transactionService";
import { 
  DollarSign, 
  CheckCircle, 
  Clock, 
  User,
  Calendar,
  AlertTriangle,
  X,
  CreditCard,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";

function PendingRefundsContent() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const { formatPrice } = useCurrency();
  const [pendingRefunds, setPendingRefunds] = useState<Array<{
    transaction: Transaction;
    refund?: any;
    type: "cancellation" | "partial";
    qrCodeImage?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<{
    transaction: Transaction;
    refund?: any;
    type: "cancellation" | "partial";
    qrCodeImage?: string;
  } | null>(null);
  const [refundMethod, setRefundMethod] = useState<"cash" | "original_payment" | "bank_transfer">("original_payment");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundStatus, setRefundStatus] = useState<"refunded" | "partially_refunded">("refunded");
  const [isConfirming, setIsConfirming] = useState(false);

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load pending refunds
  useEffect(() => {
    setLoading(true);
    
    const transactionsRef = collection(db!, "transactions");
    // Look for paid orders (cash or scan) with pending refunds
    const q = query(transactionsRef);
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const pending: Array<{
        transaction: Transaction;
        refund?: any;
        type: "cancellation" | "partial";
        qrCodeImage?: string;
      }> = [];
      
      // Collect all transaction data first
      const transactionPromises = snapshot.docs.map(async (doc) => {
        const data = doc.data() as Transaction;
        const transaction = { ...data, id: doc.id };
        
        console.log("Checking transaction:", transaction.transactionId, {
          paymentMethod: data.paymentMethod,
          paymentStatus: data.paymentStatus || data.status,
          deliveryStatus: data.deliveryStatus,
          orderStatus: data.orderStatus,
          hasRefunds: !!data.refunds,
          refundsCount: data.refunds?.length || 0,
          hasRefundRequest: !!(data as any).refundRequest,
          hasQRCode: !!(data as any).refundRequest?.qrCodeImage,
          qrCodePreview: (data as any).refundRequest?.qrCodeImage?.substring(0, 50),
          onlineOrderId: transaction.onlineOrderId,
        });
        
        // Check if it's a paid order (cash, scan, wallet, or delivered COD)
        const isPaidOrder = data.paymentMethod === "cash" || 
                            data.paymentMethod === "scan" ||
                            data.paymentMethod === "wallet" ||
                            (data.paymentMethod === "cod" && 
                             (data.deliveryStatus === "delivered" || 
                              data.orderStatus === "delivered" ||
                              data.orderStatus === "fully_returned" ||
                              data.orderStatus === "partially_returned"));
        
        console.log("isPaidOrder:", isPaidOrder);
        
        if (!isPaidOrder) return null;
        
        // Fetch QR code from onlineOrders if this is an online order
        let qrCodeImage: string | undefined;
        if (transaction.onlineOrderId) {
          try {
            const { doc: firestoreDoc, getDoc } = await import("firebase/firestore");
            const onlineOrderRef = firestoreDoc(db!, "onlineOrders", transaction.onlineOrderId);
            const onlineOrderSnap = await getDoc(onlineOrderRef);
            if (onlineOrderSnap.exists()) {
              const onlineOrderData = onlineOrderSnap.data();
              qrCodeImage = onlineOrderData.refundRequest?.qrCodeImage || 
                           onlineOrderData.cancellationRequest?.qrCodeImage;
              console.log("Found QR code from onlineOrder:", {
                orderId: transaction.onlineOrderId,
                hasQRCode: !!qrCodeImage,
                qrPreview: qrCodeImage?.substring(0, 50),
              });
            }
          } catch (error) {
            console.error("Error fetching online order:", error);
          }
        }
        
        // Also check transaction itself for QR code
        if (!qrCodeImage) {
          qrCodeImage = (data as any).refundRequest?.qrCodeImage || 
                       (data as any).cancellationRequest?.qrCodeImage;
        }
        
        // Check if payment status is "pending_refund"
        const paymentStatus = (data.paymentStatus || data.status || "").toLowerCase();
        if (paymentStatus === "pending_refund") {
          console.log("Found transaction with pending_refund status:", transaction.transactionId);
          
          const refunds = data.refunds || [];
          const pendingRefund = refunds.find(r => r.status === "pending");
          
          if (pendingRefund) {
            // Use the actual refund from the refunds array
            console.log("Found pending refund:", pendingRefund.refundId);
            return {
              transaction,
              refund: pendingRefund,
              type: "partial" as const,
              qrCodeImage,
            };
          } else {
            // No pending refund in array yet - skip this transaction for now
            // It will appear once the refund is created via processRefund
            console.warn("Transaction has pending_refund status but no pending refund in array yet - skipping for now:", transaction.transactionId);
            return null;
          }
        }
        
        // Check for pending cancellation refund
        if ((data as any).cancellationRefund?.status === "pending") {
          return {
            transaction,
            type: "cancellation" as const,
            qrCodeImage,
          };
        }
        
        // Check for pending refunds without pending_refund payment status
        const refunds = data.refunds || [];
        const foundRefunds = refunds
          .filter(refund => refund.status === "pending" && paymentStatus !== "pending_refund")
          .map(refund => ({
            transaction,
            refund,
            type: "partial" as const,
            qrCodeImage,
          }));
        
        return foundRefunds.length > 0 ? foundRefunds : null;
      });
      
      const results = await Promise.all(transactionPromises);
      
      // Flatten results and filter nulls
      results.forEach(result => {
        if (result) {
          if (Array.isArray(result)) {
            pending.push(...result);
          } else {
            pending.push(result);
          }
        }
      });
      
      // Remove duplicates
      const uniquePending = pending.filter((item, index, self) => {
        return index === self.findIndex((t) => (
          t.transaction.id === item.transaction.id &&
          (t.refund?.refundId === item.refund?.refundId || (!t.refund && !item.refund))
        ));
      });
      
      // Sort by date (newest first)
      uniquePending.sort((a, b) => {
        const aTime = a.type === "cancellation" 
          ? (a.transaction as any).cancelledAt?.toDate().getTime() || 0
          : a.refund?.createdAt?.toDate().getTime() || 0;
        const bTime = b.type === "cancellation"
          ? (b.transaction as any).cancelledAt?.toDate().getTime() || 0
          : b.refund?.createdAt?.toDate().getTime() || 0;
        return bTime - aTime;
      });
      
      console.log("Final pending refunds:", uniquePending.length, uniquePending.map(p => ({
        transactionId: p.transaction.transactionId,
        refundId: p.refund?.refundId,
        type: p.type,
        hasQRCode: !!p.qrCodeImage,
      })));
      
      setPendingRefunds(uniquePending);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleConfirmPayment = async () => {
    if (!selectedRefund) return;

    // Doc: "Issue Refund Payments" - Owner + Manager only.
    if (!permissions.canApprovePayments) {
      toast.error("You do not have permission to issue refund payments.");
      return;
    }

    setIsConfirming(true);
    
    try {
      console.log("Confirming payment for:", {
        transactionId: selectedRefund.transaction.id,
        type: selectedRefund.type,
        refundId: selectedRefund.refund?.refundId,
        refundMethod,
        refundStatus,
        refundNotes,
      });

      if (selectedRefund.type === "cancellation") {
        console.log("Calling confirmCancellationRefund...");
        await transactionService.confirmCancellationRefund(
          selectedRefund.transaction.id!,
          refundMethod,
          user?.email || "Owner",
          refundNotes || undefined,
          undefined,
          refundStatus
        );
        console.log("confirmCancellationRefund completed successfully");
      } else {
        // Verify we have a valid refund ID
        if (!selectedRefund.refund || !selectedRefund.refund.refundId) {
          throw new Error("No valid refund ID found. Please refresh and try again.");
        }
        
        console.log("Calling confirmRefundPayment...");
        await transactionService.confirmRefundPayment(
          selectedRefund.transaction.id!,
          selectedRefund.refund.refundId,
          refundMethod,
          user?.email || "Owner",
          refundNotes || undefined,
          undefined,
          refundStatus
        );
        console.log("confirmRefundPayment completed successfully");
      }
      
      toast.success("Refund payment confirmed successfully!");
      setShowConfirmModal(false);
      setSelectedRefund(null);
      setRefundMethod("original_payment");
      setRefundStatus("refunded");
      setRefundNotes("");
    } catch (error) {
      console.error("Error confirming refund payment:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        selectedRefund: {
          transactionId: selectedRefund.transaction.id,
          refundId: selectedRefund.refund?.refundId,
          type: selectedRefund.type,
        },
      });
      toast.error(`Failed to confirm refund payment: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const formatPaymentMethodDisplay = (method: string) => {
    if (method === "wallet" || method === "scan") return "QR Scan";
    if (method === "cash") return "Cash";
    return method;
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

  const getRefundAmount = (item: typeof pendingRefunds[0]) => {
    if (item.type === "cancellation") {
      // For full cancellation, always use the transaction total (includes tax)
      // This is the full amount the customer paid and should receive back
      return item.transaction.total || 0;
    }
    
    // For partial refunds, check the order status
    const orderStatus = item.transaction.orderStatus || "";
    const paymentStatus = item.transaction.paymentStatus || item.transaction.status || "";
    
    // If order is marked as "fully_returned", customer should get full amount back including tax
    if (orderStatus === "fully_returned" || paymentStatus === "refunded") {
      return item.transaction.total || 0;
    }
    
    // For partially returned orders, use the refund amount (without tax)
    return item.refund?.totalAmount || 0;
  };

  const totalPendingAmount = pendingRefunds.reduce((sum, item) => sum + getRefundAmount(item), 0);

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="pending-refunds"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="pending-refunds"
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

        <main className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                    Refund Payment
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Confirm refund payments for cash and scan orders
                  </p>
                </div>
              </div>
            </div>

            {/* Alert Banner */}
            {pendingRefunds.length > 0 && (
              <div className="mb-3 bg-gradient-to-r from-red-50 to-orange-50 border-l-2 border-red-500 p-2.5 rounded-r-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-red-800">
                      {pendingRefunds.length} refund{pendingRefunds.length !== 1 ? 's' : ''} awaiting confirmation
                    </h3>
                    <p className="text-xs text-red-700 mt-0.5">
                      Total: {formatPrice(totalPendingAmount)} · Confirm after returning money
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Pending</p>
                    <p className="text-lg font-bold text-red-600 mt-0.5">
                      {pendingRefunds.length}
                    </p>
                  </div>
                  <div className="p-1.5 bg-red-50 rounded">
                    <Clock className="w-4 h-4 text-red-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Amount</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5 truncate">
                      {formatPrice(totalPendingAmount)}
                    </p>
                  </div>
                  <div className="p-1.5 bg-gray-50 rounded">
                    <DollarSign className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Status</p>
                    <p className="text-xs font-bold text-orange-600 mt-0.5">
                      Owed
                    </p>
                  </div>
                  <div className="p-1.5 bg-orange-50 rounded">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Refunds List */}
            {loading ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-rose-500 border-t-transparent mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Loading...</p>
              </div>
            ) : pendingRefunds.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-gray-900 font-semibold text-sm">All Confirmed!</p>
                <p className="text-gray-600 text-xs mt-1">No pending refunds</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingRefunds.map((item, index) => {
                  const refundAmount = getRefundAmount(item);
                  
                  return (
                    <div
                      key={`${item.transaction.id}-${index}`}
                      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        {/* Left: Order Info only (4 columns) */}
                        <div className="lg:col-span-4">
                          <div className="flex items-start gap-2">
                            <div className="p-1.5 bg-red-50 rounded flex-shrink-0">
                              <DollarSign className="w-4 h-4 text-red-600" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                <h3 className="text-sm font-bold text-gray-900">
                                  {item.transaction.transactionId}
                                </h3>
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-semibold rounded">
                                  Pending
                                </span>
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-medium rounded capitalize">
                                  {item.type === "cancellation" ? "Cancel" : "Partial"}
                                </span>
                              </div>
                              
                              <div className="space-y-1 text-xs text-gray-600">
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">
                                    {item.transaction.customer?.displayName || "Walk-in"}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <CreditCard className="w-3 h-3 flex-shrink-0" />
                                  <span className="capitalize">
                                    {item.transaction.paymentMethod}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-[10px]">
                                    {item.type === "cancellation" 
                                      ? formatDate((item.transaction as any).cancelledAt)
                                      : formatDate(item.refund?.createdAt)
                                    }
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Middle Left: Items and Refund Amount stacked vertically (3 columns) */}
                        <div className="lg:col-span-3 space-y-1.5">
                          {/* Partial Refund Items */}
                          {item.type === "partial" && item.refund && (
                            <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded p-1.5">
                              <div className="flex items-center gap-0.5 mb-0.5">
                                <div className="w-1 h-1 bg-rose-500 rounded-full"></div>
                                <p className="text-[9px] font-bold text-rose-900">
                                  Items
                                </p>
                              </div>
                              <div className="bg-white rounded p-1 border border-rose-100">
                                <p className="text-[9px] text-rose-800 font-semibold truncate leading-tight">
                                  {item.refund.refundId}
                                </p>
                                <p className="text-[8px] text-rose-600 leading-tight">
                                  {item.refund.items.length} item(s)
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {/* Refund Amount - Always show */}
                          <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded p-1.5">
                            <p className="text-[9px] font-bold text-red-900 mb-0.5 leading-tight">Refund</p>
                            <div className="text-center">
                              <span className="text-base font-bold text-red-600 leading-none">
                                {formatPrice(refundAmount)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Middle Right: QR Code (3 columns) - Show for ALL pending refunds with uploaded QR */}
                        <div className="lg:col-span-3">
                          {/* Display QR Code if uploaded by customer */}
                          {item.qrCodeImage ? (
                            <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-lg p-2 h-full flex flex-col">
                              <div className="flex items-center gap-1.5 mb-2">
                                <div className="p-1 bg-gradient-to-r from-rose-500 to-pink-500 rounded">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                  </svg>
                                </div>
                                <p className="text-xs font-bold text-rose-900">
                                  Customer QR
                                </p>
                              </div>
                              <div className="bg-white rounded p-2 border border-rose-200 flex-1 flex items-center justify-center">
                                <img
                                  src={item.qrCodeImage}
                                  alt="Customer Payment QR"
                                  className="w-full max-w-[100px] max-h-24 object-contain rounded"
                                />
                              </div>
                              <p className="text-[9px] text-rose-700 text-center mt-1.5">
                                Transfer refund here
                              </p>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-[10px] text-center px-2 bg-gray-50 rounded-lg border border-gray-200">
                              <div>
                                <p className="font-semibold">No QR uploaded</p>
                                <p className="mt-0.5">Contact customer</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Action Button (2 columns) */}
                        <div className="lg:col-span-2 flex flex-row lg:flex-col gap-2 lg:justify-center lg:items-center">
                          <button
                            onClick={() => {
                              setSelectedRefund(item);
                              setShowConfirmModal(true);
                            }}
                            className="flex-1 lg:flex-none lg:w-28 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-green-200"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                          <p className="hidden lg:block text-[10px] text-center text-gray-500 leading-tight">
                            After returning money
                          </p>
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

      {/* Confirm Payment Modal - Pink themed */}
      {showConfirmModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            {/* Header with pink gradient */}
            <div className="p-5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-t-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Confirm Refund Payment
              </h2>
              <p className="text-xs text-pink-100 mt-1">
                {selectedRefund.transaction.transactionId}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Critical Warning */}
              <div className="bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-900 mb-1">Critical</p>
                    <p className="text-xs text-red-800">
                      Confirm only after physically giving money to customer
                    </p>
                  </div>
                </div>
              </div>

              {/* Refund Amount */}
              <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 border-2 border-rose-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-rose-900">Refund Amount</span>
                  <span className="text-2xl font-bold text-pink-600">
                    {formatPrice(getRefundAmount(selectedRefund))}
                  </span>
                </div>
              </div>

              {/* Refund Status Choice */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">
                  Refund Status <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-start p-4 border-2 border-gray-300 bg-white rounded-xl cursor-pointer hover:border-pink-400 transition-colors">
                    <input
                      type="radio"
                      name="refundStatus"
                      value="refunded"
                      checked={refundStatus === "refunded"}
                      onChange={(e) => setRefundStatus(e.target.value as any)}
                      className="w-4 h-4 text-pink-600 mt-0.5 flex-shrink-0"
                    />
                    <div className="ml-3 flex-1">
                      <span className="text-sm font-bold text-gray-900 block">
                        Fully Refunded
                      </span>
                      <p className="text-xs text-gray-600 mt-1">
                        Customer received full refund amount
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start p-4 border-2 border-gray-300 bg-white rounded-xl cursor-pointer hover:border-pink-400 transition-colors">
                    <input
                      type="radio"
                      name="refundStatus"
                      value="partially_refunded"
                      checked={refundStatus === "partially_refunded"}
                      onChange={(e) => setRefundStatus(e.target.value as any)}
                      className="w-4 h-4 text-pink-600 mt-0.5 flex-shrink-0"
                    />
                    <div className="ml-3 flex-1">
                      <span className="text-sm font-bold text-gray-900 block">
                        Partially Refunded
                      </span>
                      <p className="text-xs text-gray-600 mt-1">
                        Customer received partial refund amount
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setSelectedRefund(null);
                    setRefundMethod("original_payment");
                    setRefundStatus("refunded");
                    setRefundNotes("");
                  }}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-semibold text-sm shadow-lg shadow-rose-200"
                >
                  {isConfirming ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PendingRefundsPage() {
  // Doc: "Issue Refund Payments" - Owner + Manager only.
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <PendingRefundsContent />
    </ProtectedRoute>
  );
}
