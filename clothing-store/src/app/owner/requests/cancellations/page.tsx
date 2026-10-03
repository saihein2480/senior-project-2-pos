"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-hot-toast";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { useCurrency } from "@/contexts/CurrencyContext";
import { transactionService, Transaction } from "@/services/transactionService";
import {
  XCircle,
  CheckCircle,
  Clock,
  User,
  Calendar,
  Package,
  X,
  Eye,
  Wallet,
  Banknote,
  Coins,
  QrCode,
  SearchX,
  FileText,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
} from "@/components/requests/RequestUI";

/** Shape of the cancellation request stored on a transaction (read-only, for display). */
interface CancellationRequestView {
  status?: string;
  reason?: string;
  requestedAt?: string;
  qrCodeImage?: string;
}

/** Read the cancellation request off a transaction for rendering. */
const getCancelReq = (t: Transaction): CancellationRequestView =>
  (t as unknown as { cancellationRequest?: CancellationRequestView }).cancellationRequest ?? {};

/** Same definition as the approve handler: cash/scan orders need a refund. */
const needsRefund = (t: Transaction) => t.paymentMethod === "cash" || t.paymentMethod === "scan";

type RefundFilter = "all" | "refund" | "no-refund";

export default function CancellationRequestsPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <CancellationRequestsContent />
    </ProtectedRoute>
  );
}

