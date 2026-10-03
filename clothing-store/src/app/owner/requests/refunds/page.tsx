"use client";

import { useState, useEffect, useMemo, useCallback, type ChangeEvent, type ReactNode } from "react";
import { toast } from "react-hot-toast";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { transactionService, Transaction, type InspectionLine } from "@/services/transactionService";
import { 
  RotateCcw, 
  CheckCircle, 
  Clock, 
  User,
  Calendar,
  Package,
  AlertCircle,
  X,
  Truck,
  Search as SearchIcon,
  Wallet,
  Eye,
  ImageIcon,
  Banknote,
  Check,
} from "lucide-react";
import {
  RequestPageHeader,
  LiveIndicator,
  StatGrid,
  StatCard,
  RequestToolbar,
  Badge,
  RequestCard,
  NoteBlock,
  ActionButton,
  LoadingList,
  EmptyState,
  RequestModal,
  ModalSection,
  KeyValueList,
  type FilterOption,
  type Tone,
} from "@/components/requests/RequestUI";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";

/** Message to show for a failed action (wrappers throw with the server's reason). */
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

// ---------------------------------------------------------------------------
// Presentation helpers (derived from fields the listener already loads)
// ---------------------------------------------------------------------------

/** Where a request sits in the return flow. UI only; no data is written. */
type Stage = "approval" | "return" | "inspection" | "payout";
type StageFilter = "all" | Stage;

const STAGE_META: Record<Stage, { label: string; tone: Tone }> = {
  approval: { label: "Awaiting approval", tone: "amber" },
  return: { label: "Awaiting return", tone: "blue" },
  inspection: { label: "Awaiting inspection", tone: "violet" },
  payout: { label: "Awaiting payout", tone: "emerald" },
};

function getStage(transaction: Transaction): Stage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refundReq = (transaction as any).refundRequest;
  if (refundReq?.status === "pending") return "approval";
  if (refundReq?.type === "return" && !refundReq.returnReceived) return "return";
  if (refundReq?.type === "return" && refundReq.returnReceived && !refundReq.inspectionCompleted) {
    return "inspection";
  }
  // Inspected (or approved non-return) requests are waiting on the refund payout.
  return "payout";
}

const RETURN_STEPS = ["Requested", "Approved", "Returned", "Inspected", "Refunded"];
const CANCELLATION_STEPS = ["Requested", "Approved", "Refunded"];

function getStepIndex(stage: Stage, isReturn: boolean): number {
  if (!isReturn) return stage === "approval" ? 1 : 2;
  return { approval: 1, return: 2, inspection: 3, payout: 4 }[stage];
}

