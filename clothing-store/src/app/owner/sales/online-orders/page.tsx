"use client";

import { useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { onlineOrderService, OnlineOrder } from "@/services/onlineOrderService";
import { SettingsService, ReceiptPaperSize } from "@/services/settingsService";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  MoreVertical,
  Eye,
  Printer,
  X,
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
} from "lucide-react";

type OrderWorkflowStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "fully_returned"
  | "partially_returned"
  | "unknown";

type PaymentWorkflowStatus =
  | "paid"
  | "pending"
  | "failed"
  | "cancelled"
  | "pending_refund"
  | "refunded"
  | "partially_refunded"
  | "refund_rejected"
  | "unknown";

const OWNER_STATUS_OPTIONS: Array<{
  value: Exclude<OrderWorkflowStatus, "unknown">;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "packaging", label: "Packaging" },
  { value: "delivering", label: "Delivering" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "fully_returned", label: "Fully Returned" },
  { value: "partially_returned", label: "Partially Returned" },
];

function getNormalizedOrderStatus(row: OnlineOrder): OrderWorkflowStatus {
  const status = (row.status || "").toLowerCase();
  const paymentStatus = (row.paymentStatus || "").toLowerCase();
  const combined = `${status} ${paymentStatus}`;

  // Check for return statuses first
  if (/(fully_returned)/.test(combined)) return "fully_returned";
  if (/(partially_returned)/.test(combined)) return "partially_returned";

  if (/(packaging|packed|preparing)/.test(combined)) return "packaging";
  if (/(delivering|shipping|shipped|in_transit)/.test(combined)) {
    return "delivering";
  }
  if (/(delivered|fulfilled|received)/.test(combined)) return "delivered";

  // Payment success means the order just entered fulfillment flow.
  if (/(paid|success|succeeded|completed)/.test(combined)) return "pending";
  // Payment failure or refund should not appear as fulfillment statuses.
  if (/(fail|failed|error|declined|refunded|void)/.test(combined)) {
    return "cancelled";
  }
  if (/(cancelled|canceled|void)/.test(combined)) return "cancelled";
  if (/(pending|processing|created|initiated)/.test(combined)) return "pending";
  return "unknown";
}

function getOrderStatusLabel(row: OnlineOrder): string {
  const normalized = getNormalizedOrderStatus(row);
  if (normalized === "unknown") {
    const fallback = row.status || row.paymentStatus || "-";
    return fallback.charAt(0).toUpperCase() + fallback.slice(1).toLowerCase();
  }

  if (normalized === "pending") return "Pending";
  if (normalized === "packaging") return "Packaging";
  if (normalized === "delivering") return "Delivering";
  if (normalized === "delivered") return "Delivered";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "fully_returned") return "Fully Returned";
  if (normalized === "partially_returned") return "Partially Returned";

  return "Unknown";
}

function getPaymentStatusLabel(row: OnlineOrder): string {
  const raw = (row.paymentStatus || row.status || "").toLowerCase();

  if (/(success|succeeded|paid|completed)/.test(raw)) return "Paid";
  if (/(pending_refund)/.test(raw)) return "Pending Refund";
  if (/(refund_rejected)/.test(raw)) return "Refund Rejected";
  if (/(partially_refunded)/.test(raw)) return "Partially Refunded";
  if (/(refunded)/.test(raw)) return "Fully Refunded";
  if (/(pending|processing|created|initiated)/.test(raw)) return "Pending";
  if (/(fail|failed|error|declined)/.test(raw)) return "Failed";
  if (/(cancelled|canceled|void)/.test(raw)) return "Cancelled";

  const fallback = row.paymentStatus || row.status || "-";
  return fallback.charAt(0).toUpperCase() + fallback.slice(1).toLowerCase();
}

function getNormalizedPaymentStatus(row: OnlineOrder): PaymentWorkflowStatus {
  const raw = (row.paymentStatus || row.status || "").toLowerCase();

  if (/(success|succeeded|paid|completed)/.test(raw)) return "paid";
  if (/(pending_refund)/.test(raw)) return "pending_refund";
  if (/(refund_rejected)/.test(raw)) return "refund_rejected";
  if (/(partially_refunded)/.test(raw)) return "partially_refunded";
  if (/(refunded)/.test(raw)) return "refunded";
  if (/(pending|processing|created|initiated)/.test(raw)) return "pending";
  if (/(fail|failed|error|declined)/.test(raw)) return "failed";
  if (/(cancelled|canceled|void)/.test(raw)) return "cancelled";

  return "unknown";
}

function isPaymentPaid(row: OnlineOrder): boolean {
  return getNormalizedPaymentStatus(row) === "paid";
}

function getCustomerPhone(row: OnlineOrder): string {
  return row.customer?.phone || row.customer?.phoneNumber || "-";
}

function getCustomerAddress(row: OnlineOrder): string {
  const rawAddress =
    row.customer?.address ||
    row.customer?.shippingAddress ||
    row.shippingAddress ||
    row.address;

  if (!rawAddress) return "-";
  if (typeof rawAddress === "string") {
    return rawAddress.trim() || "-";
  }

  if (typeof rawAddress === "object") {
    const parts = [
      rawAddress.street,
      rawAddress.line1,
      rawAddress.line2,
      rawAddress.township,
      rawAddress.city,
      rawAddress.state,
      rawAddress.postalCode,
      rawAddress.zip,
      rawAddress.country,
    ].filter((part): part is string => typeof part === "string" && !!part);

    return parts.join(", ") || "-";
  }

  return "-";
}

