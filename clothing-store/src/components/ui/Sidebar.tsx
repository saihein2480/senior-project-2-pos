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
  ShoppingBag,
  History,
  LogOut,
  X,
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
  ShoppingBag,
  History,
};

/**
 * Navigation groups, in display order.
 *
 * Kept as a separate lookup (top-level menu id -> group) instead of nesting
 * the menu items, so the menu definition below - which the RBAC audit parses
 * for ids and roles - stays flat and unchanged in shape. Anything not listed
 * falls into "system".
 */
type NavSectionKey =
  | "pos"
  | "sales"
  | "catalog"
  | "marketing"
  | "business"
  | "system";

const NAV_SECTION_ORDER: NavSectionKey[] = [
  "pos",
  "sales",
  "catalog",
  "marketing",
  "business",
  "system",
];

const NAV_SECTION_OF: Record<string, NavSectionKey> = {
  home: "pos",
  dashboard: "pos",
  sales: "sales",
  requests: "sales",
  stocks: "catalog",
  customers: "catalog",
  "promotion-membership": "marketing",
  expenses: "business",
  "shops-branches": "business",
  staff: "business",
  activity: "business",
  notifications: "system",
  settings: "system",
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
  const { user, logout } = useAuth();
  
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
      // The walk-in selling screen. Same id/route as before ("home"), shown
      // as the POS Terminal so cashiers can always find their way back.
      id: "home",
      label: t.posTerminal,
      icon: "ShoppingBag",
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
          label: "Refund & Return Requests",
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
      id: "activity",
      label: t.activityLog,
      icon: "History",
      href: "/owner/activity",
      roles: ["owner"], // Only owner sees what every account did
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

  /** Count shown on a menu entry, or 0 for none. */
  const badgeCountFor = (id: string): number => {
    switch (id) {
      case "notifications":
        return unreadNotificationsCount;
      case "online-orders":
        return unseenOrdersCount;
      case "cancellation-requests":
        return pendingCancellationCount;
      case "refund-requests":
        return pendingRefundCount;
      // Unseen rather than total: opening this page acknowledges the
      // notification, even though the payments stay pending.
      case "pending-refunds":
        return unseenRefundPaymentsCount;
      default:
        return 0;
    }
  };

  const renderBadge = (count: number) =>
    count > 0 ? (
      <span className="ml-2 inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white tabular">
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isExpanded = expandedItems.includes(item.id);
    const isActive = activeItem === item.id;
    const hasChildren = !!item.children && item.children.length > 0;
    const isChild = level > 0;

    // Check if any descendant is active (for parent highlighting)
    const hasActiveChild = hasActiveDescendant(item);

    // One selection style for every entry, POS Terminal included. Only the
    // current page is tinted, so exactly one item ever reads as "selected".
    let stateClasses: string;
    let iconTone: string;
    if (isActive) {
      stateClasses = "bg-rose-50 text-rose-700 font-semibold";
      iconTone = "text-rose-600";
    } else if (hasActiveChild) {
      stateClasses = "text-gray-900 font-semibold hover:bg-gray-50";
      iconTone = "text-rose-500";
    } else {
      stateClasses = "text-gray-600 hover:bg-gray-50 hover:text-gray-900";
      iconTone = "text-gray-400 group-hover:text-gray-600";
    }

    const itemClasses = `group relative flex items-center w-full gap-3 rounded-xl text-sm font-medium transition-colors ${
      isChild ? "px-3 py-2" : "px-3 py-2.5"
    } ${stateClasses}`;

    const iconClasses = `${isChild ? "w-4 h-4" : "w-[18px] h-[18px]"} flex-shrink-0 transition-colors ${iconTone}`;

    // Slim brand bar marking the current page on top-level entries.
    const activeBar =
      isActive && !isChild ? (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand"
        />
      ) : null;

    const handleMainClick = () => {
      if (item.href) {
        onItemClick?.(item);
      } else if (hasChildren) {
        // Only toggle expand/collapse, don't change active item
        toggleExpanded(item.id);
      }
    };

    const chevron = isExpanded ? (
      <ChevronDown className="w-4 h-4" aria-hidden="true" />
    ) : (
      <ChevronRight className="w-4 h-4" aria-hidden="true" />
    );

    return (
      <div key={item.id}>
        {item.href ? (
          <div className="relative">
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                onItemClick?.(item);
                if (item.id === "online-orders") markAsSeen();
                if (item.id === "pending-refunds") markRefundPaymentsSeen();
              }}
              className={`${itemClasses} ${hasChildren ? "pr-9" : ""}`}
            >
              {activeBar}
              {renderIcon(item.icon, iconClasses)}
              <span className="flex-1 text-left flex items-center justify-between min-w-0">
                <span className="truncate">{item.label}</span>
                {renderBadge(badgeCountFor(item.id))}
              </span>
            </Link>
            {hasChildren && (
              <button
                type="button"
                aria-label={isExpanded ? "Collapse" : "Expand"}
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleExpanded(item.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                {chevron}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleMainClick}
            aria-expanded={hasChildren ? isExpanded : undefined}
            className={itemClasses}
          >
            {activeBar}
            {renderIcon(item.icon, iconClasses)}
            <span className="flex-1 text-left flex items-center justify-between min-w-0">
              <span className="truncate">{item.label}</span>
              {/* Online-order and refund activity belongs to Online Sales.
                  It used to render against item.id "sales" (Walk-in Sales),
                  which has nothing to do with online orders. */}
              {item.id === "requests" &&
                !isExpanded &&
                renderBadge(onlineSalesBadgeTotal)}
            </span>
            {hasChildren && (
              <span className="flex-shrink-0 text-gray-400">{chevron}</span>
            )}
          </button>
        )}

        {hasChildren && isExpanded && (
          <div className="mt-1 mb-1.5 ml-[21px] pl-3 border-l border-gray-100 space-y-0.5">
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

  const isMobileInstance = typeof isMobileOpen !== "undefined";

  // Group the (already role-filtered) top-level entries into sections and
  // drop any section the current role has nothing in.
  const sectionLabels: Record<NavSectionKey, string> = {
    pos: t.navPointOfSale,
    sales: t.sales,
    catalog: t.navCatalog,
    marketing: t.navMarketing,
    business: t.navBusiness,
    system: t.navSystem,
  };
  const navSections = NAV_SECTION_ORDER.map((key) => ({
    key,
    label: sectionLabels[key],
    items: filteredMenuItems.filter(
      (item) => (NAV_SECTION_OF[item.id] ?? "system") === key,
    ),
  })).filter((section) => section.items.length > 0);

  // Signed-in person (their real role, not the previewed one).
  // Display only; menu visibility above is what follows the role.
  const roleLabels: Record<string, string> = {
    owner: t.owner,
    manager: t.manager,
    staff: t.staff_role,
  };
  const roleLabel = roleLabels[user?.role ?? "staff"] ?? t.staff;
  const displayName =
    user?.displayName || user?.email?.split("@")[0] || roleLabel;
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const container = (
    <div
      className={`w-64 bg-white border-r border-gray-200/80 h-screen sticky top-0 transition-all duration-300 ${className} flex flex-col`}
    >
      {/* Shop Header - same height as the top bar so the two line up */}
      <div className="h-16 px-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        {businessLogo && !logoError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={businessLogo}
            alt="Business Logo"
            className="w-10 h-10 object-contain rounded-xl flex-shrink-0 border border-gray-100 bg-white"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center flex-shrink-0 shadow-brand">
            <Store className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">
            {isLoading ? "Loading..." : businessName || "Business Name"}
          </p>
          <p className="text-[11px] font-medium text-rose-500 leading-tight mt-0.5">
            ClothingStore POS
          </p>
        </div>
        {isMobileInstance && (
          <button
            type="button"
            onClick={() => onCloseMobile?.()}
            aria-label="Close menu"
            className="p-2 -mr-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scrollable Navigation Area */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3">
        <nav aria-label="Main" className="space-y-4">
          {navSections.map((section) => (
            <div key={section.key}>
              {/* The POS group needs no heading: it is always first. */}
              {section.key !== "pos" && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => renderMenuItem(item))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Signed-in user */}
      <div className="border-t border-gray-100 p-3 flex-shrink-0">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
          <div
            className="h-9 w-9 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold flex-shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {displayName}
            </p>
            <p className="text-[11px] text-gray-500 truncate">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title={t.logout}
            aria-label={t.logout}
            className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // If this is a mobile instance, render as overlay with backdrop
  if (isMobileInstance) {
    return (
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => onCloseMobile?.()}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 w-64 shadow-2xl"
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
