"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { transactionService, Transaction } from "@/services/transactionService";
import { 
  RotateCcw, 
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

export default function RefundRequestsPage() {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const { businessSettings } = useSettings();
  const [requests, setRequests] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Transaction | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundItems, setRefundItems] = useState<{ [key: string]: number }>({});
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false);
  const [selectedRefundForConfirmation, setSelectedRefundForConfirmation] = useState<{
    transaction: Transaction;
    refund: any;
  } | null>(null);
  const [refundMethod, setRefundMethod] = useState<"cash" | "original_payment" | "bank_transfer">("cash");
  const [refundNotes, setRefundNotes] = useState("");
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [selectedRefundStatus, setSelectedRefundStatus] = useState<"refunded" | "partially_refunded">("refunded");
  
  // Return inspection state
  const [showReturnReceivedModal, setShowReturnReceivedModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [inspectionResults, setInspectionResults] = useState<{ [itemIndex: number]: "accepted" | "damaged" }>({});
  const [damageReasons, setDamageReasons] = useState<{ [itemIndex: number]: string }>({});
  const [returnStatus, setReturnStatus] = useState<"fully_returned" | "partially_returned">("fully_returned");

  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load refund requests
  useEffect(() => {
    setLoading(true);
    
    const transactionsRef = collection(db!, "transactions");
    
    // Listen to all transactions and filter in-memory for refund requests
    // This allows us to catch both delivered orders and cancelled orders with refund requests
    const unsubscribe = onSnapshot(transactionsRef, (snapshot) => {
      const refundRequests: Transaction[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as Transaction;
        const refundReq = (data as any).refundRequest;
        
        // Show pending refund requests OR approved return requests that haven't been fully processed
        if (refundReq?.status === "pending") {
          refundRequests.push({
            ...data,
            id: doc.id,
          });
        } else if (refundReq?.status === "approved" && refundReq?.type === "return" && refundReq.status !== "completed") {
          // Show approved return requests that are still in progress (awaiting return/inspection)
          // Don't show if status is "completed" (inspection done, moved to Pending Refund Payments)
          refundRequests.push({
            ...data,
            id: doc.id,
          });
        }
      });
      
      // Sort by request time (newest first)
      refundRequests.sort((a, b) => {
        const aTime = (a as any).refundRequest?.requestedAt || "";
        const bTime = (b as any).refundRequest?.requestedAt || "";
        return bTime.localeCompare(aTime);
      });
      
      setRequests(refundRequests);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleApproveReturn = async (transaction: Transaction) => {
    if (!transaction.id) return;
    
    setProcessing(transaction.id);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const refundRequest = (transaction as any).refundRequest;
      
      await updateDoc(doc(db!, "transactions", transaction.id), {
        refundRequest: {
          ...refundRequest,
          status: "approved",
          approvedAt: new Date().toISOString(),
          approvedBy: user?.email || "Owner",
        },
      });
      
      toast.success("Return request approved! Customer can now bring items to store.");
    } catch (error) {
      console.error("Error approving return:", error);
      toast.error("Failed to approve return");
    } finally {
      setProcessing(null);
    }
  };

  const handleProcessRefund = (transaction: Transaction) => {
    const refundReq = (transaction as any).refundRequest;
    
    // Check if this is a "return" type refund
    if (refundReq.type === "return") {
      // Step 1: Must be approved first (if still pending, shouldn't reach here based on button logic)
      if (refundReq.status === "pending") {
        toast.error("Please approve the return request first");
        return;
      }
      
      // Step 2: After approval, mark as returned when customer brings items
      if (refundReq.status === "approved" && !refundReq.returnReceived) {
        setSelectedRequest(transaction);
        setShowReturnReceivedModal(true);
        return;
      }
      
      // Step 3: After return received, do inspection
      if (refundReq.returnReceived && !refundReq.inspectionCompleted) {
        setSelectedRequest(transaction);
        
        // Initialize inspection results if not set
        const requestedItems = refundReq.items || [];
        const initialInspection: { [itemIndex: number]: "accepted" | "damaged" } = {};
        transaction.items.forEach((item, index) => {
          const requestedItem = requestedItems.find(
            (ri: any) => ri.id === item.id || ri.groupName === item.groupName
          );
          if (requestedItem && requestedItem.quantity > 0) {
            // Default to accepted
            initialInspection[index] = "accepted";
          }
        });
        setInspectionResults(initialInspection);
        setShowInspectionModal(true);
        return;
      }
    }
    
    // For cancellation type or already inspected returns, proceed with normal refund
    setSelectedRequest(transaction);
    
    // Pre-fill refund items from customer request
    const requestedItems = (transaction as any).refundRequest?.items || [];
    const initialRefundItems: { [key: string]: number } = {};
    
    transaction.items.forEach((item, index) => {
      // Find matching item in customer's request
      const requestedItem = requestedItems.find(
        (ri: any) => ri.id === item.id || ri.groupName === item.groupName
      );
      
      if (requestedItem) {
        initialRefundItems[`${item.id}___${index}`] = requestedItem.quantity;
      } else {
        initialRefundItems[`${item.id}___${index}`] = 0;
      }
    });
    
    setRefundItems(initialRefundItems);
    setShowRefundModal(true);
  };

  const handleSubmitRefund = async () => {
    if (!selectedRequest || !selectedRequest.id) return;
    
    // Validate that there are items to refund
    const hasItemsToRefund = Object.values(refundItems).some(qty => qty > 0);
    if (!hasItemsToRefund) {
      toast.error("Please select at least one item to refund");
      return;
    }
    
    setProcessing(selectedRequest.id);
    
    try {
      // COD orders are considered "paid" once delivered (customer paid cash on delivery)
      const isPaidOrder = selectedRequest.paymentMethod === "cash" || 
                          selectedRequest.paymentMethod === "scan" || 
                          selectedRequest.paymentMethod === "wallet" ||
                          (selectedRequest.paymentMethod === "cod" && 
                           (selectedRequest.deliveryStatus === "delivered" || selectedRequest.orderStatus === "delivered"));
      const refundReq = (selectedRequest as any).refundRequest;
      
      // Get inspection results if this is a return type refund that was inspected
      let inspectionResultsForRefund = undefined;
      if (refundReq.type === "return" && refundReq.inspectionCompleted && refundReq.itemInspectionResults) {
        inspectionResultsForRefund = {};
        refundReq.itemInspectionResults.forEach((result: any) => {
          inspectionResultsForRefund![result.itemIndex] = result.status;
        });
      }
      
      // Process the refund
      await transactionService.processRefund(
        selectedRequest.id,
        refundItems,
        selectedRequest,
        (selectedRequest as any).refundRequest?.reason || "Customer requested refund",
        user?.email || "Owner",
        undefined, // refundMethod is set later during payment confirmation
        inspectionResultsForRefund // Pass inspection results
      );
      
      // Update refund request status
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db!, "transactions", selectedRequest.id), {
        "refundRequest.status": "approved",
        "refundRequest.approvedAt": new Date().toISOString(),
        "refundRequest.approvedBy": user?.email || "Owner",
      });
      
      if (isPaidOrder) {
        toast.success("Refund processed! Please confirm payment to customer.");
      } else {
        toast.success("Refund processed successfully!");
      }
      
      setShowRefundModal(false);
      setSelectedRequest(null);
      setRefundItems({});
    } catch (error) {
      console.error("Error processing refund:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        selectedRequest: selectedRequest?.id,
        refundItems,
      });
      toast.error(`Failed to process refund: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirmRefundPayment = async () => {
    if (!selectedRefundForConfirmation) return;
    
    setIsConfirmingPayment(true);
    
    try {
      console.log("Confirming refund payment with status:", selectedRefundStatus);
      
      await transactionService.confirmRefundPayment(
        selectedRefundForConfirmation.transaction.id!,
        selectedRefundForConfirmation.refund.refundId,
        refundMethod,
        user?.email || "Owner",
        refundNotes || undefined,
        undefined, // refundProofUrl
        selectedRefundStatus, // Pass the selected refund status
      );
      
      toast.success(`Refund payment confirmed! Status: ${selectedRefundStatus === "refunded" ? "Fully Refunded" : "Partially Refunded"}`);
      setShowConfirmPaymentModal(false);
      setSelectedRefundForConfirmation(null);
      setRefundMethod("cash");
      setRefundNotes("");
      setSelectedRefundStatus("refunded"); // Reset to default
    } catch (error) {
      console.error("Error confirming refund payment:", error);
      toast.error("Failed to confirm refund payment");
    } finally {
      setIsConfirmingPayment(false);
    }
  };
  
  const handleMarkReturnReceived = async () => {
    if (!selectedRequest || !selectedRequest.id) return;
    
    setProcessing(selectedRequest.id);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const refundRequest = (selectedRequest as any).refundRequest;
      
      // Update transaction with return received status AND order status based on selected return status
      await updateDoc(doc(db!, "transactions", selectedRequest.id), {
        refundRequest: {
          ...refundRequest,
          returnReceived: true,
          returnReceivedAt: new Date().toISOString(),
          returnReceivedBy: user?.email || "Owner",
          returnStatus: returnStatus, // Save the selected return status
        },
        orderStatus: returnStatus, // Update order status immediately (fully_returned or partially_returned)
      });
      
      // Also update onlineOrders collection if this is an online order
      if (selectedRequest.onlineOrderId) {
        const onlineOrderRef = doc(db!, "onlineOrders", selectedRequest.onlineOrderId);
        await updateDoc(onlineOrderRef, {
          status: returnStatus, // Update status in onlineOrders collection
          orderStatus: returnStatus,
          lastUpdated: new Date().toISOString(),
        });
      }
      
      toast.success(`Items marked as ${returnStatus === "fully_returned" ? "fully" : "partially"} returned. Please proceed with inspection.`);
      setShowReturnReceivedModal(false);
      
      // Automatically open inspection modal
      setTimeout(() => {
        const requestedItems = refundRequest.items || [];
        const initialInspection: { [itemIndex: number]: "accepted" | "damaged" } = {};
        selectedRequest.items.forEach((item, index) => {
          const requestedItem = requestedItems.find(
            (ri: any) => ri.id === item.id || ri.groupName === item.groupName
          );
          if (requestedItem && requestedItem.quantity > 0) {
            initialInspection[index] = "accepted";
          }
        });
        setInspectionResults(initialInspection);
        setShowInspectionModal(true);
      }, 500);
    } catch (error) {
      console.error("Error marking return received:", error);
      toast.error("Failed to mark return received");
    } finally {
      setProcessing(null);
    }
  };
  
  const handleCompleteInspection = async () => {
    if (!selectedRequest || !selectedRequest.id) return;
    
    // Validate that all items have inspection results
    const refundReq = (selectedRequest as any).refundRequest;
    const requestedItems = refundReq.items || [];
    
    const missingInspection = requestedItems.some((reqItem: any) => {
      const itemIndex = selectedRequest.items.findIndex(
        (item) => item.id === reqItem.id || item.groupName === reqItem.groupName
      );
      return itemIndex >= 0 && !inspectionResults[itemIndex];
    });
    
    if (missingInspection) {
      toast.error("Please inspect all returned items");
      return;
    }
    
    setProcessing(selectedRequest.id);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      
      // Build inspection results array
      const itemInspectionResults = Object.entries(inspectionResults).map(([itemIndex, status]) => ({
        itemIndex: parseInt(itemIndex),
        status,
        inspectedAt: new Date().toISOString(),
      }));
      
      // Create the refund items based on inspection
      const refundItems: { [key: string]: number } = {};
      selectedRequest.items.forEach((item, index) => {
        const requestedItem = requestedItems.find(
          (ri: any) => ri.id === item.id || ri.groupName === item.groupName
        );
        
        if (requestedItem && requestedItem.quantity > 0) {
          const key = `${item.id || item.groupName}___${index}`;
          refundItems[key] = requestedItem.quantity;
          console.log(`Adding refund item: ${key} = ${requestedItem.quantity}`);
        }
      });
      
      console.log("Refund items prepared:", refundItems);
      
      // Validate we have items to refund
      if (Object.keys(refundItems).length === 0) {
        throw new Error("No items to refund. Check item matching logic.");
      }
      
      // Process the refund immediately (creates pending refund for paid orders)
      // COD orders are considered "paid" once delivered (customer paid cash on delivery)
      // Also consider orders that are already marked as fully_returned or partially_returned
      // IMPORTANT: We're in the inspection phase, which means items were already marked as returned
      // So we check the refundRequest.returnReceived flag as proof that items were received
      const refundReq = (selectedRequest as any).refundRequest;
      const isReturnTypeRefund = refundReq?.type === "return" && refundReq?.returnReceived;
      
      const isPaidOrder = selectedRequest.paymentMethod === "cash" || 
                          selectedRequest.paymentMethod === "scan" || 
                          selectedRequest.paymentMethod === "wallet" ||
                          isReturnTypeRefund || // If it's a return type and items were received, it must be paid/delivered
                          (selectedRequest.paymentMethod === "cod" && 
                           (selectedRequest.deliveryStatus === "delivered" || 
                            selectedRequest.orderStatus === "delivered" ||
                            selectedRequest.orderStatus === "fully_returned" ||
                            selectedRequest.orderStatus === "partially_returned"));
      
      if (!isPaidOrder) {
        const isCODNotDelivered = selectedRequest.paymentMethod === "cod" && 
                                   selectedRequest.deliveryStatus !== "delivered" &&
                                   selectedRequest.orderStatus !== "delivered" &&
                                   selectedRequest.orderStatus !== "fully_returned" &&
                                   selectedRequest.orderStatus !== "partially_returned" &&
                                   !isReturnTypeRefund;
        const errorMessage = isCODNotDelivered 
          ? "COD order has not been delivered yet. Customer has not paid. Cannot process return refund."
          : "This order was not paid yet. Cannot process return refund.";
        toast.error(errorMessage);
        setProcessing(null);
        return;
      }
      
      // Convert inspection results to the format expected by processRefund
      const inspectionResultsForRefund: { [itemIndex: number]: "accepted" | "damaged" } = {};
      itemInspectionResults.forEach((result) => {
        inspectionResultsForRefund[result.itemIndex] = result.status as "accepted" | "damaged";
      });
      
      // **NEW LOGIC: Check if ALL items are damaged**
      const allDamaged = itemInspectionResults.every(result => result.status === "damaged");
      const hasAcceptedItems = itemInspectionResults.some(result => result.status === "accepted");
      
      console.log("Inspection analysis:", {
        allDamaged,
        hasAcceptedItems,
        inspectionResults: inspectionResultsForRefund,
      });
      
      // STEP 1: Confirm return status (updates ONLY orderStatus, NOT payment status)
      await transactionService.confirmReturnStatus(
        selectedRequest.id,
        returnStatus, // "fully_returned" or "partially_returned"
        user?.email || "Owner"
      );
      
      if (allDamaged) {
        // **SCENARIO: ALL ITEMS ARE DAMAGED - NO REFUND (REJECTED)**
        console.log("All items damaged - marking as refund rejected");
        
        // Update transaction with inspection results and refund_rejected status
        await updateDoc(doc(db!, "transactions", selectedRequest.id), {
          "refundRequest.inspectionCompleted": true,
          "refundRequest.itemInspectionResults": itemInspectionResults,
          "refundRequest.inspectedBy": user?.email || "Owner",
          "refundRequest.inspectedAt": new Date().toISOString(),
          "refundRequest.status": "completed_no_refund", // Mark as completed but no refund
          "paymentStatus": "refund_rejected", // Changed from "no_refund_needed" to "refund_rejected"
          "status": "refund_rejected",
        });
        
        // Also update onlineOrders collection
        if (selectedRequest.onlineOrderId) {
          const onlineOrderRef = doc(db!, "onlineOrders", selectedRequest.onlineOrderId);
          await updateDoc(onlineOrderRef, {
            paymentStatus: "refund_rejected",
            lastUpdated: new Date().toISOString(),
          });
        }
        
        // Create notification for customer
        if (selectedRequest.customer?.uid) {
          const { addDoc, collection: firestoreCollection, serverTimestamp } = await import("firebase/firestore");
          
          const notificationData: any = {
            userId: selectedRequest.customer.uid,
            type: "refund_rejected",
            title: "Refund Rejected",
            message: `Sorry, your return for order ${selectedRequest.transactionId} cannot be refunded. All returned items were damaged and not in resellable condition.`,
            orderId: selectedRequest.transactionId,
            transactionId: selectedRequest.id,
            read: false,
            createdAt: serverTimestamp(),
          };
          
          // Only add optional fields if they have values
          if (selectedRequest.onlineOrderId) {
            notificationData.onlineOrderId = selectedRequest.onlineOrderId;
          }
          if (selectedRequest.branchId || businessSettings?.branchId) {
            notificationData.branchId = selectedRequest.branchId || businessSettings?.branchId;
          }
          
          await addDoc(firestoreCollection(db!, "notifications"), notificationData);
        }
        
        toast.success("Inspection complete! All items damaged - refund rejected. Customer notification sent.");
      } else {
        // **SCENARIO: HAS ACCEPTED ITEMS - CREATE PENDING REFUND**
        console.log("Has accepted items - creating pending refund for accepted items only");
        
        // Filter refund items to include ONLY accepted items
        const acceptedRefundItems: { [key: string]: number } = {};
        Object.entries(refundItems).forEach(([key, quantity]) => {
          const [, indexStr] = key.split("___");
          const itemIndex = parseInt(indexStr);
          
          if (inspectionResultsForRefund[itemIndex] === "accepted") {
            acceptedRefundItems[key] = quantity;
            console.log(`Including accepted item for refund: ${key} = ${quantity}`);
          } else {
            console.log(`Excluding damaged item from refund: ${key}`);
          }
        });
        
        if (Object.keys(acceptedRefundItems).length === 0) {
          throw new Error("Logic error: hasAcceptedItems is true but no accepted items found");
        }
        
        // Update transaction with inspection results and pending_refund status
        await updateDoc(doc(db!, "transactions", selectedRequest.id), {
          "refundRequest.inspectionCompleted": true,
          "refundRequest.itemInspectionResults": itemInspectionResults,
          "refundRequest.inspectedBy": user?.email || "Owner",
          "refundRequest.inspectedAt": new Date().toISOString(),
          "refundRequest.status": "completed", // Mark return request as completed
          "paymentStatus": "pending_refund", // Update payment status to pending_refund
        });
        
        // Also update onlineOrders collection payment status
        if (selectedRequest.onlineOrderId) {
          const onlineOrderRef = doc(db!, "onlineOrders", selectedRequest.onlineOrderId);
          await updateDoc(onlineOrderRef, {
            paymentStatus: "pending_refund",
            lastUpdated: new Date().toISOString(),
          });
        }
        
        // Get fresh transaction data
        const { getDoc } = await import("firebase/firestore");
        const transactionRef = doc(db!, "transactions", selectedRequest.id);
        const updatedTransactionDoc = await getDoc(transactionRef);
        
        if (!updatedTransactionDoc.exists()) {
          throw new Error("Transaction not found after inspection update");
        }
        
        const updatedTransaction = {
          ...updatedTransactionDoc.data(),
          id: updatedTransactionDoc.id,
        } as Transaction;
        
        // Process refund ONLY for accepted items
        await transactionService.processRefund(
          selectedRequest.id,
          acceptedRefundItems, // ✅ Only accepted items
          updatedTransaction,
          refundReq.reason || "Customer return request",
          user?.email || "Owner",
          undefined, // refundMethod will be set during payment confirmation
          inspectionResultsForRefund, // Pass all inspection results for inventory logic
          undefined // Do NOT pass returnStatus here - we already set orderStatus above
        );
        
        const damagedCount = itemInspectionResults.filter(r => r.status === "damaged").length;
        const acceptedCount = itemInspectionResults.filter(r => r.status === "accepted").length;
        
        // Create notification for customer if there are damaged items
        if (damagedCount > 0 && selectedRequest.customer?.uid) {
          const { addDoc, collection: firestoreCollection, serverTimestamp } = await import("firebase/firestore");
          
          const notificationData: any = {
            userId: selectedRequest.customer.uid,
            type: "partial_refund_with_damaged_items",
            title: "Partial Refund",
            message: `Your return for order ${selectedRequest.transactionId}:\n\n✅ ${acceptedCount} item(s) accepted - Refund approved\n❌ ${damagedCount} item(s) damaged - No refund\n\nOnly accepted items will be refunded.`,
            orderId: selectedRequest.transactionId,
            transactionId: selectedRequest.id,
            read: false,
            createdAt: serverTimestamp(),
          };
          
          // Only add optional fields if they have values
          if (selectedRequest.onlineOrderId) {
            notificationData.onlineOrderId = selectedRequest.onlineOrderId;
          }
          if (selectedRequest.branchId || businessSettings?.branchId) {
            notificationData.branchId = selectedRequest.branchId || businessSettings?.branchId;
          }
          
          await addDoc(firestoreCollection(db!, "notifications"), notificationData);
        }
        
        toast.success(`Inspection complete! ${acceptedCount} accepted item(s) will be refunded. ${damagedCount} damaged item(s) excluded. ${damagedCount > 0 ? "Customer notification sent. " : ""}Go to 'Pending Refund Payments' to process payment.`);
      }
      
      setShowInspectionModal(false);
      setInspectionResults({});
      setDamageReasons({}); // Reset damage reasons
      setReturnStatus("fully_returned"); // Reset for next use
      setSelectedRequest(null);
    } catch (error) {
      console.error("Error completing inspection:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        selectedRequest: selectedRequest?.id,
        inspectionResults,
        refundReq,
      });
      toast.error(`Failed to complete inspection: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (transaction: Transaction) => {
    if (!transaction.id) return;
    
    const reason = prompt("Enter reason for rejection:");
    if (!reason) return;
    
    setProcessing(transaction.id);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const refundRequest = (transaction as any).refundRequest;
      
      await updateDoc(doc(db!, "transactions", transaction.id), {
        refundRequest: {
          ...refundRequest,
          status: "rejected",
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason,
          rejectedBy: user?.email || "Owner",
        },
      });
      
      toast.success("Refund request rejected");
    } catch (error) {
      console.error("Error rejecting refund:", error);
      toast.error("Failed to reject refund");
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

  const formatPaymentMethod = (method: string) => {
    if (method === "wallet") return "QR Scan";
    if (method === "scan") return "QR Scan";
    if (method === "cash") return "Cash";
    return method;
  };

  const getPaymentStatus = (transaction: Transaction) => {
    // Check if transaction has a status field for payment
    const paymentStatus = (transaction as any).status;
    if (paymentStatus === "completed") return "Paid";
    if (paymentStatus === "paid") return "Paid";
    if (paymentStatus === "pending") return "Pending";
    return paymentStatus || "Paid";
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem="refund-requests"
          onItemClick={() => {}}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar
          activeItem="refund-requests"
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
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <RotateCcw className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Refund Requests
                  </h1>
                  <p className="text-xs text-gray-600">
                    Review and process customer refund requests
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Pending</p>
                    <p className="text-xl font-bold text-blue-600 mt-0.5">
                      {requests.length}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Requests List */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Loading requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
                <RotateCcw className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No pending refund requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => {
                  const refundReq = (request as any).refundRequest;
                  const isProcessing = processing === request.id;
                  const requestedItems = refundReq.items || [];
                  const totalRefundAmount = requestedItems.reduce(
                    (sum: number, item: any) => sum + (item.unitPrice * item.quantity),
                    0
                  );
                  const isCancelledOrder = (request.status || "").toLowerCase() === "cancelled";
                  
                  return (
                    <div
                      key={request.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        {/* Left: Request Info (4 columns) */}
                        <div className="lg:col-span-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg flex-shrink-0 ${isCancelledOrder ? 'bg-amber-50' : 'bg-blue-50'}`}>
                              <AlertCircle className={`w-4 h-4 ${isCancelledOrder ? 'text-amber-600' : 'text-blue-600'}`} />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                <h3 className="text-base font-semibold text-gray-900">
                                  {request.transactionId}
                                </h3>
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-medium rounded">
                                  {refundReq.status === "pending" ? "Pending" : "Approved"}
                                </span>
                                {isCancelledOrder && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded">
                                    Cancelled Order
                                  </span>
                                )}
                                {refundReq.type === "return" && (
                                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-medium rounded">
                                    Return Request
                                  </span>
                                )}
                                {refundReq.type === "return" && refundReq.returnReceived && !refundReq.inspectionCompleted && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-medium rounded">
                                    Awaiting Inspection
                                  </span>
                                )}
                                {refundReq.type === "return" && refundReq.inspectionCompleted && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded">
                                    Inspected
                                  </span>
                                )}
                              </div>
                              
                              <div className="space-y-1.5 text-xs text-gray-600">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>
                                    {request.customer?.displayName || "Walk-in Customer"}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>
                                    Requested: {formatDate(refundReq.requestedAt)}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1.5">
                                  <Package className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>
                                    {requestedItems.length} items · Est: {formatPrice(totalRefundAmount)}
                                  </span>
                                </div>
                                
                                {isCancelledOrder && (
                                  <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded">
                                    <p className="text-[10px] text-amber-700 font-medium">
                                      ⚠️ <strong>Cancelled order</strong>
                                    </p>
                                    <p className="text-[10px] text-amber-600 mt-0.5">
                                      Paid but cancelled without auto refund.
                                    </p>
                                  </div>
                                )}
                                
                                {refundReq.reason && (
                                  <div className="mt-1.5 p-2 bg-gray-50 rounded">
                                    <p className="text-[10px] text-gray-500 mb-0.5">Reason:</p>
                                    <p className="text-xs text-gray-700 line-clamp-2">{refundReq.reason}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Middle: Requested Items & Photos (6 columns) */}
                        <div className="lg:col-span-6 space-y-2">
                          {/* Requested Items Summary */}
                          <div className="p-2 bg-blue-50 rounded border border-blue-100">
                            <p className="text-[10px] text-blue-700 font-medium mb-1">Requested Items:</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                              {requestedItems.map((item: any, idx: number) => (
                                <div key={idx} className="text-[10px] text-blue-900">
                                  • {item.groupName} - Qty: {item.quantity}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Item Photos for Return Requests */}
                          {refundReq.type === "return" && refundReq.itemPhotos && refundReq.itemPhotos.length > 0 && (
                            <div className="p-2 bg-purple-50 rounded border border-purple-200">
                              <p className="text-[10px] text-purple-700 font-medium mb-1.5">📸 Item Photos ({refundReq.itemPhotos.length}):</p>
                              <div className="grid grid-cols-4 gap-1.5">
                                {refundReq.itemPhotos.map((photo: string, idx: number) => (
                                  <img
                                    key={idx}
                                    src={photo}
                                    alt={`Item photo ${idx + 1}`}
                                    className="w-full h-20 object-cover rounded border border-purple-300 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => window.open(photo, '_blank')}
                                  />
                                ))}
                              </div>
                              <p className="text-[10px] text-purple-600 mt-1">Click to view full size</p>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions (2 columns) */}
                        <div className="lg:col-span-2 flex flex-row lg:flex-col gap-1.5 lg:justify-center lg:items-center">
                          <button
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowDetailsModal(true);
                            }}
                            className="flex-1 lg:flex-none lg:w-28 px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-[11px] font-medium"
                          >
                            Details
                          </button>
                          
                          <button
                            onClick={() => {
                              const refundReq = (request as any).refundRequest;
                              // For return type, check the workflow step
                              if (refundReq.type === "return") {
                                if (refundReq.status === "pending") {
                                  handleApproveReturn(request);
                                } else if (refundReq.status === "approved" && !refundReq.returnReceived) {
                                  setSelectedRequest(request);
                                  setShowReturnReceivedModal(true);
                                } else if (refundReq.returnReceived && !refundReq.inspectionCompleted) {
                                  setSelectedRequest(request);
                                  const requestedItems = refundReq.items || [];
                                  const initialInspection: { [itemIndex: number]: "accepted" | "damaged" } = {};
                                  request.items.forEach((item, index) => {
                                    const requestedItem = requestedItems.find(
                                      (ri: any) => ri.id === item.id || ri.groupName === item.groupName
                                    );
                                    if (requestedItem && requestedItem.quantity > 0) {
                                      initialInspection[index] = "accepted";
                                    }
                                  });
                                  setInspectionResults(initialInspection);
                                  setShowInspectionModal(true);
                                }
                              } else {
                                // For cancellation requests, show refund modal
                                handleProcessRefund(request);
                              }
                            }}
                            disabled={isProcessing}
                            className="flex-1 lg:flex-none lg:w-28 px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            {(() => {
                              const refundReq = (request as any).refundRequest;
                              if (refundReq.type === "return") {
                                if (refundReq.status === "pending") {
                                  return "Approve";
                                }
                                if (refundReq.status === "approved" && !refundReq.returnReceived) {
                                  return "Returned";
                                }
                                if (refundReq.returnReceived && !refundReq.inspectionCompleted) {
                                  return "Inspect";
                                }
                              }
                              return "Process";
                            })()}
                          </button>
                          
                          <button
                            onClick={() => handleReject(request)}
                            disabled={isProcessing}
                            className="flex-1 lg:flex-none lg:w-28 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Reject
                          </button>
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

      {/* Mark Return Received Modal - Pink themed */}
      {showReturnReceivedModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            {/* Header with pink gradient */}
            <div className="p-5 bg-gradient-to-r from-pink-500 to-rose-500 rounded-t-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5" />
                Mark Items as Returned
              </h2>
              <p className="text-xs text-pink-100 mt-1">
                {selectedRequest.transactionId}
              </p>
            </div>

            <div className="p-5 space-y-3">
              {/* Info box */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-900 mb-1">Customer Return</p>
                    <p className="text-xs text-blue-800">
                      Confirm that the customer has physically brought the items back to the store.
                    </p>
                  </div>
                </div>
              </div>

              {/* Items to receive */}
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-pink-900 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                  Items to Receive
                </h3>
                <div className="space-y-2">
                  {((selectedRequest as any).refundRequest?.items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-pink-100">
                      <div className="p-2 bg-pink-100 rounded">
                        <Package className="w-4 h-4 text-pink-600" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-900">{item.groupName}</span>
                        <span className="ml-2 px-2 py-0.5 bg-pink-100 text-pink-700 text-xs font-bold rounded-full">
                          ×{item.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning box */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">⚠️</div>
                  <p className="text-xs text-amber-800">
                    <span className="font-bold">Important:</span> After marking as received, you'll need to inspect each item before processing the refund.
                  </p>
                </div>
              </div>

              {/* Return Status Selection - Compact Design */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 bg-purple-500 rounded">
                    <RotateCcw className="w-3 h-3 text-white" />
                  </div>
                  <h3 className="text-xs font-bold text-purple-900">Return Status *</h3>
                </div>
                <p className="text-[10px] text-purple-700 mb-2">
                  Select the return completeness based on items returned:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label 
                    className={`flex flex-col items-center justify-center p-2.5 border-2 rounded-lg cursor-pointer transition-all ${
                      returnStatus === "fully_returned"
                        ? "border-purple-500 bg-white shadow-sm"
                        : "border-purple-200 bg-white/50 hover:border-purple-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="returnStatus"
                      value="fully_returned"
                      checked={returnStatus === "fully_returned"}
                      onChange={(e) => setReturnStatus(e.target.value as "fully_returned" | "partially_returned")}
                      className="w-4 h-4 text-purple-600 mb-1.5"
                    />
                    <div className="text-xs font-bold text-purple-900 leading-tight">Fully Returned</div>
                  </label>

                  <label 
                    className={`flex flex-col items-center justify-center p-2.5 border-2 rounded-lg cursor-pointer transition-all ${
                      returnStatus === "partially_returned"
                        ? "border-purple-500 bg-white shadow-sm"
                        : "border-purple-200 bg-white/50 hover:border-purple-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="returnStatus"
                      value="partially_returned"
                      checked={returnStatus === "partially_returned"}
                      onChange={(e) => setReturnStatus(e.target.value as "fully_returned" | "partially_returned")}
                      className="w-4 h-4 text-purple-600 mb-1.5"
                    />
                    <div className="text-xs font-bold text-purple-900 leading-tight">Partially Returned</div>
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setShowReturnReceivedModal(false);
                    setSelectedRequest(null);
                  }}
                  disabled={processing === selectedRequest.id}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkReturnReceived}
                  disabled={processing === selectedRequest.id}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-semibold shadow-lg shadow-green-200"
                >
                  {processing === selectedRequest.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Marking...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm Received
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Inspection Modal - Pink themed */}
      {showInspectionModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Header with pink gradient */}
            <div className="p-5 bg-gradient-to-r from-pink-500 to-rose-500 flex justify-between items-center sticky top-0 rounded-t-xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Inspect Returned Items
                </h2>
                <p className="text-xs text-pink-100 mt-1">
                  {selectedRequest.transactionId}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowInspectionModal(false);
                  setInspectionResults({});
                  setDamageReasons({});
                }}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Inspection Guide */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-blue-500 rounded-lg">
                    <span className="text-2xl">🔍</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-900 mb-1">Inspection Guide</p>
                    <p className="text-xs text-blue-800 mb-2">
                      Mark each item as <strong>"Accepted"</strong> (good condition, can restock) or <strong>"Damaged"</strong> (cannot restock).
                    </p>
                    <div className="bg-white/60 rounded p-2 border border-blue-200">
                      <p className="text-xs font-bold text-blue-900 mb-1">💰 Refund Policy:</p>
                      <ul className="text-xs text-blue-800 space-y-0.5">
                        <li>✅ <strong>Accepted items:</strong> Full refund + restocked</li>
                        <li>❌ <strong>Damaged items:</strong> NO refund + NOT restocked</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inspection Items */}
              <div className="space-y-3">
                {selectedRequest.items.map((item, index) => {
                  const refundReq = (selectedRequest as any).refundRequest;
                  const requestedItem = (refundReq?.items || []).find(
                    (ri: any) => ri.id === item.id || ri.groupName === item.groupName
                  );
                  
                  if (!requestedItem || requestedItem.quantity === 0) return null;
                  
                  return (
                    <div key={index} className="bg-gradient-to-r from-gray-50 to-pink-50/30 rounded-xl p-4 border-2 border-gray-200">
                      <div className="flex items-start gap-3 mb-3">
                        {item.image && (
                          <div className="relative">
                            <img
                              src={item.image}
                              alt={item.groupName}
                              className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-md flex-shrink-0"
                            />
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow">
                              {requestedItem.quantity}
                            </div>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 mb-1">{item.groupName}</h4>
                          <div className="flex items-center gap-2 mb-1">
                            {item.selectedColor && (
                              <span className="px-2 py-0.5 bg-white rounded border border-gray-300 text-xs">
                                {item.selectedColor}
                              </span>
                            )}
                            {item.selectedSize && (
                              <span className="px-2 py-0.5 bg-white rounded border border-gray-300 text-xs">
                                Size: {item.selectedSize}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-700">
                            Quantity to inspect: <span className="font-bold text-pink-600">{requestedItem.quantity}</span>
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          onClick={() => setInspectionResults(prev => ({
                            ...prev,
                            [index]: "accepted"
                          }))}
                          className={`px-4 py-3 rounded-lg border-2 transition-all ${
                            inspectionResults[index] === "accepted"
                              ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-500 shadow-lg shadow-green-100"
                              : "bg-white border-gray-300 hover:border-green-400 hover:bg-green-50/30"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <CheckCircle className={`w-5 h-5 ${inspectionResults[index] === "accepted" ? "text-green-600" : "text-gray-400"}`} />
                            <span className={`font-bold text-sm ${inspectionResults[index] === "accepted" ? "text-green-800" : "text-gray-700"}`}>
                              Accepted
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-600">Good condition · Will restock</p>
                          <p className="text-[10px] font-bold text-green-600 mt-0.5">✅ FULL REFUND</p>
                        </button>

                        <button
                          onClick={() => setInspectionResults(prev => ({
                            ...prev,
                            [index]: "damaged"
                          }))}
                          className={`px-4 py-3 rounded-lg border-2 transition-all ${
                            inspectionResults[index] === "damaged"
                              ? "bg-gradient-to-br from-red-50 to-rose-50 border-red-500 shadow-lg shadow-red-100"
                              : "bg-white border-gray-300 hover:border-red-400 hover:bg-red-50/30"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <AlertCircle className={`w-5 h-5 ${inspectionResults[index] === "damaged" ? "text-red-600" : "text-gray-400"}`} />
                            <span className={`font-bold text-sm ${inspectionResults[index] === "damaged" ? "text-red-800" : "text-gray-700"}`}>
                              Damaged
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-600">Cannot resell · No restock</p>
                          <p className="text-[10px] font-bold text-red-600 mt-0.5">❌ NO REFUND</p>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Note */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">⚠️</div>
                  <div>
                    <p className="text-xs font-bold text-amber-900 mb-1">Important Policy Change:</p>
                    <p className="text-xs text-amber-800">
                      <strong>Accepted items:</strong> Customer gets full refund (items restocked).<br/>
                      <strong>Damaged items:</strong> NO refund processed (items NOT restocked).<br/>
                      Only accepted items will appear in "Pending Refund Payments".
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setShowInspectionModal(false);
                    setInspectionResults({});
                    setDamageReasons({});
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteInspection}
                  disabled={processing === selectedRequest.id}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-semibold shadow-lg shadow-pink-200"
                >
                  {processing === selectedRequest.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Completing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Complete Inspection
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Refund Payment Modal */}
      {showConfirmPaymentModal && selectedRefundForConfirmation && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                Confirm Refund Payment
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                Refund ID: {selectedRefundForConfirmation.refund.refundId}
              </p>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs text-amber-800">
                  ⚠️ <strong>Important:</strong> Confirm only after you have physically given the money to the customer.
                </p>
              </div>

              <div className="bg-gray-50 rounded p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Refund Amount:</span>
                  <span className="text-xl font-bold text-gray-900">
                    {formatPrice(selectedRefundForConfirmation.refund.totalAmount)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
                  Refund Method *
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center p-2.5 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="refundMethod"
                      value="cash"
                      checked={refundMethod === "cash"}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-3.5 h-3.5 text-blue-600"
                    />
                    <span className="ml-2 text-xs text-gray-900">Cash</span>
                  </label>
                  <label className="flex items-center p-2.5 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="refundMethod"
                      value="original_payment"
                      checked={refundMethod === "original_payment"}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-3.5 h-3.5 text-blue-600"
                    />
                    <span className="ml-2 text-xs text-gray-900">
                      Original Payment Method ({selectedRefundForConfirmation.transaction.paymentMethod})
                    </span>
                  </label>
                  <label className="flex items-center p-2.5 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="refundMethod"
                      value="bank_transfer"
                      checked={refundMethod === "bank_transfer"}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-3.5 h-3.5 text-blue-600"
                    />
                    <span className="ml-2 text-xs text-gray-900">Bank Transfer</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
                  Refund Status *
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-start p-2.5 border-2 border-gray-200 rounded cursor-pointer hover:bg-pink-50 transition-colors">
                    <input
                      type="radio"
                      name="refundStatus"
                      value="refunded"
                      checked={selectedRefundStatus === "refunded"}
                      onChange={(e) => setSelectedRefundStatus(e.target.value as any)}
                      className="w-4 h-4 text-pink-600 mt-0.5"
                    />
                    <div className="ml-2 flex-1">
                      <div className="text-sm font-medium text-gray-900">Fully Refunded</div>
                      <div className="text-xs text-gray-600">Customer received full refund amount</div>
                    </div>
                  </label>
                  <label className="flex items-start p-2.5 border-2 border-gray-200 rounded cursor-pointer hover:bg-pink-50 transition-colors">
                    <input
                      type="radio"
                      name="refundStatus"
                      value="partially_refunded"
                      checked={selectedRefundStatus === "partially_refunded"}
                      onChange={(e) => setSelectedRefundStatus(e.target.value as any)}
                      className="w-4 h-4 text-pink-600 mt-0.5"
                    />
                    <div className="ml-2 flex-1">
                      <div className="text-sm font-medium text-gray-900">Partially Refunded</div>
                      <div className="text-xs text-gray-600">Customer received partial refund amount</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
                  Notes (Optional)
                </label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="e.g., Refunded at store counter, Transaction ref: 123456"
                  rows={2}
                  className="w-full px-2.5 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowConfirmPaymentModal(false);
                    setSelectedRefundForConfirmation(null);
                    setRefundMethod("cash");
                    setRefundNotes("");
                  }}
                  disabled={isConfirmingPayment}
                  className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRefundPayment}
                  disabled={isConfirmingPayment}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 text-sm"
                >
                  {isConfirmingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Process Refund
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  {selectedRequest.transactionId}
                </p>
              </div>
              <button
                onClick={() => setShowRefundModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* QR Code Image Display for Scan/Wallet Payments */}
              {(selectedRequest.paymentMethod === "scan" || selectedRequest.paymentMethod === "wallet") && (selectedRequest as any).refundRequest?.qrCodeImage && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xl">💳</span>
                    <div className="flex-1">
                      <p className="font-medium text-blue-900 text-xs">
                        Customer's Payment QR Code / Account Info
                      </p>
                      <p className="text-[10px] text-blue-800 mt-0.5">
                        Use this to send the refund back to customer's payment account
                      </p>
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 border border-blue-200">
                    <img
                      src={(selectedRequest as any).refundRequest.qrCodeImage}
                      alt="Customer Payment QR Code"
                      className="w-full max-h-48 object-contain rounded"
                    />
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-xs text-blue-800">
                  💡 <strong>Pre-selected from customer request:</strong> Items and quantities have been automatically selected based on the customer's refund request. You can adjust if needed.
                </p>
              </div>

              {/* Refund Items */}
              <div className="space-y-2">
                {selectedRequest.items.map((item, index) => {
                  const alreadyRefunded = selectedRequest.refunds?.reduce((total, refund) => {
                    const refundItem = refund.items.find(ri => ri.itemIndex === index);
                    return total + (refundItem?.quantity || 0);
                  }, 0) || 0;
                  
                  const availableToRefund = item.quantity - alreadyRefunded;
                  const key = `${item.id}___${index}`;
                  
                  return (
                    <div key={key} className="bg-gray-50 rounded p-3">
                      <div className="flex items-start gap-3">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.groupName}
                            className="w-12 h-12 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900">{item.groupName}</h4>
                          <p className="text-xs text-gray-600">
                            {item.selectedColor && `Color: ${item.selectedColor} · `}
                            {item.selectedSize && `Size: ${item.selectedSize}`}
                          </p>
                          <p className="text-xs text-gray-700 mt-0.5">
                            Price: {formatPrice(item.unitPrice)} × {item.quantity}
                          </p>
                          {alreadyRefunded > 0 && (
                            <p className="text-xs text-orange-600 mt-0.5">
                              Already refunded: {alreadyRefunded}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <label className="text-xs text-gray-600">Refund:</label>
                          <input
                            type="number"
                            min="0"
                            max={availableToRefund}
                            value={refundItems[key] || 0}
                            onChange={(e) => {
                              const value = Math.min(
                                Math.max(0, parseInt(e.target.value) || 0),
                                availableToRefund
                              );
                              setRefundItems(prev => ({
                                ...prev,
                                [key]: value
                              }));
                            }}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-xs"
                          />
                          <span className="text-xs text-gray-500">/ {availableToRefund}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Refund Calculation */}
              <div className="bg-cyan-50 border border-cyan-200 rounded p-3">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Refund Calculation</h3>
                {(() => {
                  const totalItemRefundAmount = Object.entries(refundItems).reduce((total, [key, quantity]) => {
                    const [, index] = key.split("___");
                    const item = selectedRequest.items[parseInt(index)];
                    return total + (item.unitPrice * quantity);
                  }, 0);

                  const transactionCartDiscount = selectedRequest.discount || 0;
                  const transactionSubtotal = selectedRequest.subtotal || 0;
                  
                  let cartDiscountRefund = 0;
                  if (transactionCartDiscount > 0 && transactionSubtotal > 0) {
                    const cartDiscountRate = transactionCartDiscount / transactionSubtotal;
                    cartDiscountRefund = totalItemRefundAmount * cartDiscountRate;
                  }

                  const finalRefundAmount = totalItemRefundAmount - cartDiscountRefund;

                  return (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Items Subtotal:</span>
                        <span className="text-gray-900">{formatPrice(totalItemRefundAmount)}</span>
                      </div>
                      {cartDiscountRefund > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cart Discount:</span>
                          <span className="text-orange-600">-{formatPrice(cartDiscountRefund)}</span>
                        </div>
                      )}
                      <div className="border-t border-cyan-300 pt-1.5 flex justify-between font-semibold">
                        <span className="text-gray-900">Total Refund:</span>
                        <span className="text-cyan-700 text-base">{formatPrice(finalRefundAmount)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitRefund}
                  disabled={processing === selectedRequest.id}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm"
                >
                  {processing === selectedRequest.id ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      Processing...
                    </>
                  ) : (
                    "Process Refund"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal - Pink themed with better UX */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Header with pink gradient */}
            <div className="p-5 bg-gradient-to-r from-pink-500 to-rose-500 flex justify-between items-center sticky top-0 rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Order Details
                </h2>
                <p className="text-xs text-pink-100 mt-0.5">
                  Complete order information and items
                </p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Transaction Info - 2 column grid */}
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-4 border border-pink-200">
                <h3 className="text-sm font-bold text-pink-900 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                  Transaction Information
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <div>
                    <span className="text-pink-600 font-medium block mb-0.5">Transaction ID</span>
                    <span className="text-gray-900 font-semibold">
                      {selectedRequest.transactionId}
                    </span>
                  </div>
                  <div>
                    <span className="text-pink-600 font-medium block mb-0.5">Customer</span>
                    <span className="text-gray-900 font-semibold">
                      {selectedRequest.customer?.displayName || "Walk-in Customer"}
                    </span>
                  </div>
                  <div>
                    <span className="text-pink-600 font-medium block mb-0.5">Payment Method</span>
                    <span className="text-gray-900 font-semibold">
                      {formatPaymentMethod(selectedRequest.paymentMethod)}
                    </span>
                  </div>
                  <div>
                    <span className="text-pink-600 font-medium block mb-0.5">Status</span>
                    <span className="inline-flex items-center px-2 py-0.5 bg-white rounded-full text-gray-900 font-semibold border border-pink-200 capitalize">
                      {getPaymentStatus(selectedRequest)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                  Order Items
                  <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-[10px] font-bold rounded-full">
                    {selectedRequest.items.length}
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {selectedRequest.items.map((item, index) => (
                    <div
                      key={index}
                      className="bg-gradient-to-r from-gray-50 to-pink-50/30 rounded-lg p-3 flex items-center gap-3 border border-gray-200 hover:border-pink-300 transition-colors"
                    >
                      {item.image && (
                        <div className="relative">
                          <img
                            src={item.image}
                            alt={item.groupName}
                            className="w-16 h-16 object-cover rounded-lg border-2 border-white shadow-sm"
                          />
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                            {item.quantity}
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 mb-0.5">
                          {item.groupName}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                          {item.selectedColor && (
                            <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                              {item.selectedColor}
                            </span>
                          )}
                          {item.selectedSize && (
                            <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                              Size: {item.selectedSize}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-700 font-medium">
                          {item.quantity} × {formatPrice(item.unitPrice)} = <span className="text-pink-600 font-bold">{formatPrice(item.quantity * item.unitPrice)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals - Enhanced design */}
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-4 border-2 border-pink-200">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Subtotal</span>
                    <span className="text-gray-900 font-semibold">{formatPrice(selectedRequest.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Tax</span>
                    <span className="text-gray-900 font-semibold">{formatPrice(selectedRequest.tax)}</span>
                  </div>
                  {selectedRequest.discount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Discount</span>
                      <span className="text-rose-600 font-bold">-{formatPrice(selectedRequest.discount)}</span>
                    </div>
                  )}
                  <div className="border-t-2 border-pink-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="text-gray-900 font-bold text-base">Total</span>
                    <span className="text-pink-600 font-bold text-xl">{formatPrice(selectedRequest.total)}</span>
                  </div>
                </div>
              </div>

              {/* Close button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all text-sm font-semibold shadow-lg shadow-pink-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