/** Trim floating point noise so labels read "7%" instead of "7.000000001%". */
function formatRatePercent(percent: number) {
  return String(Math.round(percent * 100) / 100);
}

/**
 * Rebuild the money breakdown for an online order.
 *
 * Figures come from what the storefront stored at checkout so the owner sees
 * exactly what the customer was charged. `discount` holds promotion savings
 * only; coupon savings live in `couponDiscountTHB`.
 */
function getOrderSummary(row: OnlineOrder) {
  const cartItems = row.cartItems || [];

  let itemsSubtotal = 0;
  if (cartItems.length > 0) {
    itemsSubtotal = cartItems.reduce(
      (sum, item) =>
        sum + Number(item.priceTHB || 0) * Number(item.quantity || 1),
      0,
    );
  } else if (row.product) {
    itemsSubtotal =
      Number(row.product.priceTHB || 0) * Number(row.product.quantity || 1);
  }

  const storedSubtotal = Number(row.subtotal || 0);
  const subtotal = storedSubtotal > 0 ? storedSubtotal : itemsSubtotal;

  const promotionDiscount = Math.max(0, Number(row.discount || 0));
  const couponDiscount = Math.max(0, Number(row.couponDiscountTHB || 0));
  const taxableBase = Math.max(
    0,
    subtotal - promotionDiscount - couponDiscount,
  );

  const tax = Math.max(0, Number(row.tax || 0));

  // Prefer the rate stored with the order. Older orders predate that field, so
  // fall back to deriving it from the amounts we do have.
  const storedRate = Number(row.taxRate || 0);
  const taxPercent =
    storedRate > 0
      ? storedRate
      : taxableBase > 0 && tax > 0
        ? (tax / taxableBase) * 100
        : 0;

  const storedTotal = Number(row.total || 0);
  const computedTotal = taxableBase + tax;
  // Trust the stored total (what was actually charged) unless it is missing.
  const total = storedTotal > 0 ? storedTotal : computedTotal;

  const exchangeRate = Number(row.exchangeRate || 0);
  const storedMmk = Number(row.amountMmk || 0);
  const amountMmk =
    storedMmk > 0
      ? storedMmk
      : exchangeRate > 0
        ? Math.round(total * exchangeRate)
        : 0;

  return {
    subtotal,
    promotionDiscount,
    couponDiscount,
    taxableBase,
    tax,
    taxPercent,
    total,
    amountMmk,
    // True when the stored total disagrees with the line items, which means the
    // order predates the full breakdown being persisted.
    isInconsistent: storedTotal > 0 && Math.abs(storedTotal - computedTotal) > 0.01,
  };
}

function getPaymentMethodLabel(row: OnlineOrder): string {
  const method = (row.paymentMethod || "").toLowerCase();
  
  if (method === "cod") return "💵 COD";
  if (method === "cash") return "💵 Cash";
  if (method === "scan" || method === "wallet") return "📱 QR Scan";
  if (method) {
    return method.charAt(0).toUpperCase() + method.slice(1);
  }
  
  return "-";
}