function CancellationRequestsContent() {
  const permissions = usePermissions();
  const { formatPrice } = useCurrency();
  const [requests, setRequests] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Transaction | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // UI-only state: in-memory search and filter
  const [search, setSearch] = useState("");
  const [refundFilter, setRefundFilter] = useState<RefundFilter>("all");

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
      // One server action: cancels the order (stock back), creates the pending
      // cancellation refund for a paid order, and marks the request approved
      // (approvedAt/approvedBy = the signed-in user) atomically. The reason
      // recorded is the customer's request reason.
      await transactionService.approveCancellationRequest(transaction.id);
      
      if (isPaidOrder) {
        toast.success("Cancellation approved! Refund payment confirmation needed.");
      } else {
        toast.success("Cancellation approved successfully!");
      }
    } catch (error) {
      console.error("Error approving cancellation:", error);
      toast.error(
        error instanceof Error && error.message
          ? `Failed to approve cancellation: ${error.message}`
          : "Failed to approve cancellation",
      );
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
      // Server sets cancellationRequest.status "rejected", rejectedAt,
      // rejectionReason and rejectedBy (the signed-in user).
      await transactionService.rejectCancellationRequest(transaction.id, reason);
      
      toast.success("Cancellation rejected");
    } catch (error) {
      console.error("Error rejecting cancellation:", error);
      toast.error(
        error instanceof Error && error.message
          ? `Failed to reject cancellation: ${error.message}`
          : "Failed to reject cancellation",
      );
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

  // ---------------------------------------------------------------------------
  // Derived UI state (in memory, from the already-loaded list)
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const paid = requests.filter(needsRefund);
    return {
      pending: requests.length,
      paid: paid.length,
      paidValue: paid.reduce((sum, r) => sum + (r.total || 0), 0),
      unpaid: requests.length - paid.length,
      totalValue: requests.reduce((sum, r) => sum + (r.total || 0), 0),
    };
  }, [requests]);

  const filterOptions: ReadonlyArray<FilterOption<RefundFilter>> = [
    { value: "all", label: "All", count: stats.pending },
    { value: "refund", label: "Needs refund", count: stats.paid },
    { value: "no-refund", label: "No refund", count: stats.unpaid },
  ];

  const visibleRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (refundFilter === "refund" && !needsRefund(r)) return false;
      if (refundFilter === "no-refund" && needsRefund(r)) return false;
      if (!term) return true;
      const haystack = [
        r.transactionId,
        r.customer?.displayName,
        r.customer?.email,
        r.customer?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [requests, search, refundFilter]);

  const clearFilters = () => {
    setSearch("");
    setRefundFilter("all");
  };

  const closeDetails = useCallback(() => setShowDetailsModal(false), []);

  const selectedCancelReq = selectedRequest ? getCancelReq(selectedRequest) : null;
  const selectedQr =
    selectedRequest?.paymentMethod === "scan" ? selectedCancelReq?.qrCodeImage : undefined;

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
            <RequestPageHeader
              icon={XCircle}
              title="Cancellation Requests"
              description="Review customer cancellations. Approving cancels the order and restores stock."
              actions={<LiveIndicator />}
            />

            <StatGrid>
              <StatCard label="Pending" value={stats.pending} hint="Awaiting a decision" icon={Clock} tone="amber" />
              <StatCard
                label="Needs refund"
                value={stats.paid}
                hint={`Paid (cash/scan) · ${formatPrice(stats.paidValue)}`}
                icon={Banknote}
                tone="rose"
              />
              <StatCard label="Unpaid / COD" value={stats.unpaid} hint="No refund needed" icon={Wallet} tone="blue" />
              <StatCard
                label="Value pending"
                value={formatPrice(stats.totalValue)}
                hint="Total of all pending orders"
                icon={Coins}
                tone="emerald"
              />
            </StatGrid>

            {!loading && requests.length > 0 && (
              <RequestToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by order, customer, email or phone"
                filters={filterOptions}
                filterValue={refundFilter}
                onFilterChange={setRefundFilter}
                filterLabel="Filter by refund requirement"
                trailing={
                  <span className="px-1 text-xs text-gray-500" aria-live="polite">
                    {visibleRequests.length} of {requests.length} shown
                  </span>
                }
              />
            )}

            {/* Requests List */}
            {loading ? (
              <LoadingList />
            ) : requests.length === 0 ? (
              <EmptyState
                icon={XCircle}
                title="No pending requests"
                description="All cancellation requests have been processed."
              />
            ) : visibleRequests.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching requests"
                description="Nothing matches the current search or filter."
                action={
                  <ActionButton variant="secondary" icon={X} onClick={clearFilters} className="lg:w-auto">
                    Clear filters
                  </ActionButton>
                }
              />
            ) : (
              <div className="space-y-3">
                {visibleRequests.map((request) => {
                  const cancelReq = getCancelReq(request);
                  const isProcessing = processing === request.id;
                  const isPaidOrder = needsRefund(request);
                  const hasQr = request.paymentMethod === "scan" && !!cancelReq.qrCodeImage;
                  const itemCount = request.items.length;

                  return (
                    <RequestCard
                      key={request.id}
                      tone="amber"
                      title={request.transactionId}
                      badges={
                        <>
                          <Badge tone="amber" dot>
                            Pending
                          </Badge>
                          {isPaidOrder && <Badge tone="rose">Refund required</Badge>}
                          {request.paymentMethod && (
                            <Badge tone="gray">
                              <span className="capitalize">{request.paymentMethod}</span>
                            </Badge>
                          )}
                        </>
                      }
                      meta={[
                        { icon: User, label: "Customer", value: request.customer?.displayName || "Walk-in" },
                        { icon: Package, label: "Items", value: `${itemCount} item${itemCount !== 1 ? "s" : ""}` },
                        {
                          icon: Calendar,
                          label: "Requested",
                          value: cancelReq.requestedAt
                            ? new Date(cancelReq.requestedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "—",
                        },
                        { icon: Coins, label: "Total", value: formatPrice(request.total) },
                      ]}
                      actions={
                        <>
                          <ActionButton
                            variant="secondary"
                            icon={Eye}
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowDetailsModal(true);
                            }}
                            aria-label={`View details for ${request.transactionId}`}
                          >
                            View details
                          </ActionButton>
                          <ActionButton
                            variant="approve"
                            icon={CheckCircle}
                            loading={isProcessing}
                            onClick={() => handleApprove(request)}
                            aria-label={`Approve cancellation for ${request.transactionId}`}
                          >
                            Approve
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            icon={X}
                            disabled={isProcessing}
                            onClick={() => handleReject(request)}
                            aria-label={`Reject cancellation for ${request.transactionId}`}
                          >
                            Reject
                          </ActionButton>
                        </>
                      }
                    >
                      {cancelReq.reason && <NoteBlock label="Cancellation reason">{cancelReq.reason}</NoteBlock>}
                      {hasQr && (
                        <p className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          Customer payment QR attached
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

      {/* Details Modal */}
      {selectedRequest && (
        <RequestModal
          open={showDetailsModal}
          onClose={closeDetails}
          title={`Order #${selectedRequest.transactionId}`}
          subtitle={
            selectedCancelReq?.requestedAt
              ? `Cancellation requested ${formatDate(selectedCancelReq.requestedAt)}`
              : "Cancellation request"
          }
          icon={FileText}
          size="xl"
          footer={
            <ActionButton variant="secondary" onClick={closeDetails}>
              Close
            </ActionButton>
          }
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ModalSection title="Customer">
                <KeyValueList
                  rows={[
                    { label: "Name", value: selectedRequest.customer?.displayName || "Walk-in" },
                    ...(selectedRequest.customer?.email
                      ? [{ label: "Email", value: selectedRequest.customer.email }]
                      : []),
                    ...(selectedRequest.customer?.phone
                      ? [{ label: "Phone", value: selectedRequest.customer.phone }]
                      : []),
                    {
                      label: "Payment",
                      value: <span className="capitalize">{selectedRequest.paymentMethod}</span>,
                    },
                  ]}
                />
              </ModalSection>

              <ModalSection title={`Items (${selectedRequest.items.length})`}>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {selectedRequest.items.map((item, index) => (
                    <li key={index} className="flex items-center gap-3 px-3 py-2">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.groupName}
                          className="h-10 w-10 flex-shrink-0 rounded-lg border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                          <Package className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{item.groupName}</p>
                        <p className="truncate text-xs text-gray-500">
                          {item.selectedColor && `${item.selectedColor}`}
                          {item.selectedColor && item.selectedSize && " · "}
                          {item.selectedSize && `${item.selectedSize}`}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right text-sm">
                        <p className="text-xs text-gray-500">
                          {item.quantity} × {formatPrice(item.unitPrice)}
                        </p>
                        <p className="font-semibold text-gray-900">{formatPrice(item.quantity * item.unitPrice)}</p>
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
                    {
                      label: "Total",
                      value: <span className="text-rose-600">{formatPrice(selectedRequest.total)}</span>,
                      strong: true,
                    },
                  ]}
                />
              </ModalSection>
            </div>

            <div>
              <ModalSection title="Status">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="amber" dot>
                    Pending
                  </Badge>
                  {needsRefund(selectedRequest) && <Badge tone="rose">Refund required</Badge>}
                </div>
              </ModalSection>

              {selectedCancelReq?.reason && (
                <ModalSection title="Reason">
                  <NoteBlock label="Cancellation reason">{selectedCancelReq.reason}</NoteBlock>
                </ModalSection>
              )}

              <ModalSection title="Refund QR">
                {selectedQr ? (
                  <div className="rounded-xl border border-rose-200 bg-gray-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedQr}
                      alt={`Customer refund payment QR code for order ${selectedRequest.transactionId}`}
                      className="w-full rounded-lg"
                    />
                  </div>
                ) : (
                  <p className="rounded-xl border border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
                    No QR code required for {selectedRequest.paymentMethod} payment
                  </p>
                )}
              </ModalSection>
            </div>
          </div>
        </RequestModal>
      )}
    </div>
  );
}
