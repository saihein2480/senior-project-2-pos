"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { MenuItem, NavigationProps } from "@/types/schemas";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";

const menuItems: MenuItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "Home",
    href: "/owner/home",
    roles: ["owner", "manager", "staff"], // All roles can access
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "BarChart3",
    href: "/owner/dashboard",
    roles: ["owner", "manager"], // Only owner and manager
  },
  {
    id: "sales",
    label: "Sales",
    icon: "TrendingUp",
    roles: ["owner", "manager", "staff"],
    children: [
      {
        id: "transactions",
        label: "Transactions",
        icon: "CreditCard",
        href: "/owner/sales/transactions",
        roles: ["owner", "manager", "staff"],
      },
      {
        id: "reports",
        label: "Reports",
        icon: "FileText",
        href: "/owner/sales/reports",
        roles: ["owner", "manager"], // No staff
      },
      {
        id: "payments",
        label: "Payments",
        icon: "CreditCard",
        href: "/owner/sales/payments",
        roles: ["owner", "manager", "staff"],
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "Package",
    roles: ["owner", "manager", "staff"],
    children: [
      {
        id: "stocks",
        label: "Stocks",
        icon: "Package",
        href: "/owner/inventory/stocks",
        roles: ["owner", "manager"],
      },
      {
        id: "customers",
        label: "Customers",
        icon: "Users",
        href: "/owner/inventory/customers",
        roles: ["owner", "manager", "staff"],
      },
    ],
  },
  {
    id: "expenses",
    label: "Expenses",
    icon: "Receipt",
    href: "/owner/expenses",
    roles: ["owner", "manager"], // Only owner and manager
  },
  {
    id: "barcode",
    label: "Barcode",
    icon: "QrCode",
    roles: ["owner", "manager"],
    children: [
      {
        id: "label-print",
        label: "Label Print",
        icon: "Tag",
        href: "/owner/barcode/label-print",
        roles: ["owner", "manager"],
      },
      {
        id: "new-stock",
        label: "New Stock",
        icon: "Plus",
        href: "/owner/barcode/new-stock",
        roles: ["owner", "manager"],
      },
      {
        id: "print-settings",
        label: "Print Settings",
        icon: "Settings",
        href: "/owner/barcode/print-settings",
        roles: ["owner", "manager"],
      },
    ],
  },
  {
    id: "shops-branches",
    label: "Shops & Branches",
    icon: "Building2",
    roles: ["owner"], // Only owner
    children: [
      {
        id: "manage-shops",
        label: "Manage Shops",
        icon: "Store",
        href: "/owner/shops/manage",
        roles: ["owner"],
      },
      {
        id: "shop-reports",
        label: "Shop Reports",
        icon: "FileText",
        href: "/owner/shops/reports",
        roles: ["owner"],
      },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    icon: "UserCheck",
    href: "/owner/staff",
    roles: ["owner"], // Only owner can manage staff
  },
  {
    id: "settings",
    label: "Settings",
    icon: "Settings",
    href: "/owner/settings",
    roles: ["owner", "manager", "staff"], // All roles can access
  },
];

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
};

interface SidebarProps extends NavigationProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isCartModalOpen?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  activeItem,
  onItemClick,
  className = "",
  isCollapsed = false,
  onToggleCollapse,
  isCartModalOpen = false,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [manuallyCollapsed, setManuallyCollapsed] = useState<string[]>([]);
  const [logoError, setLogoError] = useState<boolean>(false);

  // Collapse feature removed — always render expanded sidebar
  const collapsed = false;

  // Use settings context for business name and logo
  const { businessSettings, isLoading } = useSettings();
  const businessName = businessSettings?.businessName;
  const businessLogo = businessSettings?.businessLogo;

  // Get user role from auth context
  const { user } = useAuth();
  const userRole = user?.role || "staff"; // Default to staff if no role

  // Filter menu items based on user role
  const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .filter((item) => {
        // If roles array exists, check if user role is included
        if (item.roles && !item.roles.includes(userRole)) {
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
      flex items-center w-full text-sm text-gray-700 hover:bg-gray-100 transition-colors
      px-3 py-2
      ${
        isActiveOrHasActiveChild
          ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
          : ""
      }
      ${level > 0 ? "pl-8" : ""}
    `;

    const iconClasses = `w-4 h-4 mr-3 flex-shrink-0 ${
      isActiveOrHasActiveChild ? "text-blue-700" : ""
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
              onClick={() => onItemClick?.(item)}
              className={itemClasses}
            >
              {renderIcon(item.icon, iconClasses)}
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleExpanded(item.id);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
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
            <span className="flex-1 text-left">{item.label}</span>
            {hasChildren && (
              <div className="ml-2">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </div>
            )}
          </button>
        )}

        {hasChildren && isExpanded && (
          <div className="bg-gray-50">
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
      className={`w-64 bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ${className} flex flex-col`}
    >
      {/* Shop Header */}
      <div className="px-4 py-7 border-b border-gray-200 flex-shrink-0">
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-2">
            {businessLogo && !logoError ? (
              <img
                src={businessLogo}
                alt="Business Logo"
                className="w-10 h-10 object-contain rounded"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Store className="w-10 h-10 text-purple-600" />
            )}
          </div>
        ) : (
          <div className="flex items-center">
            {businessLogo && !logoError ? (
              <img
                src={businessLogo}
                alt="Business Logo"
                className="w-12 h-12 object-contain rounded mr-3"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Store className="w-12 h-12 text-purple-600 mr-3" />
            )}
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">
                {isLoading ? "Loading..." : businessName || "Business Name"}
              </h1>
              <p className="text-xs text-gray-500">Owner Dashboard</p>
            </div>
          </div>
        )}
      </div>

      {/* Collapse button removed — sidebar always expanded */}

      {/* Scrollable Navigation Area */}
      <div
        className="flex-1 overflow-y-auto py-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <nav className="space-y-1">
          {filteredMenuItems.map((item) => renderMenuItem(item))}
        </nav>
      </div>
    </div>
  );

  // If this is a mobile instance, render as overlay with backdrop
  if (typeof isMobileOpen !== "undefined") {
    return (
      <>
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-40"
          onClick={() => onCloseMobile?.()}
        />
        <div
          className={`fixed inset-y-0 left-0 z-50 transform transition-transform ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {container}
        </div>
      </>
    );
  }

  return container;
}
