"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-hot-toast";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { transactionService, Transaction } from "@/services/transactionService";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Mail,
  Phone,
  QrCode,
  SearchX,
  Undo2,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ActionButton,
  Badge,
  EmptyState,
  KeyValueList,
  LiveIndicator,
  LoadingList,
  ModalSection,
  NoteBlock,
  RequestCard,
  RequestModal,
  RequestPageHeader,
  RequestToolbar,
  StatCard,
  StatGrid,
} from "@/components/requests/RequestUI";

type TypeFilter = "all" | "cancellation" | "partial";

const REFUND_METHOD_LABEL: Record<"cash" | "original_payment" | "bank_transfer", string> = {
  cash: "Cash",
  original_payment: "Original payment method",
  bank_transfer: "Bank transfer",
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

  // ---------------------------------------------------------------------------
  // Presentation-only derived state (search, type filter, stats)
  // ---------------------------------------------------------------------------

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Reference time for "waiting N days"; captured once on mount.
  const [now] = useState(() => Date.now());

  /** Same timestamp the list is sorted by. */
  const getRequestedAt = (item: typeof pendingRefunds[0]) =>
    item.type === "cancellation"
      ? (item.transaction as any).cancelledAt
      : item.refund?.createdAt;

  const getReason = (item: typeof pendingRefunds[0]): string | undefined =>
    item.type === "cancellation"
      ? item.transaction.cancellationRefund?.reason || item.transaction.cancelReason
      : item.refund?.reason;

  const cancellationCount = pendingRefunds.filter((p) => p.type === "cancellation").length;
  const returnCount = pendingRefunds.length - cancellationCount;

  const oldestRequestedMs = pendingRefunds.reduce<number | null>((oldest, item) => {
    const ts = getRequestedAt(item);
    const ms = ts?.toDate ? ts.toDate().getTime() : ts ? new Date(ts).getTime() : NaN;
    if (!Number.isFinite(ms)) return oldest;
    return oldest === null || ms < oldest ? ms : oldest;
  }, null);
  const oldestDays =
    oldestRequestedMs === null ? null : Math.max(0, Math.floor((now - oldestRequestedMs) / DAY_MS));

  const filteredRefunds = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pendingRefunds.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!term) return true;
      const c = item.transaction.customer;
      return [
        item.transaction.transactionId,
        item.refund?.refundId,
        c?.displayName,
        c?.email,
        c?.phone,
      ].some((v) => typeof v === "string" && v.toLowerCase().includes(term));
    });
  }, [pendingRefunds, search, typeFilter]);

  const isFiltered = search.trim() !== "" || typeFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
  };

  // Same resets as the original Cancel button; ignored while a confirm is in flight.
  const closeConfirmModal = useCallback(() => {
    if (isConfirming) return;
    setShowConfirmModal(false);
    setSelectedRefund(null);
    setRefundMethod("original_payment");
    setRefundStatus("refunded");
    setRefundNotes("");
  }, [isConfirming]);

  const typeLabel = (type: "cancellation" | "partial") =>
    type === "cancellation" ? "Cancellation refund" : "Return refund";

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

        <main className="flex-1 overflow-y-auto px-3 py-5 sm:px-4 lg:px-6">
          <div className="mx-auto max-w-7xl">
            <RequestPageHeader
              icon={Wallet}
              title="Pending Refund Payments"
              description="Refunds owed to customers for cancelled and returned orders. Confirm each one after the money has been returned."
              actions={<LiveIndicator />}
            />

            <StatGrid>
              <StatCard
                label="Payments pending"
                value={pendingRefunds.length}
                hint="Awaiting payout"
                icon={Clock}
                tone="rose"
              />
              <StatCard
                label="Total to pay out"
                value={formatPrice(totalPendingAmount)}
                hint="Across all pending refunds"
                icon={Banknote}
                tone="emerald"
              />
              <StatCard
                label="Cancellation / Return"
                value={`${cancellationCount} / ${returnCount}`}
                hint="Cancelled orders vs returned items"
                icon={Undo2}
                tone="amber"
              />
              <StatCard
                label="Oldest waiting"
                value={oldestDays === null ? "-" : oldestDays === 0 ? "Today" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`}
                hint={oldestRequestedMs === null ? "No pending refunds" : formatDate(new Date(oldestRequestedMs))}
                icon={Calendar}
                tone={oldestDays !== null && oldestDays >= 3 ? "red" : "gray"}
              />
            </StatGrid>

            {pendingRefunds.length > 0 && (
              <div
                role="note"
                className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p>
                  Only confirm a payment after the money has actually been returned to the customer. Confirming
                  marks the refund as paid.
                </p>
              </div>
            )}

            <RequestToolbar<TypeFilter>
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by order, refund ID, customer, email or phone"
              filters={[
                { value: "all", label: "All", count: pendingRefunds.length },
                { value: "cancellation", label: "Cancellation", count: cancellationCount },
                { value: "partial", label: "Return", count: returnCount },
              ]}
              filterValue={typeFilter}
              onFilterChange={setTypeFilter}
              filterLabel="Refund type"
            />

            {loading ? (
              <LoadingList />
            ) : pendingRefunds.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All refunds are paid"
                description="There are no refund payments waiting. New ones appear here automatically."
              />
            ) : filteredRefunds.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No refunds match your filters"
                description="Try a different search term or refund type."
                action={
                  <ActionButton variant="secondary" icon={XCircle} onClick={clearFilters} className="lg:w-auto">
                    Clear filters
                  </ActionButton>
                }
              />
            ) : (
              <div className="space-y-3">
                {isFiltered && (
                  <p className="text-xs text-gray-500" aria-live="polite">
                    Showing {filteredRefunds.length} of {pendingRefunds.length} pending refunds
                  </p>
                )}
                {filteredRefunds.map((item, index) => {
                  const refundAmount = getRefundAmount(item);
                  const customer = item.transaction.customer;
                  const customerName = customer?.displayName || "Walk-in";
                  const reason = getReason(item);
                  const paymentLabel = formatPaymentMethodDisplay(item.transaction.paymentMethod);

                  return (
                    <RequestCard
                      key={`${item.transaction.id}-${item.refund?.refundId ?? "cancel"}-${index}`}
                      tone="rose"
                      title={item.transaction.transactionId}
                      badges={
                        <>
                          <Badge tone="rose" dot>
                            Pending payout
                          </Badge>
                          <Badge tone={item.type === "cancellation" ? "red" : "amber"}>
                            {typeLabel(item.type)}
                          </Badge>
                          <Badge tone="gray">{paymentLabel}</Badge>
                        </>
                      }
                      meta={[
                        { icon: User, label: "Customer", value: customerName },
                        {
                          icon: Banknote,
                          label: "Amount to refund",
                          value: <span className="text-rose-700">{formatPrice(refundAmount)}</span>,
                        },
                        { icon: Calendar, label: "Requested", value: formatDate(getRequestedAt(item)) },
                        { icon: CreditCard, label: "Payment method", value: paymentLabel },
                      ]}
                      actions={
                        <>
                          <ActionButton
                            variant="approve"
                            icon={CheckCircle2}
                            onClick={() => {
                              setSelectedRefund(item);
                              setShowConfirmModal(true);
                            }}
                            aria-label={`Confirm refund payment for ${item.transaction.transactionId}`}
                          >
                            Confirm payment
                          </ActionButton>
                          <p className="hidden text-center text-[11px] text-gray-500 lg:block">
                            After returning the money
                          </p>
                        </>
                      }
                    >
                      {(customer?.email || customer?.phone) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {customer?.email && (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Email:</span>
                              {customer.email}
                            </span>
                          )}
                          {customer?.phone && (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Phone:</span>
                              {customer.phone}
                            </span>
                          )}
                        </div>
                      )}

                      {item.type === "partial" && item.refund && (
                        <p className="text-xs text-gray-500">
                          Refund <span className="font-medium text-gray-700">{item.refund.refundId}</span>
                          {" · "}
                          {item.refund.items?.length ?? 0} item(s) returned
                        </p>
                      )}

                      {reason && <NoteBlock label="Reason">{reason}</NoteBlock>}

                      {item.qrCodeImage ? (
                        <div className="flex items-center gap-4 rounded-xl bg-rose-50/60 p-3 ring-1 ring-inset ring-rose-200">
                          <div className="shrink-0 rounded-lg border border-rose-200 bg-white p-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- customer-uploaded data URL */}
                            <img
                              src={item.qrCodeImage}
                              alt={`Refund payment QR code uploaded by ${customerName}`}
                              className="h-28 w-28 rounded object-contain"
                            />
                          </div>
                          <div className="min-w-0 text-sm">
                            <p className="flex items-center gap-1.5 font-medium text-rose-800">
                              <QrCode className="h-4 w-4" aria-hidden="true" />
                              Customer payment QR
                            </p>
                            <p className="mt-0.5 text-xs text-rose-700">
                              Transfer {formatPrice(refundAmount)} to this account, then confirm the payment.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500 ring-1 ring-inset ring-gray-200">
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          No payment QR uploaded. Contact the customer to arrange the refund.
                        </p>
                      )}
                    </RequestCard>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Confirm Payment Modal */}
      <RequestModal
        open={showConfirmModal && !!selectedRefund}
        onClose={closeConfirmModal}
        title="Confirm refund payment"
        subtitle={selectedRefund?.transaction.transactionId}
        icon={Wallet}
        size="md"
        footer={
          <>
            <ActionButton variant="secondary" onClick={closeConfirmModal} disabled={isConfirming}>
              Cancel
            </ActionButton>
            <ActionButton
              variant="approve"
              icon={CheckCircle2}
              onClick={handleConfirmPayment}
              loading={isConfirming}
              loadingLabel="Confirming..."
            >
              Confirm payment
            </ActionButton>
          </>
        }
      >
        {selectedRefund && (
          <>
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-inset ring-red-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <p>Confirm only after the money has been given back to the customer.</p>
            </div>

            <ModalSection title="Summary">
              <KeyValueList
                rows={[
                  { label: "Customer", value: selectedRefund.transaction.customer?.displayName || "Walk-in" },
                  { label: "Type", value: typeLabel(selectedRefund.type) },
                  ...(selectedRefund.type === "partial" && selectedRefund.refund
                    ? [{ label: "Refund ID", value: selectedRefund.refund.refundId }]
                    : []),
                  {
                    label: "Original payment",
                    value: formatPaymentMethodDisplay(selectedRefund.transaction.paymentMethod),
                  },
                  { label: "Requested", value: formatDate(getRequestedAt(selectedRefund)) },
                  { label: "Refund method", value: REFUND_METHOD_LABEL[refundMethod] },
                  {
                    label: "Amount to refund",
                    value: (
                      <span className="text-base text-rose-700">{formatPrice(getRefundAmount(selectedRefund))}</span>
                    ),
                    strong: true,
                  },
                ]}
              />
            </ModalSection>

            {selectedRefund.qrCodeImage && (
              <ModalSection title="Customer payment QR">
                <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- customer-uploaded data URL */}
                  <img
                    src={selectedRefund.qrCodeImage}
                    alt={`Refund payment QR code uploaded by ${
                      selectedRefund.transaction.customer?.displayName || "the customer"
                    }`}
                    className="max-h-56 w-auto rounded object-contain"
                  />
                </div>
              </ModalSection>
            )}

            <ModalSection title="Refund status">
              <fieldset>
                <legend className="sr-only">Refund status</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "refunded",
                        label: "Fully refunded",
                        description: "Customer received the full refund amount",
                      },
                      {
                        value: "partially_refunded",
                        label: "Partially refunded",
                        description: "Customer received part of the refund amount",
                      },
                    ] as const
                  ).map((option) => {
                    const checked = refundStatus === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-rose-200 ${
                          checked
                            ? "border-rose-300 bg-rose-50/60"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="refundStatus"
                          value={option.value}
                          checked={checked}
                          onChange={(e) => setRefundStatus(e.target.value as "refunded" | "partially_refunded")}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </ModalSection>
          </>
        )}
      </RequestModal>
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
