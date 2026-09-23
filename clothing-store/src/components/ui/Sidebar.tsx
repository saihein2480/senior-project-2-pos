"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  BarChart3,
  ShoppingCart,
  CreditCard,
  FileText,
  Package,
  Users,
  Receipt,
  CheckCircle,
  Hash,
  QrCode,
  Tag,
  Plus,
  Settings,
  Shield,
  TrendingUp,
  UserCheck,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Store,
  Building2,
  Wallet,
  AlertCircle,
  RotateCcw,
  XCircle,
  DollarSign,
  Gift,
} from "lucide-react";
import { MenuItem, NavigationProps } from "@/types/schemas";
import { useSettings } from "@/contexts/SettingsContext";
import { usePosSurfaceVisibility } from "@/hooks/usePosSurfaceVisibility";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { UserRole } from "@/types/auth";
import { useOnlineOrdersNotification } from "@/hooks/useOnlineOrdersNotification";

const iconMap = {
  Home,
  BarChart3,
  ShoppingCart,
  CreditCard,
  FileText,
  Package,
  Users,
  Receipt,
  CheckCircle,
  Hash,
  QrCode,
  Tag,
  Plus,
  Settings,
  Shield,
  TrendingUp,
  UserCheck,
  Building2,
  Store,
  Wallet,
  AlertCircle,
  RotateCcw,
  XCircle,
  DollarSign,
  Gift,
};

interface SidebarProps extends NavigationProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isCartModalOpen?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/**
 * Refund-payment notification dismissal.
 *
 * The count comes from live Firestore data, so "mark as seen" is stored as a
 * baseline rather than a flag: the badge returns only once the number of pending
 * refund payments rises above what the owner last acknowledged.
 */
const REFUND_PAYMENTS_SEEN_KEY = "dismissedRefundPaymentsCount";
const REFUND_PAYMENTS_SEEN_EVENT = "refundPaymentsSeenLocally";

function readDismissedRefundPayments(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(REFUND_PAYMENTS_SEEN_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeDismissedRefundPayments(count: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFUND_PAYMENTS_SEEN_KEY, String(count));
  } catch {
    // Storage blocked; the badge just stays visible.
  }
}