function OrderDetailsModal({
  row,
  onClose,
}: {
  row: OnlineOrder;
  onClose: () => void;
}) {
  const cartItems = row.cartItems || [];
  const items = row.items || [];
  const hasProduct = !!row.product;

  const summary = getOrderSummary(row);
  const {
    subtotal,
    promotionDiscount,
    couponDiscount,
    tax,
    taxPercent,
    total: grandTotal,
    amountMmk,
  } = summary;

  let content: React.ReactNode[] = [];

  if (cartItems.length > 0) {
    content = cartItems.map((ci, idx) => (
      <div
        key={`ci-${idx}`}
        className="flex justify-between py-3 border-b border-gray-100 last:border-0 text-sm"
      >
        <div className="flex-1">
          <div className="font-semibold text-gray-900">{ci.productName}</div>
          {ci.color || ci.size ? (
            <div className="text-gray-500 mt-0.5">
              {[ci.color, ci.size].filter(Boolean).join(", ")}
            </div>
          ) : (
            ""
          )}
          <div className="text-xs text-gray-500 mt-1">
            ฿{Number(ci.priceTHB || 0).toFixed(2)} × {ci.quantity || 1}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-gray-900">
            ฿{(Number(ci.priceTHB || 0) * Number(ci.quantity || 1)).toFixed(2)}
          </div>
        </div>
      </div>
    ));
  } else if (hasProduct) {
    content = [
      <div
        key="prod-0"
        className="flex justify-between py-3 border-b border-gray-100 last:border-0 text-sm"
      >
        <div className="flex-1">
          <div className="font-semibold text-gray-900">
            {row.product?.productName}
          </div>
          {row.product?.color || row.product?.size ? (
            <div className="text-gray-500 mt-0.5">
              {[row.product?.color, row.product?.size]
                .filter(Boolean)
                .join(", ")}
            </div>
          ) : (
            ""
          )}
          <div className="text-xs text-gray-500 mt-1">
            ฿{Number(row.product?.priceTHB || 0).toFixed(2)} × {row.product?.quantity || 1}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-gray-900">
            ฿{(Number(row.product?.priceTHB || 0) * Number(row.product?.quantity || 1)).toFixed(2)}
          </div>
        </div>
      </div>,
    ];
  } else if (items.length > 0) {
    content = items.map((it, idx) => (
      <div
        key={`it-${idx}`}
        className="flex justify-between py-3 border-b border-gray-100 last:border-0 text-sm"
      >
        <span className="font-semibold text-gray-900">{it.name}</span>
        <span className="text-gray-700 font-medium">x{it.quantity}</span>
      </div>
    ));
  } else {
    content = [
      <div key="none" className="py-4 text-center text-gray-500">
        No items found
      </div>,
    ];
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-0">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col z-10">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Order Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {row.orderId || row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Customer Details */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900 mb-2">
              Customer Details
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Name: </span>
                {row.customer?.displayName || "-"}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Email: </span>
                {row.customer?.email || "-"}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Customer ID: </span>
                {row.customer?.uid || "-"}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Phone: </span>
                {getCustomerPhone(row)}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Address: </span>
                {getCustomerAddress(row)}
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-1">
              Items
            </div>
            {content}
          </div>

          {/* Order Summary */}
          <div className="rounded-md border border-gray-200 bg-blue-50 p-3">
            <div className="text-sm font-semibold text-gray-900 mb-2">
              Order Summary
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-700">
                <span>Subtotal:</span>
                <span>฿{subtotal.toFixed(2)}</span>
              </div>

              {promotionDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Promotion Discount:</span>
                  <span>-฿{promotionDiscount.toFixed(2)}</span>
                </div>
              )}

              {couponDiscount > 0 && (
                <div className="flex justify-between text-purple-700">
                  <div className="flex items-center gap-1">
                    <span>Coupon Discount:</span>
                    {(row.couponCode || row.appliedCouponCode) && (
                      <span className="text-xs bg-purple-100 px-1.5 py-0.5 rounded font-semibold">
                        {row.couponCode || row.appliedCouponCode}
                      </span>
                    )}
                  </div>
                  <span>-฿{couponDiscount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-700">
                <span>Tax ({formatRatePercent(taxPercent)}%):</span>
                <span>฿{tax.toFixed(2)}</span>
              </div>

              <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-300">
                <span>Total:</span>
                <span>฿{grandTotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs text-gray-600 pt-1">
                <span>MMK Equivalent:</span>
                <span>Ks {amountMmk.toLocaleString()}</span>
              </div>

              {summary.isInconsistent && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  This order was placed before the full tax breakdown was
                  recorded, so the lines above may not add up to the charged
                  total.
                </div>
              )}
            </div>
          </div>

          {/* Payment Info */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900 mb-2">
              Payment Information
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Method: </span>
                {getPaymentMethodLabel(row)}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Status: </span>
                {getPaymentStatusLabel(row)}
              </div>
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Provider: </span>
                {(row.provider || row.paymentProvider || "MMPAY").toUpperCase()}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderTableRow({
  row,
  isNew,
  isSelected,
  onSelect,
  onMarkSeen,
  onViewDetails,
  onPrintInvoice,
  onMarkCODPaid,
}: {
  row: OnlineOrder;
  isNew: boolean;
  isSelected: boolean;
  onSelect: (orderId: string, checked: boolean) => void;
  onMarkSeen: (id: string) => void;
  onViewDetails: (row: OnlineOrder) => void;
  onPrintInvoice: (row: OnlineOrder) => void;
  onMarkCODPaid: (row: OnlineOrder) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);

  const cartItems = row.cartItems || [];
  const items = row.items || [];
  const hasProduct = !!row.product;

  let totalItemsCount = 0;
  if (cartItems.length > 0)
    totalItemsCount = cartItems.reduce(
      (acc, curr) => acc + (curr.quantity || 1),
      0,
    );
  else if (hasProduct) totalItemsCount = row.product?.quantity || 1;
  else if (items.length > 0)
    totalItemsCount = items.reduce(
      (acc, curr) => acc + (curr.quantity || 1),
      0,
    );
  const orderStatusLabel = getOrderStatusLabel(row);
  const paymentStatusLabel = getPaymentStatusLabel(row);
  const paymentMethodLabel = getPaymentMethodLabel(row);
  const paymentMethod = (row.paymentMethod || "").toLowerCase();
  const isCOD = paymentMethod === "cod";
  const isDelivered = getNormalizedOrderStatus(row) === "delivered";
  const canMarkCODPaid = isCOD && isDelivered && getNormalizedPaymentStatus(row) !== "paid";

  const toggleDropdown = () => {
    if (dropdownOpen) {
      setDropdownOpen(false);
      return;
    }

    const button = actionButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 110;
    const gap = 6;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - gap;
    }
    if (top < 8) top = 8;

    setMenuPosition({ top, left });
    setDropdownOpen(true);
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(row.id, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
          aria-label={`Select order ${row.orderId || row.id}`}
        />
      </td>
      <td className="px-4 py-4 font-medium text-gray-900">
        <div className="flex items-center gap-2">
          <span>{row.orderId || row.id}</span>
          {isNew ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-green-700">
              NEW
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-4 text-gray-700">
        {row.customer?.displayName || row.customer?.email || "-"}
      </td>
      <td className="px-4 py-4 text-gray-700">
        {totalItemsCount} item{totalItemsCount !== 1 ? "s" : ""}
      </td>
      <td className="px-4 py-4 text-gray-700 font-medium">
        <div className="flex flex-col gap-0.5">
          <span>
            ฿ {(() => {
              // Use total field if available (direct THB amount)
              if (row.total !== undefined && row.total !== null) {
                return Number(row.total).toFixed(2);
              }
              // Fallback: Calculate THB total from cartItems
              if (row.cartItems && row.cartItems.length > 0) {
                const thbTotal = row.cartItems.reduce(
                  (sum, item) => sum + (Number(item.priceTHB || 0) * Number(item.quantity || 0)),
                  0
                );
                return thbTotal.toFixed(2);
              }
              // Last resort: derive from MMK if exchange rate exists
              const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 43);
              const mmkAmount = Number(row.amountMmk || 0);
              const thbEstimate = mmkRate > 0 ? mmkAmount / mmkRate : mmkAmount;
              return thbEstimate.toFixed(2);
            })()}
          </span>
          <span className="text-xs text-gray-500">
            Ks {Number(row.amountMmk || 0).toLocaleString()}
          </span>
        </div>
      </td>
      <td className="px-4 py-4 text-gray-700">{paymentMethodLabel}</td>
      <td className="px-4 py-4 text-gray-700">{paymentStatusLabel}</td>
      <td className="px-4 py-4 text-gray-700">{orderStatusLabel}</td>
      <td className="px-4 py-4 text-gray-600">
        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "-"}
      </td>
      <td className="px-4 py-4 text-right relative">
        <button
          ref={actionButtonRef}
          onClick={toggleDropdown}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
        >
          <MoreVertical size={20} />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div
              className="fixed w-44 bg-white border border-gray-200 shadow-lg rounded-md z-50 overflow-hidden"
              style={{
                top: menuPosition?.top ?? 8,
                left: menuPosition?.left ?? 8,
              }}
            >
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                onClick={() => {
                  setDropdownOpen(false);
                  onMarkSeen(row.id);
                  onViewDetails(row);
                }}
              >
                <Eye size={16} /> View Details
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                onClick={() => {
                  setDropdownOpen(false);
                  onMarkSeen(row.id);
                  onPrintInvoice(row);
                }}
              >
                <Printer size={16} /> Print Invoice
              </button>
              {canMarkCODPaid && (
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 flex items-center gap-2 text-green-600 transition-colors border-t border-gray-100"
                  onClick={() => {
                    setDropdownOpen(false);
                    onMarkCODPaid(row);
                  }}
                >
                  <DollarSign size={16} /> Mark as Paid
                </button>
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function OnlineOrdersContent() {
  const NEW_BADGE_WINDOW_MINUTES = 15;
  const SEEN_NEW_ORDERS_KEY = "onlineOrdersSeenNewBadges";

  const [rows, setRows] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | Exclude<OrderWorkflowStatus, "unknown">
  >("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<
    "all" | Exclude<PaymentWorkflowStatus, "unknown">
  >("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<
    "all" | "cod" | "scan"
  >("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkStatus, setBulkStatus] =
    useState<Exclude<OrderWorkflowStatus, "unknown">>("packaging");
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState<"PENDING" | "SUCCESS">("SUCCESS");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isBulkPaymentUpdating, setIsBulkPaymentUpdating] = useState(false);
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasRealtimeInitializedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_NEW_ORDERS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setSeenOrderIds(new Set(parsed));
      }
    } catch {
      // ignore invalid local storage data
    }
  }, []);

  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const existingIds = new Set(rows.map((row) => row.id));
      const next = new Set(
        Array.from(prev).filter((id) => existingIds.has(id)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const normalizeDateInput = (input: unknown): string => {
    if (!input) return "";
    if (typeof input === "string") return input;
    if (
      typeof input === "object" &&
      input !== null &&
      "toDate" in (input as Record<string, unknown>)
    ) {
      try {
        return (input as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return "";
      }
    }
    return "";
  };

  useEffect(() => {
    if (!db) {
      const load = async () => {
        try {
          const data = await onlineOrderService.getOnlineOrders();
          setRows(data);
        } finally {
          setLoading(false);
        }
      };

      void load();
      return;
    }

    const q = query(
      collection(db, "onlineOrders"),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const incomingRows = snap.docs.map((d) => {
          const data = d.data() as Omit<OnlineOrder, "id">;
          return {
            id: d.id,
            ...data,
            createdAt: normalizeDateInput(data.createdAt),
            updatedAt: normalizeDateInput(data.updatedAt),
          } as OnlineOrder;
        });

        if (!hasRealtimeInitializedRef.current) {
          knownOrderIdsRef.current = new Set(incomingRows.map((row) => row.id));
          hasRealtimeInitializedRef.current = true;
          setRows(incomingRows);
          setLoading(false);
          return;
        }

        const knownIds = knownOrderIdsRef.current;
        const newlyArrived = incomingRows
          .filter((row) => !knownIds.has(row.id))
          .map((row) => row.id);

        if (newlyArrived.length > 0) {
          setNewOrderIds((prev) => {
            const next = new Set(prev);
            newlyArrived.forEach((id) => next.add(id));
            return next;
          });
        }

        knownOrderIdsRef.current = new Set(incomingRows.map((row) => row.id));
        setRows(incomingRows);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const markOrderSeen = (id: string) => {
    setNewOrderIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setSeenOrderIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          SEEN_NEW_ORDERS_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore storage write errors
      }
      return next;
    });
  };

  const isRecentOrder = (row: OnlineOrder) => {
    const reference = row.createdAt || row.updatedAt || "";
    const createdMs = new Date(reference).getTime();
    if (Number.isNaN(createdMs)) return false;
    const ageMs = Date.now() - createdMs;
    return ageMs >= 0 && ageMs <= NEW_BADGE_WINDOW_MINUTES * 60 * 1000;
  };

  const shouldShowNewBadge = (row: OnlineOrder) => {
    // Show NEW badge if order is in the newOrderIds set (just arrived)
    if (newOrderIds.has(row.id)) return true;
    // Don't show if already marked as seen
    if (seenOrderIds.has(row.id)) return false;
    // Show for recent orders (within last 5 minutes) that haven't been seen
    return isRecentOrder(row);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    filterStatus,
    filterPaymentStatus,
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
      (row.orderId || row.id).toLowerCase().includes(searchText) ||
      row.customer?.displayName?.toLowerCase().includes(searchText) ||
      row.customer?.email?.toLowerCase().includes(searchText);

    const normalizedStatus = getNormalizedOrderStatus(row);
    const matchesStatus =
      filterStatus === "all" || normalizedStatus === filterStatus;

    const normalizedPaymentStatus = getNormalizedPaymentStatus(row);
    const matchesPaymentStatus =
      filterPaymentStatus === "all" ||
      normalizedPaymentStatus === filterPaymentStatus;

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

      const referenceDate = new Date(row.updatedAt || row.createdAt || "");
      matchesDateRange =
        !Number.isNaN(referenceDate.getTime()) &&
        referenceDate >= rangeStart &&
        referenceDate <= rangeEnd;
    }

    return (
      matchesSearch && matchesStatus && matchesPaymentStatus && matchesPaymentMethod && matchesDateRange
    );
  });

  const sortedFilteredRows = [...filteredRows].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || "").getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || "").getTime();
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

  const areAllCurrentRowsSelected =
    currentRows.length > 0 &&
    currentRows.every((row) => selectedOrderIds.has(row.id));

  const hasAnyCurrentRowsSelected = currentRows.some((row) =>
    selectedOrderIds.has(row.id),
  );

  const selectedCount = selectedOrderIds.size;

  const toggleRowSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  };

  const toggleCurrentRowsSelection = (checked: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);

      currentRows.forEach((row) => {
        if (checked) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
      });

      return next;
    });
  };

  const applyBulkStatusUpdate = async () => {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;

    setIsBulkUpdating(true);
    try {
      await onlineOrderService.updateOnlineOrderStatuses(ids, bulkStatus);
      setRows((prev) =>
        prev.map((row) =>
          selectedOrderIds.has(row.id)
            ? {
                ...row,
                status: bulkStatus,
                updatedAt: new Date().toISOString(),
              }
            : row,
        ),
      );
      setSelectedOrderIds(new Set());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update selected order statuses";
      window.alert(message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const applyBulkPaymentStatusUpdate = async () => {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;

    // Filter to only COD orders that are delivered
    const codDeliveredOrders = rows.filter((row) => {
      if (!selectedOrderIds.has(row.id)) return false;
      const isCOD = (row.paymentMethod || "").toLowerCase() === "cod";
      const isDelivered = getNormalizedOrderStatus(row) === "delivered";
      return isCOD && isDelivered;
    });

    if (codDeliveredOrders.length === 0) {
      window.alert("No delivered COD orders selected");
      return;
    }

    const confirmed = window.confirm(
      `Mark ${codDeliveredOrders.length} delivered COD order(s) as ${bulkPaymentStatus === "SUCCESS" ? "PAID" : "PENDING"}?`
    );

    if (!confirmed) return;

    setIsBulkPaymentUpdating(true);
    try {
      // Update each COD order's payment status
      for (const order of codDeliveredOrders) {
        await onlineOrderService.updateOnlineOrderPaymentStatus(
          order.id,
          bulkPaymentStatus
        );
      }

      // Update local state
      setRows((prev) =>
        prev.map((row) => {
          const shouldUpdate = codDeliveredOrders.some(o => o.id === row.id);
          return shouldUpdate
            ? {
                ...row,
                paymentStatus: bulkPaymentStatus,
                updatedAt: new Date().toISOString(),
              }
            : row;
        })
      );
      setSelectedOrderIds(new Set());
      window.alert(`Successfully updated ${codDeliveredOrders.length} order(s)`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update payment statuses";
      window.alert(message);
    } finally {
      setIsBulkPaymentUpdating(false);
    }
  };

  const hasSelectedDeliveredCODOrders = () => {
    return rows.some((row) => {
      if (!selectedOrderIds.has(row.id)) return false;
      const isCOD = (row.paymentMethod || "").toLowerCase() === "cod";
      const isDelivered = getNormalizedOrderStatus(row) === "delivered";
      return isCOD && isDelivered;
    });
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const getInvoiceItems = (row: OnlineOrder) => {
    const orderTotalMmk = Math.max(0, Number(row.amountMmk || 0));

    if (row.cartItems && row.cartItems.length > 0) {
      const totalThb = row.cartItems.reduce(
        (sum, item) =>
          sum +
          Number(item.priceTHB || 0) * Math.max(1, Number(item.quantity || 1)),
        0,
      );
      const totalQty = row.cartItems.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      );

      return row.cartItems.map((item) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const itemThbTotal = Number(item.priceTHB || 0) * quantity;
        const lineTotalMmk =
          totalThb > 0
            ? (itemThbTotal / totalThb) * orderTotalMmk
            : totalQty > 0
              ? (quantity / totalQty) * orderTotalMmk
              : 0;

        return {
          name: item.productName || "-",
          variant: [item.color, item.size].filter(Boolean).join(", "),
          quantity,
          unitPrice: quantity > 0 ? lineTotalMmk / quantity : lineTotalMmk,
          lineTotal: lineTotalMmk,
          currency: "MMK" as const,
        };
      });
    }

    if (row.product) {
      const quantity = Math.max(1, Number(row.product.quantity || 1));
      const lineTotalMmk = orderTotalMmk;

      return [
        {
          name: row.product.productName || "-",
          variant: [row.product.color, row.product.size]
            .filter(Boolean)
            .join(", "),
          quantity,
          unitPrice: quantity > 0 ? lineTotalMmk / quantity : lineTotalMmk,
          lineTotal: lineTotalMmk,
          currency: "MMK" as const,
        },
      ];
    }

    if (row.items && row.items.length > 0) {
      return row.items.map((item) => ({
        name: item.name || "-",
        variant: "",
        quantity: item.quantity || 1,
        unitPrice:
          Math.max(1, Number(item.quantity || 1)) > 0
            ? Number(item.amount || 0) / Math.max(1, Number(item.quantity || 1))
            : Number(item.amount || 0),
        lineTotal: Number(item.amount || 0),
        currency: "MMK" as const,
      }));
    }

    return [];
  };

  const getPrintSizes = (size: ReceiptPaperSize) => {
    switch (size) {
      case "44mm":
        return {
          width: "40mm",
          fontSize: "9px",
          titleSize: "13px",
          detailSize: "8px",
        };
      case "57mm":
        return {
          width: "44mm",
          fontSize: "9px",
          titleSize: "13px",
          detailSize: "8px",
        };
      case "58mm":
        return {
          width: "44mm",
          fontSize: "10px",
          titleSize: "14px",
          detailSize: "9px",
        };
      case "69mm":
        return {
          width: "60mm",
          fontSize: "11px",
          titleSize: "15px",
          detailSize: "10px",
        };
      case "76mm":
      case "78mm":
        return {
          width: "68mm",
          fontSize: "11px",
          titleSize: "15px",
          detailSize: "10px",
        };
      case "80mm":
      case "82.5mm":
        return {
          width: "72mm",
          fontSize: "12px",
          titleSize: "16px",
          detailSize: "11px",
        };
      case "112mm":
      case "114mm":
        return {
          width: "100mm",
          fontSize: "14px",
          titleSize: "18px",
          detailSize: "12px",
        };
      case "210mm":
        return {
          width: "190mm",
          fontSize: "16px",
          titleSize: "20px",
          detailSize: "14px",
        };
      default:
        return {
          width: "72mm",
          fontSize: "12px",
          titleSize: "16px",
          detailSize: "11px",
        };
    }
  };

  const handlePrintInvoice = async (row: OnlineOrder) => {
    const invoiceItems = getInvoiceItems(row);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const settings = await SettingsService.getBusinessSettings().catch(
      () => null,
    );
    const printSize = getPrintSizes(settings?.receiptPaperSize || "80mm");

    // Reuse the same breakdown as the details modal so the printed receipt and
    // the on-screen summary can never disagree.
    const summary = getOrderSummary(row);
    const {
      subtotal,
      promotionDiscount,
      couponDiscount,
      tax,
      taxPercent,
      total: grandTotal,
    } = summary;

    const orderId = escapeHtml(row.orderId || row.id);
    const customerName = escapeHtml(row.customer?.displayName || "-");
    const customerEmail = escapeHtml(row.customer?.email || "-");
    const customerPhone = escapeHtml(getCustomerPhone(row));
    const customerAddress = escapeHtml(getCustomerAddress(row));
    const updatedAt = escapeHtml(
      row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "-",
    );
    const status = escapeHtml(
      `${row.status || "-"} / ${row.paymentStatus || "-"}`,
    );
    const amount = summary.amountMmk;
    const formatMmk = (value: number) =>
      `${Math.round(value).toLocaleString()} MMK`;
    const formatThb = (value: number) =>
      `THB ${Number(value || 0).toFixed(2)}`;
    const formatPrice = (value: number, currency: "THB" | "MMK") => {
      if (currency === "THB") {
        return `THB ${Number(value || 0).toFixed(2)}`;
      }
      return `${Math.round(Number(value || 0)).toLocaleString()} MMK`;
    };
    const toAbsoluteUrl = (url: string) => {
      const raw = (url || "").trim();
      if (!raw) return "";
      if (
        /^https?:\/\//i.test(raw) ||
        raw.startsWith("data:") ||
        raw.startsWith("blob:")
      ) {
        return raw;
      }
      if (raw.startsWith("//")) {
        return `${window.location.protocol}${raw}`;
      }
      if (raw.startsWith("/")) {
        return `${window.location.origin}${raw}`;
      }
      return `${window.location.origin}/${raw}`;
    };

    const businessName = escapeHtml(
      settings?.businessName || "ONLINE ORDER RECEIPT",
    );
    const branchName = escapeHtml(
      settings?.currentBranch || "Frontstore Payment",
    );
    const showBusinessLogo = settings?.showBusinessLogoOnInvoice ?? true;
    const businessLogo = escapeHtml(
      toAbsoluteUrl(settings?.businessLogo || "/logo.jpg"),
    );
    const footerMessage = settings?.invoiceFooterMessage
      ? escapeHtml(settings.invoiceFooterMessage)
      : "";
    const qrPayload = `${row.orderId || row.id}|${Math.round(amount)}|${row.updatedAt || row.createdAt || ""}`;
    const generatedQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrPayload)}`;
    const footerImage = escapeHtml(
      toAbsoluteUrl(settings?.invoiceFooterImage || generatedQrImage),
    );

    const itemsHtml =
      invoiceItems.length > 0
        ? invoiceItems
            .map((item) => {
              const variantText = item.variant
                ? ` - ${escapeHtml(item.variant)}`
                : "";
              const lineAmountText = formatPrice(item.lineTotal, item.currency);

              return `
                <div class="item">
                  <div class="item-name">${escapeHtml(item.name)}${variantText}</div>
                  <div class="item-line">
                    <span>${escapeHtml(String(item.quantity))} item${item.quantity > 1 ? "s" : ""}</span>
                    <span>${escapeHtml(lineAmountText)}</span>
                  </div>
                </div>
              `;
            })
            .join("")
        : `<div style="text-align:center;color:#6b7280;">No items found</div>`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt - ${orderId}</title>
          <style>
            @media print {
              @page {
                size: ${printSize.width} auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Noto Sans Myanmar', 'Noto Sans Thai', 'Segoe UI', Arial, sans-serif;
              width: ${printSize.width};
              margin: 0 auto;
              padding: 8px;
              font-size: ${printSize.fontSize};
              line-height: 1.4;
            }
            .header {
              text-align: center;
              margin-bottom: 10px;
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
            }
            .title {
              font-size: ${printSize.titleSize};
              font-weight: bold;
              margin-bottom: 4px;
            }
            .branch {
              font-size: ${printSize.fontSize};
              margin-bottom: 2px;
            }
            .datetime {
              font-size: ${printSize.fontSize};
              margin-top: 4px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
              gap: 6px;
            }
            .info-row span:last-child {
              text-align: right;
              word-break: break-word;
            }
            .items {
              margin: 10px 0;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
              padding: 8px 0;
            }
            .item {
              margin: 4px 0;
            }
            .item-name {
              font-weight: bold;
            }
            .item-line {
              display: flex;
              justify-content: space-between;
              margin-top: 2px;
            }
            .totals {
              margin-top: 10px;
            }
            .total-line {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
            }
            .coupon-line {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
              color: #7c3aed;
            }
            .grand-total {
              font-weight: bold;
              font-size: ${printSize.titleSize};
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
              padding: 6px 0;
              margin: 6px 0;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              border-top: 1px dashed #000;
              padding-top: 8px;
            }
            .thank-you {
              font-weight: bold;
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${showBusinessLogo && businessLogo ? `<img src="${businessLogo}" alt="Business Logo" style="max-width: 120px; max-height: 60px; margin: 0 auto 6px; object-fit: contain; display: block;" />` : ""}
            <div class="title">${businessName}</div>
            <div class="branch">${branchName}</div>
            <div class="datetime">${updatedAt}</div>
            <div style="margin-top: 4px;">Order: ${orderId}</div>
          </div>

          <div class="info-row">
            <span>Customer:</span>
            <span>${customerName}</span>
          </div>
          <div class="info-row">
            <span>Email:</span>
            <span>${customerEmail}</span>
          </div>
          <div class="info-row">
            <span>Phone:</span>
            <span>${customerPhone}</span>
          </div>
          <div class="info-row">
            <span>Address:</span>
            <span>${customerAddress}</span>
          </div>
          <div class="info-row">
            <span>Status:</span>
            <span>${status}</span>
          </div>
          <div class="info-row">
            <span>Payment:</span>
            <span>${escapeHtml(getPaymentMethodLabel(row))} - ${escapeHtml((row.provider || "MMPAY").toUpperCase())}</span>
          </div>

          <div class="items">
            ${itemsHtml}
          </div>

          <div class="totals">
            <div class="total-line">
              <span>Subtotal:</span>
              <span>${formatThb(subtotal)}</span>
            </div>
            ${promotionDiscount > 0 ? `
            <div class="total-line">
              <span>Promotion:</span>
              <span>-${formatThb(promotionDiscount)}</span>
            </div>
            ` : ''}
            ${couponDiscount > 0 ? `
            <div class="coupon-line">
              <span>Coupon (${escapeHtml(row.couponCode || 'DISCOUNT')}):</span>
              <span>-${formatThb(couponDiscount)}</span>
            </div>
            ` : ''}
            <div class="total-line">
              <span>Tax (${escapeHtml(formatRatePercent(taxPercent))}%):</span>
              <span>${formatThb(tax)}</span>
            </div>
            <div class="total-line grand-total">
              <span>TOTAL (THB):</span>
              <span>${formatThb(grandTotal)}</span>
            </div>
            <div class="total-line">
              <span>TOTAL (MMK):</span>
              <span>${formatMmk(amount)}</span>
            </div>
          </div>

          <div class="footer">
            <div class="thank-you">Thank You!</div>
            <div>Please come again</div>
            ${footerMessage ? `<div style="margin-top: 8px; font-size: ${printSize.detailSize}; text-align: center;">${footerMessage}</div>` : ""}
            ${footerImage ? `<div style="margin-top: 8px; text-align: center;"><img src="${footerImage}" alt="Invoice Footer" style="max-width: 100%; max-height: 90px; object-fit: contain;" /></div>` : ""}
            
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    let printed = false;
    const printNow = () => {
      if (printed) return;
      printed = true;
      printWindow.focus();
      printWindow.print();
    };

    if (images.length === 0) {
      printNow();
      return;
    }

    let doneCount = 0;
    const onImageDone = () => {
      doneCount += 1;
      if (doneCount >= images.length) {
        printNow();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        onImageDone();
      } else {
        img.onload = onImageDone;
        img.onerror = onImageDone;
      }
    });

    setTimeout(printNow, 1500);
  };

  const handleMarkCODPaid = async (row: OnlineOrder) => {
    const confirmed = window.confirm(
      `Mark COD order ${row.orderId || row.id} as PAID?\n\nThis confirms that the customer has paid cash on delivery.\n\nOrder Amount: ${Number(row.amountMmk || 0).toLocaleString()} MMK`
    );
    
    if (!confirmed) return;

    try {
      // Update payment status to "SUCCESS" or "PAID"
      await onlineOrderService.updateOnlineOrderPaymentStatus(row.id, "SUCCESS");
      
      // Update local state
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, paymentStatus: "SUCCESS", updatedAt: new Date().toISOString() }
            : r
        )
      );
      
      window.alert("COD order marked as paid successfully!");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update COD payment status";
      window.alert(message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          activeItem="online-orders"
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          activeItem="online-orders"
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onMenuToggle={() => setIsMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-screen-2xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
              Online Orders
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Orders created by frontstore checkout and MyanMyanPay payment
              flow.
            </p>

            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search order ID or customer..."
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
                          | "pending"
                          | "packaging"
                          | "delivering"
                          | "delivered"
                          | "cancelled"
                          | "fully_returned"
                          | "partially_returned",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none"
                  >
                    <option value="all">All Order Status</option>
                    <option value="pending">Pending</option>
                    <option value="packaging">Packaging</option>
                    <option value="delivering">Delivering</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="fully_returned">Fully Returned</option>
                    <option value="partially_returned">Partially Returned</option>
                  </select>
                </div>

                <div className="relative">
                  <Filter
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={filterPaymentStatus}
                    onChange={(e) =>
                      setFilterPaymentStatus(
                        e.target.value as
                          | "all"
                          | "paid"
                          | "pending"
                          | "failed"
                          | "cancelled"
                          | "pending_refund",
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none"
                  >
                    <option value="all">All Payment Status</option>
                    <option value="paid">Paid</option>
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
                    value={filterPaymentMethod}
                    onChange={(e) =>
                      setFilterPaymentMethod(
                        e.target.value as "all" | "cod" | "scan"
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none"
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none"
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
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-700">
                  {selectedCount > 0
                    ? `${selectedCount} order${selectedCount > 1 ? "s" : ""} selected`
                    : "Select orders to update status"}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={bulkStatus}
                    onChange={(e) =>
                      setBulkStatus(
                        e.target.value as Exclude<
                          OrderWorkflowStatus,
                          "unknown"
                        >,
                      )
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {OWNER_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBulkStatusUpdate}
                    disabled={selectedCount === 0 || isBulkUpdating}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBulkUpdating ? "Updating..." : "Update Order Status"}
                  </button>
                </div>
              </div>

              {/* Payment Status Update - Only for delivered COD orders */}
              {hasSelectedDeliveredCODOrders() && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-700">
                    💵 Update payment status for delivered COD orders
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={bulkPaymentStatus}
                      onChange={(e) =>
                        setBulkPaymentStatus(e.target.value as "PENDING" | "SUCCESS")
                      }
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="SUCCESS">Paid</option>
                      <option value="PENDING">Pending</option>
                    </select>
                    <button
                      type="button"
                      onClick={applyBulkPaymentStatusUpdate}
                      disabled={isBulkPaymentUpdating}
                      className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isBulkPaymentUpdating ? "Updating..." : "Update Payment Status"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 overflow-x-auto overflow-y-visible rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      <input
                        type="checkbox"
                        checked={areAllCurrentRowsSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              hasAnyCurrentRowsSelected &&
                              !areAllCurrentRowsSelected;
                          }
                        }}
                        onChange={(e) =>
                          toggleCurrentRowsSelection(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
                        aria-label="Select all rows on current page"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Order Ref</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Amount (THB / MMK)</th>
                    <th className="px-4 py-3 font-medium">Payment Method</th>
                    <th className="px-4 py-3 font-medium">Payment Status</th>
                    <th className="px-4 py-3 font-medium">Order Status</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        Loading online orders...
                      </td>
                    </tr>
                  ) : currentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No matching online orders found.
                      </td>
                    </tr>
                  ) : (
                    currentRows.map((row) => (
                      <OrderTableRow
                        key={row.id}
                        row={row}
                        isNew={shouldShowNewBadge(row)}
                        isSelected={selectedOrderIds.has(row.id)}
                        onSelect={toggleRowSelection}
                        onMarkSeen={markOrderSeen}
                        onViewDetails={setSelectedOrder}
                        onPrintInvoice={handlePrintInvoice}
                        onMarkCODPaid={handleMarkCODPaid}
                      />
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

            {selectedOrder && (
              <OrderDetailsModal
                row={selectedOrder}
                onClose={() => setSelectedOrder(null)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OnlineOrdersPage() {
  return (
    <ProtectedRoute requiredRole={["owner", "manager"]}>
      <OnlineOrdersContent />
    </ProtectedRoute>
  );
}