/** Compact, accessible step indicator: Requested → … → Refunded. */
function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol
      className="flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-inset ring-gray-100"
      aria-label={`Progress: step ${current + 1} of ${steps.length}, ${steps[current]}`}
    >
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step}
            className={`flex min-w-0 items-center gap-1.5 ${i < steps.length - 1 ? "flex-1" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-rose-500 text-white ring-4 ring-rose-100"
                    : "bg-white text-gray-400 ring-1 ring-inset ring-gray-200"
              }`}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={`truncate text-[11px] ${
                active ? "font-semibold text-gray-900" : done ? "text-gray-600" : "text-gray-400"
              } ${active ? "" : "sr-only sm:not-sr-only"}`}
            >
              {step}
              <span className="sr-only">{done ? " (done)" : active ? " (current step)" : " (upcoming)"}</span>
            </span>
            {i < steps.length - 1 && (
              <span
                className={`h-px min-w-3 flex-1 ${done ? "bg-emerald-300" : "bg-gray-200"}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Radio card used inside modals (keeps the native radio input for a11y). */
function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked ? "border-rose-300 bg-rose-50/60 ring-1 ring-inset ring-rose-200" : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-rose-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

function RefundRequestsContent() {
  const { user } = useAuth();
  const permissions = usePermissions();
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

    // Doc: "Manage Return Requests" - Owner + Manager only.
    if (!permissions.canManageReturnRequests) {
      toast.error("You do not have permission to approve return requests.");
      return;
    }

    setProcessing(transaction.id);
    
    try {
      // Server sets refundRequest.status "approved" / approvedAt / approvedBy.
      await transactionService.approveRefundRequest(transaction.id);
      
      toast.success("Return request approved! Customer can now bring items to store.");
    } catch (error) {
      console.error("Error approving return:", error);
      toast.error(`Failed to approve return: ${errorMessage(error)}`);
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
        // Keep the status recorded when the items were received; otherwise the
        // default "fully_returned" would overwrite a "partially_returned" mark.
        setReturnStatus(
          refundReq.returnStatus === "partially_returned" ? "partially_returned" : "fully_returned",
        );
        
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
      
      const isCancelledOrder = (selectedRequest.status || "").toLowerCase() === "cancelled";
      
      if (refundReq?.type === "cancellation" && isCancelledOrder) {
        // Cancelled order with a refund request: processRefund refuses cancelled
        // orders, so approve the request instead. The server records the pending
        // cancellation refund (total − already refunded) and approves the request
        // in one transaction.
        await transactionService.approveRefundRequest(selectedRequest.id);
      } else {
        // Process the refund and approve the pending refund request in the same
        // server transaction.
        await transactionService.processRefund(
          selectedRequest.id,
          refundItems,
          selectedRequest,
          refundReq?.reason || "Customer requested refund",
          user?.email || "Owner",
          undefined, // refundMethod is set later during payment confirmation
          inspectionResultsForRefund, // Pass inspection results
          undefined, // returnStatus
          { approveRefundRequest: true },
        );
      }
      
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

    // Doc: "Issue Refund Payments" - Owner + Manager only.
    if (!permissions.canApprovePayments) {
      toast.error("You do not have permission to issue refund payments.");
      return;
    }

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
      toast.error(`Failed to confirm refund payment: ${errorMessage(error)}`);
    } finally {
      setIsConfirmingPayment(false);
    }
  };
  
  const handleMarkReturnReceived = async () => {
    if (!selectedRequest || !selectedRequest.id) return;
    
    setProcessing(selectedRequest.id);
    
    try {
      const refundRequest = (selectedRequest as any).refundRequest;
      
      // Server sets refundRequest.returnReceived/At/By + returnStatus, sets
      // orderStatus to the selected return status (fully_returned or
      // partially_returned) and mirrors it to the linked onlineOrders doc.
      await transactionService.markReturnReceived(selectedRequest.id, returnStatus);
      
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
      toast.error(`Failed to mark return received: ${errorMessage(error)}`);
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
      // One line per inspected item: the requested (returned) quantity and the
      // inspection result for that line.
      const lines: InspectionLine[] = [];
      selectedRequest.items.forEach((item, index) => {
        const requestedItem = requestedItems.find(
          (ri: any) => ri.id === item.id || ri.groupName === item.groupName
        );
        const inspection = inspectionResults[index];
        
        if (requestedItem && requestedItem.quantity > 0 && inspection) {
          lines.push({
            lineIndex: index,
            quantity: requestedItem.quantity,
            result: inspection,
            damageReason: damageReasons[index] || undefined,
          });
        }
      });
      
      console.log("Inspection lines prepared:", lines);
      
      // Validate we have items to refund
      if (lines.length === 0) {
        throw new Error("No items to refund. Check item matching logic.");
      }
      
      // ONE server transaction: confirms the return status, records the
      // inspection results, restocks accepted units / writes off damaged ones,
      // and either rejects the refund (all damaged) or creates a pending refund
      // for the accepted units only. The server also refuses unpaid orders,
      // mirrors the online order's payment status and writes the owner and
      // customer notification docs.
      const result = await transactionService.completeReturnInspection(selectedRequest.id, {
        lines,
        returnStatus, // "fully_returned" or "partially_returned"
      });
      
      if (result.outcome === "refund_rejected") {
        // All items damaged: no refund. The server set status/paymentStatus
        // "refund_rejected", refundRequest.status "completed_no_refund" and
        // wrote the customer `refund_rejected` notification.
        toast.success("Inspection complete! All items damaged - refund rejected. Customer notification sent.");
      } else {
        // Some items accepted: the server created a pending refund for the
        // accepted units only (paymentStatus "pending_refund"), wrote the owner
        // `refund_payment` notification and, if any were damaged, the customer
        // `partial_refund_with_damaged_items` notification.
        const acceptedCount =
          result.acceptedCount ?? lines.filter((line) => line.result === "accepted").length;
        const damagedCount =
          result.damagedCount ?? lines.filter((line) => line.result === "damaged").length;
        
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

    // Doc: "Manage Return Requests" - Owner + Manager only.
    if (!permissions.canManageReturnRequests) {
      toast.error("You do not have permission to reject return requests.");
      return;
    }

    const reason = prompt("Enter reason for rejection:");
    if (!reason) return;
    
    setProcessing(transaction.id);
    
    try {
      // Server sets refundRequest.status "rejected" / rejectedAt /
      // rejectionReason / rejectedBy.
      await transactionService.rejectRefundRequest(transaction.id, reason);
      
      toast.success("Refund request rejected");
    } catch (error) {
      console.error("Error rejecting refund:", error);
      toast.error(`Failed to reject refund: ${errorMessage(error)}`);
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

  // ---------------------------------------------------------------------------
  // Derived UI state (in-memory search / stage filter over the loaded list)
  // ---------------------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");

  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = { approval: 0, return: 0, inspection: 0, payout: 0 };
    requests.forEach((request) => {
      counts[getStage(request)] += 1;
    });
    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (stageFilter !== "all" && getStage(request) !== stageFilter) return false;
      if (!term) return true;
      const haystack = [
        request.transactionId,
        request.customer?.displayName,
        request.customer?.email,
        request.customer?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [requests, search, stageFilter]);

  const filterOptions: FilterOption<StageFilter>[] = [
    { value: "all", label: "All", count: requests.length },
    { value: "approval", label: "Approval", count: stageCounts.approval },
    { value: "return", label: "Return", count: stageCounts.return },
    { value: "inspection", label: "Inspection", count: stageCounts.inspection },
    { value: "payout", label: "Payout", count: stageCounts.payout },
  ];

  const clearFilters = () => {
    setSearch("");
    setStageFilter("all");
  };

  // Stable close handlers for the modal shells (they run the same state
  // resets as the existing Cancel / X buttons).
  const closeReturnReceivedModal = useCallback(() => {
    if (selectedRequest && processing === selectedRequest.id) return;
    setShowReturnReceivedModal(false);
    setSelectedRequest(null);
  }, [processing, selectedRequest]);

  const closeInspectionModal = useCallback(() => {
    setShowInspectionModal(false);
    setInspectionResults({});
    setDamageReasons({});
  }, []);

  const closeConfirmPaymentModal = useCallback(() => {
    if (isConfirmingPayment) return;
    setShowConfirmPaymentModal(false);
    setSelectedRefundForConfirmation(null);
    setRefundMethod("cash");
    setRefundNotes("");
  }, [isConfirmingPayment]);

  const closeRefundModal = useCallback(() => setShowRefundModal(false), []);
  const closeDetailsModal = useCallback(() => setShowDetailsModal(false), []);

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

        <main className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-5">
          <div className="max-w-6xl mx-auto">
            <RequestPageHeader
              icon={RotateCcw}
              title="Refund & Return Requests"
              description="Approve returns, receive and inspect items, then hand over to refund payout."
              actions={<LiveIndicator />}
            />

            <StatGrid>
              <StatCard
                label="Awaiting approval"
                value={stageCounts.approval}
                hint="New customer requests"
                icon={Clock}
                tone="amber"
              />
              <StatCard
                label="Awaiting return"
                value={stageCounts.return}
                hint="Approved, items not received"
                icon={Truck}
                tone="blue"
              />
              <StatCard
                label="Awaiting inspection"
                value={stageCounts.inspection}
                hint="Received, not inspected"
                icon={SearchIcon}
                tone="violet"
              />
              <StatCard
                label="Awaiting payout"
                value={stageCounts.payout}
                hint="Inspected, refund pending"
                icon={Wallet}
                tone="emerald"
              />
            </StatGrid>

            <RequestToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by order, customer, email or phone"
              filters={filterOptions}
              filterValue={stageFilter}
              onFilterChange={setStageFilter}
              filterLabel="Filter by stage"
            />

            {/* Requests List */}
            {loading ? (
              <LoadingList />
            ) : requests.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                title="No pending refund requests"
                description="New return and refund requests from customers will appear here automatically."
              />
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                icon={SearchIcon}
                title="No requests match your filters"
                description="Try a different search term or stage."
                action={
                  <ActionButton variant="secondary" icon={X} onClick={clearFilters} className="lg:w-auto">
                    Clear filters
                  </ActionButton>
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((request) => {
                  const refundReq = (request as any).refundRequest;
                  const isProcessing = processing === request.id;
                  const requestedItems = refundReq.items || [];
                  const totalRefundAmount = requestedItems.reduce(
                    (sum: number, item: any) => sum + (item.unitPrice * item.quantity),
                    0
                  );
                  const isCancelledOrder = (request.status || "").toLowerCase() === "cancelled";
                  const stage = getStage(request);
                  const isReturn = refundReq.type === "return";
                  const steps = isReturn ? RETURN_STEPS : CANCELLATION_STEPS;
                  const requestedQty = requestedItems.reduce(
                    (sum: number, item: any) => sum + (item.quantity || 0),
                    0
                  );

                  // Same label rules as before, plus a matching icon.
                  const primaryLabel = (() => {
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
                  })();
                  const primaryIcon =
                    primaryLabel === "Returned" ? Package : primaryLabel === "Inspect" ? SearchIcon : CheckCircle;

                  return (
                    <RequestCard
                      key={request.id}
                      tone={STAGE_META[stage].tone}
                      title={request.transactionId}
                      badges={
                        <>
                          <Badge tone={STAGE_META[stage].tone} dot>
                            {STAGE_META[stage].label}
                          </Badge>
                          <Badge tone={isReturn ? "rose" : "gray"}>
                            {isReturn ? "Return request" : "Refund request"}
                          </Badge>
                          {isCancelledOrder && <Badge tone="amber">Cancelled order</Badge>}
                          {isReturn && refundReq.inspectionCompleted && <Badge tone="emerald">Inspected</Badge>}
                        </>
                      }
                      meta={[
                        {
                          icon: User,
                          label: "Customer",
                          value: request.customer?.displayName || "Walk-in Customer",
                        },
                        {
                          icon: Package,
                          label: "Items requested",
                          value: `${requestedItems.length} line${requestedItems.length === 1 ? "" : "s"} · ${requestedQty} pcs`,
                        },
                        {
                          icon: Calendar,
                          label: "Requested",
                          value: refundReq.requestedAt ? formatDate(refundReq.requestedAt) : "—",
                        },
                        {
                          icon: Banknote,
                          label: "Est. amount",
                          value: formatPrice(totalRefundAmount),
                        },
                      ]}
                      actions={
                        <>
                          <ActionButton
                            variant="approve"
                            icon={primaryIcon}
                            loading={isProcessing}
                            aria-label={`${primaryLabel} ${request.transactionId}`}
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
                          >
                            {primaryLabel}
                          </ActionButton>
                          <ActionButton
                            variant="secondary"
                            icon={Eye}
                            aria-label={`View details for ${request.transactionId}`}
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowDetailsModal(true);
                            }}
                          >
                            Details
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            icon={X}
                            disabled={isProcessing}
                            aria-label={`Reject ${request.transactionId}`}
                            onClick={() => handleReject(request)}
                          >
                            Reject
                          </ActionButton>
                        </>
                      }
                    >
                      <StepProgress steps={steps} current={getStepIndex(stage, isReturn)} />

                      {isCancelledOrder && (
                        <NoteBlock label="Cancelled order" tone="amber">
                          Paid but cancelled without auto refund.
                        </NoteBlock>
                      )}

                      {refundReq.reason && (
                        <NoteBlock label="Reason">
                          <span className="line-clamp-2">{refundReq.reason}</span>
                        </NoteBlock>
                      )}

                      {refundReq.rejectionReason && (
                        <NoteBlock label="Rejection note" tone="red">
                          {refundReq.rejectionReason}
                        </NoteBlock>
                      )}

                      {/* Requested Items Summary */}
                      {requestedItems.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Requested items
                          </p>
                          <ul className="flex flex-wrap gap-1.5">
                            {requestedItems.map((item: any, idx: number) => (
                              <li
                                key={idx}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-inset ring-gray-200"
                              >
                                <span className="font-medium text-gray-900">{item.groupName}</span>
                                <span className="rounded-md bg-rose-50 px-1.5 text-[11px] font-semibold text-rose-700">
                                  ×{item.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Item Photos for Return Requests */}
                      {refundReq.type === "return" && refundReq.itemPhotos && refundReq.itemPhotos.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Item photos ({refundReq.itemPhotos.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {refundReq.itemPhotos.map((photo: string, idx: number) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => window.open(photo, '_blank')}
                                className="overflow-hidden rounded-xl ring-1 ring-gray-200 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                aria-label={`Open item photo ${idx + 1} full size`}
                              >
                                <img
                                  src={photo}
                                  alt={`Item photo ${idx + 1}`}
                                  className="h-16 w-16 object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </RequestCard>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mark Return Received Modal */}
      <RequestModal
        open={showReturnReceivedModal && !!selectedRequest}
        onClose={closeReturnReceivedModal}
        title="Mark Items as Returned"
        subtitle={selectedRequest?.transactionId}
        icon={Package}
        size="md"
        footer={
          selectedRequest && (
            <>
              <ActionButton
                variant="secondary"
                onClick={() => {
                  setShowReturnReceivedModal(false);
                  setSelectedRequest(null);
                }}
                disabled={processing === selectedRequest.id}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant="approve"
                icon={CheckCircle}
                onClick={handleMarkReturnReceived}
                loading={processing === selectedRequest.id}
                loadingLabel="Marking..."
              >
                Confirm Received
              </ActionButton>
            </>
          )
        }
      >
        {selectedRequest && (
          <>
            <ModalSection title="Customer return">
              <p className="text-sm text-gray-600">
                Confirm that the customer has physically brought the items back to the store.
              </p>
            </ModalSection>

            <ModalSection title="Items to receive">
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {((selectedRequest as any).refundRequest?.items || []).map((item: any, idx: number) => (
                  <li key={idx} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-gray-900">{item.groupName}</span>
                    </span>
                    <Badge tone="rose">×{item.quantity}</Badge>
                  </li>
                ))}
              </ul>
            </ModalSection>

            <ModalSection title="Return status">
              <fieldset>
                <legend className="mb-2 text-xs text-gray-500">
                  Select the return completeness based on items returned <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <RadioCard
                    name="returnStatus"
                    value="fully_returned"
                    checked={returnStatus === "fully_returned"}
                    onChange={(e) => setReturnStatus(e.target.value as "fully_returned" | "partially_returned")}
                    title="Fully Returned"
                  />
                  <RadioCard
                    name="returnStatus"
                    value="partially_returned"
                    checked={returnStatus === "partially_returned"}
                    onChange={(e) => setReturnStatus(e.target.value as "fully_returned" | "partially_returned")}
                    title="Partially Returned"
                  />
                </div>
              </fieldset>
            </ModalSection>

            <NoteBlock label="Important" tone="amber">
              After marking as received, you&apos;ll need to inspect each item before processing the refund.
            </NoteBlock>
          </>
        )}
      </RequestModal>

      {/* Item Inspection Modal */}
      <RequestModal
        open={showInspectionModal && !!selectedRequest}
        onClose={closeInspectionModal}
        title="Inspect Returned Items"
        subtitle={selectedRequest?.transactionId}
        icon={SearchIcon}
        size="lg"
        footer={
          selectedRequest && (
            <>
              <ActionButton
                variant="secondary"
                onClick={() => {
                  setShowInspectionModal(false);
                  setInspectionResults({});
                  setDamageReasons({});
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                icon={CheckCircle}
                onClick={handleCompleteInspection}
                loading={processing === selectedRequest.id}
                loadingLabel="Completing..."
              >
                Complete Inspection
              </ActionButton>
            </>
          )
        }
      >
        {selectedRequest && (
          <>
            <ModalSection title="Refund policy">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <NoteBlock label="Accepted" tone="emerald">
                  Good condition. Full refund and restocked.
                </NoteBlock>
                <NoteBlock label="Damaged" tone="red">
                  Cannot resell. No refund and not restocked.
                </NoteBlock>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Only accepted items will appear in &quot;Pending Refund Payments&quot;.
              </p>
            </ModalSection>

            <ModalSection title="Items">
              <div className="space-y-2.5">
                {selectedRequest.items.map((item, index) => {
                  const refundReq = (selectedRequest as any).refundRequest;
                  const requestedItem = (refundReq?.items || []).find(
                    (ri: any) => ri.id === item.id || ri.groupName === item.groupName
                  );
                  
                  if (!requestedItem || requestedItem.quantity === 0) return null;

                  const result = inspectionResults[index];
                  
                  return (
                    <div key={index} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.groupName}
                              className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
                            />
                          )}
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold text-gray-900">{item.groupName}</h4>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                              {item.selectedColor && <span>{item.selectedColor}</span>}
                              {item.selectedColor && item.selectedSize && <span aria-hidden="true">·</span>}
                              {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-600">
                              Quantity to inspect: <span className="font-semibold text-rose-600">{requestedItem.quantity}</span>
                            </p>
                          </div>
                        </div>

                        <div
                          role="radiogroup"
                          aria-label={`Inspection result for ${item.groupName}`}
                          className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:w-64"
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={result === "accepted"}
                            onClick={() => setInspectionResults(prev => ({
                              ...prev,
                              [index]: "accepted"
                            }))}
                            className={`flex flex-col items-center rounded-lg px-3 py-2 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                              result === "accepted"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-gray-600 hover:bg-white hover:text-gray-900"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-sm font-semibold">
                              <CheckCircle className="h-4 w-4" aria-hidden="true" />
                              Accepted
                            </span>
                            <span className={`text-[10px] ${result === "accepted" ? "text-emerald-50" : "text-gray-500"}`}>
                              Full refund · restock
                            </span>
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={result === "damaged"}
                            onClick={() => setInspectionResults(prev => ({
                              ...prev,
                              [index]: "damaged"
                            }))}
                            className={`flex flex-col items-center rounded-lg px-3 py-2 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${
                              result === "damaged"
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-gray-600 hover:bg-white hover:text-gray-900"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-sm font-semibold">
                              <AlertCircle className="h-4 w-4" aria-hidden="true" />
                              Damaged
                            </span>
                            <span className={`text-[10px] ${result === "damaged" ? "text-red-50" : "text-gray-500"}`}>
                              No refund · no restock
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ModalSection>
          </>
        )}
      </RequestModal>

      {/* Confirm Refund Payment Modal */}
      <RequestModal
        open={showConfirmPaymentModal && !!selectedRefundForConfirmation}
        onClose={closeConfirmPaymentModal}
        title="Confirm Refund Payment"
        subtitle={
          selectedRefundForConfirmation
            ? `Refund ID: ${selectedRefundForConfirmation.refund.refundId}`
            : undefined
        }
        icon={Banknote}
        size="md"
        footer={
          <>
            <ActionButton
              variant="secondary"
              onClick={() => {
                setShowConfirmPaymentModal(false);
                setSelectedRefundForConfirmation(null);
                setRefundMethod("cash");
                setRefundNotes("");
              }}
              disabled={isConfirmingPayment}
            >
              Cancel
            </ActionButton>
            <ActionButton
              variant="approve"
              icon={CheckCircle}
              onClick={handleConfirmRefundPayment}
              loading={isConfirmingPayment}
              loadingLabel="Confirming..."
            >
              Confirm Payment
            </ActionButton>
          </>
        }
      >
        {selectedRefundForConfirmation && (
          <>
            <div className="mb-4">
              <NoteBlock label="Important" tone="amber">
                Confirm only after you have physically given the money to the customer.
              </NoteBlock>
            </div>

            <ModalSection title="Amount">
              <KeyValueList
                rows={[
                  {
                    label: "Refund amount",
                    value: <span className="text-lg">{formatPrice(selectedRefundForConfirmation.refund.totalAmount)}</span>,
                    strong: true,
                  },
                ]}
              />
            </ModalSection>

            <ModalSection title="Refund method">
              <fieldset>
                <legend className="sr-only">Refund method (required)</legend>
                <div className="space-y-2">
                  <RadioCard
                    name="refundMethod"
                    value="cash"
                    checked={refundMethod === "cash"}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    title="Cash"
                  />
                  <RadioCard
                    name="refundMethod"
                    value="original_payment"
                    checked={refundMethod === "original_payment"}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    title={`Original Payment Method (${selectedRefundForConfirmation.transaction.paymentMethod})`}
                  />
                  <RadioCard
                    name="refundMethod"
                    value="bank_transfer"
                    checked={refundMethod === "bank_transfer"}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    title="Bank Transfer"
                  />
                </div>
              </fieldset>
            </ModalSection>

            <ModalSection title="Refund status">
              <fieldset>
                <legend className="sr-only">Refund status (required)</legend>
                <div className="space-y-2">
                  <RadioCard
                    name="refundStatus"
                    value="refunded"
                    checked={selectedRefundStatus === "refunded"}
                    onChange={(e) => setSelectedRefundStatus(e.target.value as any)}
                    title="Fully Refunded"
                    description="Customer received full refund amount"
                  />
                  <RadioCard
                    name="refundStatus"
                    value="partially_refunded"
                    checked={selectedRefundStatus === "partially_refunded"}
                    onChange={(e) => setSelectedRefundStatus(e.target.value as any)}
                    title="Partially Refunded"
                    description="Customer received partial refund amount"
                  />
                </div>
              </fieldset>
            </ModalSection>

            <ModalSection title="Notes">
              <label htmlFor="refund-payment-notes" className="sr-only">
                Notes (optional)
              </label>
              <textarea
                id="refund-payment-notes"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder="e.g., Refunded at store counter, Transaction ref: 123456"
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </ModalSection>
          </>
        )}
      </RequestModal>

      {/* Refund Modal */}
      <RequestModal
        open={showRefundModal && !!selectedRequest}
        onClose={closeRefundModal}
        title="Process Refund"
        subtitle={selectedRequest?.transactionId}
        icon={RotateCcw}
        size="lg"
        footer={
          selectedRequest && (
            <>
              <ActionButton variant="secondary" onClick={() => setShowRefundModal(false)}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="approve"
                onClick={handleSubmitRefund}
                loading={processing === selectedRequest.id}
                loadingLabel="Processing..."
              >
                Process Refund
              </ActionButton>
            </>
          )
        }
      >
        {selectedRequest && (
          <>
            {/* QR Code Image Display for Scan/Wallet Payments */}
            {(selectedRequest.paymentMethod === "scan" || selectedRequest.paymentMethod === "wallet") && (selectedRequest as any).refundRequest?.qrCodeImage && (
              <ModalSection title="Customer payment QR / account info">
                <p className="mb-2 text-xs text-gray-500">
                  Use this to send the refund back to the customer&apos;s payment account.
                </p>
                <div className="rounded-xl border border-gray-200 bg-white p-2">
                  <img
                    src={(selectedRequest as any).refundRequest.qrCodeImage}
                    alt="Customer Payment QR Code"
                    className="w-full max-h-48 object-contain rounded-lg"
                  />
                </div>
              </ModalSection>
            )}

            <div className="mb-4">
              <NoteBlock label="Pre-selected from customer request" tone="rose">
                Items and quantities have been automatically selected based on the customer&apos;s refund request. You can adjust if needed.
              </NoteBlock>
            </div>

            {/* Refund Items */}
            <ModalSection title="Items">
              <div className="space-y-2">
                {selectedRequest.items.map((item, index) => {
                  const alreadyRefunded = selectedRequest.refunds?.reduce((total, refund) => {
                    const refundItem = refund.items.find(ri => ri.itemIndex === index);
                    return total + (refundItem?.quantity || 0);
                  }, 0) || 0;
                  
                  const availableToRefund = item.quantity - alreadyRefunded;
                  const key = `${item.id}___${index}`;
                  const inputId = `refund-qty-${index}`;
                  
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.groupName}
                          className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium text-gray-900">{item.groupName}</h4>
                        <p className="text-xs text-gray-500">
                          {item.selectedColor && `Color: ${item.selectedColor} · `}
                          {item.selectedSize && `Size: ${item.selectedSize}`}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-700">
                          Price: {formatPrice(item.unitPrice)} × {item.quantity}
                        </p>
                        {alreadyRefunded > 0 && (
                          <p className="mt-0.5 text-xs text-amber-700">
                            Already refunded: {alreadyRefunded}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <label htmlFor={inputId} className="text-xs text-gray-500">
                          Refund<span className="sr-only"> quantity for {item.groupName}</span>
                        </label>
                        <input
                          id={inputId}
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
                          className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-center text-sm focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                        />
                        <span className="text-xs text-gray-500">/ {availableToRefund}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ModalSection>

            {/* Refund Calculation */}
            <ModalSection title="Refund calculation">
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

                const rows: Array<{ label: string; value: ReactNode; strong?: boolean }> = [
                  { label: "Items subtotal", value: formatPrice(totalItemRefundAmount) },
                ];
                if (cartDiscountRefund > 0) {
                  rows.push({
                    label: "Cart discount",
                    value: <span className="text-amber-700">-{formatPrice(cartDiscountRefund)}</span>,
                  });
                }
                rows.push({
                  label: "Total refund",
                  value: <span className="text-base text-rose-700">{formatPrice(finalRefundAmount)}</span>,
                  strong: true,
                });

                return <KeyValueList rows={rows} />;
              })()}
            </ModalSection>
          </>
        )}
      </RequestModal>

      {/* Details Modal */}
      <RequestModal
        open={showDetailsModal && !!selectedRequest}
        onClose={closeDetailsModal}
        title="Order Details"
        subtitle="Complete order information and items"
        icon={Package}
        size="lg"
        footer={
          <ActionButton variant="primary" onClick={() => setShowDetailsModal(false)}>
            Close
          </ActionButton>
        }
      >
        {selectedRequest && (
          <>
            <ModalSection title="Transaction">
              <KeyValueList
                rows={[
                  { label: "Transaction ID", value: selectedRequest.transactionId, strong: true },
                  { label: "Customer", value: selectedRequest.customer?.displayName || "Walk-in Customer" },
                  { label: "Payment method", value: formatPaymentMethod(selectedRequest.paymentMethod) },
                  {
                    label: "Status",
                    value: <span className="capitalize">{getPaymentStatus(selectedRequest)}</span>,
                  },
                ]}
              />
            </ModalSection>

            <ModalSection
              title="Order items"
              aside={<Badge tone="rose">{selectedRequest.items.length}</Badge>}
            >
              <ul className="space-y-2">
                {selectedRequest.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.groupName}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-gray-900">{item.groupName}</h4>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        {item.selectedColor && <span>{item.selectedColor}</span>}
                        {item.selectedColor && item.selectedSize && <span aria-hidden="true">·</span>}
                        {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-500">
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{formatPrice(item.quantity * item.unitPrice)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ModalSection>

            <ModalSection title="Totals">
              <KeyValueList
                rows={[
                  { label: "Subtotal", value: formatPrice(selectedRequest.subtotal) },
                  { label: "Tax", value: formatPrice(selectedRequest.tax) },
                  ...(selectedRequest.discount > 0
                    ? [{ label: "Discount", value: <span className="text-rose-600">-{formatPrice(selectedRequest.discount)}</span> }]
                    : []),
                  {
                    label: "Total",
                    value: <span className="text-lg text-rose-600">{formatPrice(selectedRequest.total)}</span>,
                    strong: true,
                  },
                ]}
              />
            </ModalSection>
          </>
        )}
      </RequestModal>
    </div>
  );
}

export default function RefundRequestsPage() {
  // Doc: "Manage Return Requests" - Owner + Manager only.
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <RefundRequestsContent />
    </ProtectedRoute>
  );
}