export function Sidebar({
  activeItem,
  onItemClick,
  className = "",
  isCartModalOpen = false,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [manuallyCollapsed, setManuallyCollapsed] = useState<string[]>([]);
  const [logoError, setLogoError] = useState<boolean>(false);
  const [pendingCancellationCount, setPendingCancellationCount] = useState<number>(0);
  const [pendingRefundCount, setPendingRefundCount] = useState<number>(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  /**
   * Refund payments the owner has not acknowledged yet.
   *
   * Separate from `pendingRefundPaymentsCount`, which is the true outstanding
   * workload: this one is the *notification*, so opening Refund Payment clears
   * it even though the payments themselves are still pending. Mirrors the
   * dismissal approach in useOnlineOrdersNotification.
   */
  const [unseenRefundPaymentsCount, setUnseenRefundPaymentsCount] =
    useState<number>(0);
  const refundPaymentsTotalRef = useRef<number>(0);

  // Use settings context for business name and logo
  const { businessSettings, isLoading } = useSettings();
  const businessName = businessSettings?.businessName;
  const businessLogo = businessSettings?.businessLogo;

  const { unseenOrdersCount, markAsSeen } = useOnlineOrdersNotification();

  // Listen to pending cancellation and refund requests
  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        const { collection, query, onSnapshot } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        
        const transactionsRef = collection(db!, "transactions");
        // Deliberately unfiltered. This used to be
        // `where("status", "!=", "cancelled")`, which silently broke the Refund
        // Payment badge: approving a cancellation for a paid order sets
        // status="cancelled" AND writes cancellationRefund.status="pending", so
        // the one document that owes a refund payment was the one document
        // excluded from the query. The /requests/pending-refunds page it links
        // to queries the whole collection, so this now matches it.
        const q = query(transactionsRef);
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          let cancellationCount = 0;
          let refundCount = 0;
          let paymentCount = 0;
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            const isCancelled = /cancelled|canceled|void/i.test(
              String(data.status || ""),
            );
            
            // Count pending CANCELLATION requests. Only actionable while the
            // order is still live, matching the cancellations page listing.
            if (!isCancelled && data.cancellationRequest?.status === "pending") {
              cancellationCount++;
            }
            
            // Count pending REFUND requests. Not status-gated: a cancelled paid
            // order with no cancellation refund can still have a return request.
            if (data.refundRequest?.status === "pending") {
              refundCount++;
            }
            
            // Count pending refund PAYMENTS (approved but not yet paid)
            const isPaidOrder = data.paymentMethod === "cash" || data.paymentMethod === "scan" || data.paymentMethod === "wallet";
            if (isPaidOrder) {
              // Check for pending cancellation refund
              if (data.cancellationRefund?.status === "pending") {
                paymentCount++;
              }
              
              // Check for pending partial refunds
              const refunds = data.refunds || [];
              refunds.forEach((refund: any) => {
                if (refund.status === "pending") {
                  paymentCount++;
                }
              });
            }
          });
          
          setPendingCancellationCount(cancellationCount);
          setPendingRefundCount(refundCount);

          // Derive the unseen count here rather than in an effect, so reading
          // localStorage stays inside a callback.
          refundPaymentsTotalRef.current = paymentCount;
          const dismissed = readDismissedRefundPayments();
          if (paymentCount > dismissed) {
            setUnseenRefundPaymentsCount(paymentCount - dismissed);
          } else {
            // Fewer pending than were dismissed (some got paid): re-baseline so
            // the next new one shows up again.
            writeDismissedRefundPayments(paymentCount);
            setUnseenRefundPaymentsCount(0);
          }
        });
        
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching pending requests:", error);
      }
    };
    
    fetchPendingRequests();
  }, []);

  // The sidebar is mounted twice (desktop + mobile overlay), so a dismissal in
  // one instance has to reach the other. Also covers other tabs via `storage`.
  useEffect(() => {
    const resync = () => {
      const dismissed = readDismissedRefundPayments();
      const total = refundPaymentsTotalRef.current;
      setUnseenRefundPaymentsCount(total > dismissed ? total - dismissed : 0);
    };

    window.addEventListener(REFUND_PAYMENTS_SEEN_EVENT, resync);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener(REFUND_PAYMENTS_SEEN_EVENT, resync);
      window.removeEventListener("storage", resync);
    };
  }, []);

  /**
   * Everything needing attention under Online Sales: new paid orders plus
   * outstanding cancellation, return and refund-payment work.
   *
   * Uses the *unseen* refund-payment count so acknowledging the child badge
   * also settles the parent, rather than leaving a number the owner cannot
   * clear.
   */
  const onlineSalesBadgeTotal =
    unseenOrdersCount +
    pendingCancellationCount +
    pendingRefundCount +
    unseenRefundPaymentsCount;

  /** Acknowledge the current pending refund payments, hiding the badge. */
  const markRefundPaymentsSeen = () => {
    writeDismissedRefundPayments(refundPaymentsTotalRef.current);
    setUnseenRefundPaymentsCount(0);
    window.dispatchEvent(new Event(REFUND_PAYMENTS_SEEN_EVENT));
  };

  // Listen to unread notifications count
  useEffect(() => {
    const fetchUnreadNotifications = async () => {
      try {
        const { collection, query, where, onSnapshot } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        
        // The "notifications" collection also holds customer-facing
        // notifications (with a userId field) for the storefront account.
        // Those aren't owner-facing, so filter them out client-side.
        const OWNER_NOTIFICATION_TYPES = new Set([
          "online_order",
          "cancellation_request",
          "refund_request",
          "refund_payment",
          "low_stock",
          "out_of_stock",
        ]);

        const notificationsRef = collection(db!, "notifications");
        const q = query(
          notificationsRef,
          where("read", "==", false)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          let count = 0;
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.userId && OWNER_NOTIFICATION_TYPES.has(data.type)) {
              count++;
            }
          });
          setUnreadNotificationsCount(count);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching unread notifications:", error);
      }
    };
    
    fetchUnreadNotifications();
  }, []);

  // Get user role from auth context
  const { user } = useAuth();
  
  // Menu visibility follows the effective role, so an owner previewing Staff
  // sees the Staff menu. Non-owners are pinned to their real role by the
  // context, so this cannot be used to reveal menus a role should not have.
  const { effectiveRole } = useViewMode();
  const userRole = effectiveRole || user?.role || "staff";

  // Owner-only preference: hides the Home entry together with the top-bar cart.
  const { isPosSurfaceHidden } = usePosSurfaceVisibility();

  // Get translations
  const { t } = useLanguage();

  // Create menu items with translations
  const menuItems: MenuItem[] = [
    {
      id: "home",
      label: t.home,
      icon: "Home",
      href: "/owner/home",
      roles: ["owner", "manager", "staff"], // All roles can access
    },
    {
      id: "dashboard",
      label: t.dashboard,
      icon: "BarChart3",
      href: "/owner/dashboard",
      roles: ["owner", "manager"], // Only owner and manager
    },
    
    {
      id: "sales",
      label: "Walk-in Sales",
      icon: "TrendingUp",
      roles: ["owner", "manager", "staff"],
      children: [
        {
          id: "transactions",
          label: t.transactions,
          icon: "CreditCard",
          href: "/owner/sales/transactions",
          roles: ["owner", "manager", "staff"],
        },
        {
          id: "reports",
          label: t.reports,
          icon: "FileText",
          href: "/owner/sales/reports",
          roles: ["owner", "manager"], // No staff
        },
        // {
        //   id: "payments",
        //   label: t.payments,
        //   icon: "CreditCard",
        //   href: "/owner/sales/payments",
        //   roles: ["owner", "manager", "staff"],
        // },
      ],
    },
    {
      id: "requests",
      label: "Online Sales",
      icon: "ShoppingCart",
      roles: ["owner", "manager"],
      children: [
        {
          id: "online-orders",
          label: "Online Orders",
          icon: "ShoppingCart",
          href: "/owner/sales/online-orders",
          roles: ["owner", "manager"],
        },
        {
          id: "online-transactions",
          label: "Online Transactions",
          icon: "Wallet",
          href: "/owner/sales/online-transactions",
          roles: ["owner", "manager"],
        },
        {
          id: "cancellation-requests",
          label: "Order Cancellation Requests",
          icon: "XCircle",
          href: "/owner/requests/cancellations",
          roles: ["owner", "manager"],
        },
        {
          id: "refund-requests",
          label: "Return Requests",
          icon: "RotateCcw",
          href: "/owner/requests/refunds",
          roles: ["owner", "manager"],
        },
        {
          id: "pending-refunds",
          label: "Refund Payment",
          icon: "DollarSign",
          href: "/owner/requests/pending-refunds",
          roles: ["owner", "manager"],
        },
        {
          id: "refund-report",
          label: "Online Report",
          icon: "FileText",
          href: "/owner/requests/refund-report",
          roles: ["owner", "manager"],
        },
      ],
    },
    {
      id: "stocks",
      label: t.inventory,
      icon: "Package",
      href: "/owner/inventory/stocks",
      roles: ["owner", "manager"],
    },
    {
      id: "customers",
      label: t.customers,
      icon: "Users",
      href: "/owner/inventory/customers",
      roles: ["owner", "manager", "staff"],
    },
    {
      id: "promotion-membership",
      label: "Promotion & Membership",
      icon: "Gift",
      roles: ["owner", "manager"],
      children: [
        {
          id: "membership",
          label: "Membership",
          icon: "Gift",
          href: "/owner/membership",
          roles: ["owner", "manager"],
        },
        {
          id: "online-promotions",
          label: "Online Promotions",
          icon: "Tag",
          href: "/owner/online-promotions",
          roles: ["owner", "manager"],
        },
      ],
    },
    {
      id: "expenses",
      label: t.expenses,
      icon: "Receipt",
      href: "/owner/expenses",
      roles: ["owner", "manager"], // Only owner and manager
    },
    // {
    //   id: "barcode",
    //   label: t.barcode,
    //   icon: "QrCode",
    //   roles: ["owner", "manager"],
    //   children: [
    //     {
    //       id: "label-print",
    //       label: t.labelPrint,
    //       icon: "Tag",
    //       href: "/owner/barcode/label-print",
    //       roles: ["owner", "manager"],
    //     },
    //     {
    //       id: "print-settings",
    //       label: t.printSettings,
    //       icon: "Settings",
    //       href: "/owner/barcode/print-settings",
    //       roles: ["owner", "manager"],
    //     },
    //   ],
    // },
    {
      id: "shops-branches",
      label: t.shopsBranches,
      icon: "Building2",
      roles: ["owner"], // Only owner
      children: [
        {
          id: "manage-shops",
          label: t.manageShops,
          icon: "Store",
          href: "/owner/shops/manage",
          roles: ["owner"],
        },
        {
          id: "shop-reports",
          label: t.shopReports,
          icon: "FileText",
          href: "/owner/shops/reports",
          roles: ["owner"],
        },
      ],
    },
    {
      id: "staff",
      label: t.staff,
      icon: "UserCheck",
      href: "/owner/staff",
      roles: ["owner"], // Only owner can manage staff
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "AlertCircle",
      href: "/owner/notifications",
      roles: ["owner", "manager", "staff"], // All roles can access
    },
    {
      id: "settings",
      label: t.settings,
      icon: "Settings",
      href: "/owner/settings",
      roles: ["owner", "manager", "staff"], // All roles can access
    },
  ];

  // Filter menu items based on user role
  const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .filter((item) => {
        // If roles array exists, check if user role is included
        if (item.roles && !item.roles.includes(userRole)) {
          return false;
        }
        // Owner preference: hide the walk-in POS entry point. Paired with the
        // top-bar cart via usePosSurfaceVisibility so both vanish together.
        if (item.id === "home" && isPosSurfaceHidden) {
          return false;
        }
        return true;
      })
      .map((item) => {
        // If item has children, filter them recursively
        if (item.children && item.children.length > 0) {
          return {
            ...item,
            children: filterMenuItems(item.children),
          };
        }
        return item;
      })
      .filter((item) => {
        // Remove parent items that have no children after filtering
        if (item.children && item.children.length === 0 && !item.href) {
          return false;
        }
        return true;
      });
  };

  const filteredMenuItems = filterMenuItems(menuItems);

  // Auto-expand parent menus when their child is active
  useEffect(() => {
    const findParentAndExpand = (
      items: MenuItem[],
      targetId: string,
      parentId?: string,
    ): string | null => {
      for (const item of items) {
        if (item.id === targetId) {
          return parentId || null;
        }
        if (item.children && item.children.length > 0) {
          const foundParent = findParentAndExpand(
            item.children,
            targetId,
            item.id,
          );
          if (foundParent) {
            return foundParent;
          }
        }
      }
      return null;
    };

    if (activeItem) {
      const parentId = findParentAndExpand(filteredMenuItems, activeItem);
      if (
        parentId &&
        !expandedItems.includes(parentId) &&
        !manuallyCollapsed.includes(parentId)
      ) {
        setExpandedItems((prev) => [...prev, parentId]);
      }
    }
  }, [activeItem, filteredMenuItems, manuallyCollapsed]);

  // Collapse feature removed; no-op effect removed.

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const isCurrentlyExpanded = prev.includes(itemId);
      if (isCurrentlyExpanded) {
        // User is manually collapsing - track it
        setManuallyCollapsed((collapsed) => [...collapsed, itemId]);
        return prev.filter((id) => id !== itemId);
      } else {
        // User is manually expanding - remove from manually collapsed
        setManuallyCollapsed((collapsed) =>
          collapsed.filter((id) => id !== itemId),
        );
        return [...prev, itemId];
      }
    });
  };

  const renderIcon = (iconName: string, className: string = "") => {
    const IconComponent = iconMap[iconName as keyof typeof iconMap];
    return IconComponent ? <IconComponent className={className} /> : null;
  };

  // Helper function to recursively check if any descendant is active
  const hasActiveDescendant = (item: MenuItem): boolean => {
    if (!item.children || item.children.length === 0) {
      return false;
    }

    const checkChildren = (children: MenuItem[]): boolean => {
      return children.some((child) => {
        if (child.id === activeItem) {
          return true;
        }
        if (child.children && child.children.length > 0) {
          return checkChildren(child.children);
        }
        return false;
      });
    };

    return checkChildren(item.children);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isExpanded = expandedItems.includes(item.id);
    const isActive = activeItem === item.id;
    const hasChildren = item.children && item.children.length > 0;

    // Check if any descendant is active (for parent highlighting)
    const hasActiveChild = hasActiveDescendant(item);

    const isActiveOrHasActiveChild = isActive || hasActiveChild;

    const itemClasses = `
  group flex items-center w-full gap-2.5 text-sm font-medium rounded-lg transition-colors
  px-3 py-2
  ${
    isActiveOrHasActiveChild
      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm hover:from-rose-600 hover:to-pink-600"
      : "text-gray-600 hover:bg-pink-50 hover:text-gray-900"
  }
`;

    const iconClasses = `w-4 h-4 flex-shrink-0 ${
      isActiveOrHasActiveChild
        ? "text-white"
        : "text-gray-400 group-hover:text-gray-600"
    }`;

    const handleMainClick = () => {
      if (item.href) {
        onItemClick?.(item);
      } else if (hasChildren) {
        // Only toggle expand/collapse, don't change active item
        toggleExpanded(item.id);
      }
    };

    return (
      <div key={item.id}>
        {item.href ? (
          <div className="relative">
            <Link
              href={item.href}
              onClick={() => {
                onItemClick?.(item);
                if (item.id === "online-orders") markAsSeen();
                if (item.id === "pending-refunds") markRefundPaymentsSeen();
              }}
              className={itemClasses}
            >
              {renderIcon(item.icon, iconClasses)}
              <span className="flex-1 text-left flex items-center justify-between min-w-0">
                <span className="truncate">{item.label}</span>
                {item.id === "notifications" && unreadNotificationsCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                    {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                  </span>
                )}
                {item.id === "online-orders" && unseenOrdersCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                    {unseenOrdersCount > 99 ? "99+" : unseenOrdersCount}
                  </span>
                )}
                {item.id === "cancellation-requests" && pendingCancellationCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                    {pendingCancellationCount > 99 ? "99+" : pendingCancellationCount}
                  </span>
                )}
                {item.id === "refund-requests" && pendingRefundCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                    {pendingRefundCount > 99 ? "99+" : pendingRefundCount}
                  </span>
                )}
                {/* Unseen rather than total: opening this page acknowledges the
                    notification, even though the payments stay pending. */}
                {item.id === "pending-refunds" && unseenRefundPaymentsCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                    {unseenRefundPaymentsCount > 99 ? "99+" : unseenRefundPaymentsCount}
                  </span>
                )}
              </span>
            </Link>
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleExpanded(item.id);
                }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                  isActiveOrHasActiveChild
                    ? "hover:bg-white/20"
                    : "hover:bg-gray-200"
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        ) : (
          <button onClick={handleMainClick} className={itemClasses}>
            {renderIcon(item.icon, iconClasses)}
            <span className="flex-1 text-left flex items-center justify-between min-w-0">
              <span className="truncate">{item.label}</span>
              {/* Online-order and refund activity belongs to Online Sales.
                  It used to render against item.id "sales" (Walk-in Sales),
                  which has nothing to do with online orders. */}
              {item.id === "requests" && onlineSalesBadgeTotal > 0 && !isExpanded && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                  {onlineSalesBadgeTotal > 99 ? "99+" : onlineSalesBadgeTotal}
                </span>
              )}
            </span>
            {hasChildren && (
              <div className="ml-1 flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </div>
            )}
          </button>
        )}

        {hasChildren && isExpanded && (
          <div className="mt-0.5 mb-1 ml-5 pl-2.5 border-l border-gray-200 space-y-0.5">
            {item.children?.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // If this Sidebar instance is used for mobile overlay and it's not open, render nothing
  if (typeof isMobileOpen !== "undefined" && !isMobileOpen) {
    return null;
  }

  const container = (
    <div
      className={`w-60 bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ${className} flex flex-col`}
    >
      {/* Shop Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          {businessLogo && !logoError ? (
            <img
              src={businessLogo}
              alt="Business Logo"
              className="w-9 h-9 object-contain rounded-lg flex-shrink-0"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Store className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">
              {isLoading ? "Loading..." : businessName || "Business Name"}
            </h1>
            <p className="text-[11px] text-gray-500">Owner Dashboard</p>
          </div>
        </div>
      </div>

      {/* Scrollable Navigation Area */}
      <div
        className="flex-1 overflow-y-auto py-3"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <nav className="px-2 space-y-0.5">
          {filteredMenuItems.map((item) => renderMenuItem(item))}
        </nav>
      </div>
    </div>
  );

  // If this is a mobile instance, render as overlay with backdrop
  if (typeof isMobileOpen !== "undefined") {
    return (
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm"
              onClick={() => onCloseMobile?.()}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed inset-y-0 left-0 z-50 w-60 drop-shadow-2xl"
            >
              {container}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return container;
}

