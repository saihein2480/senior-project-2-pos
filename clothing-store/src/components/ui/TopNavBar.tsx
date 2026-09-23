"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePosSurfaceVisibility } from "@/hooks/usePosSurfaceVisibility";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { ShopService } from "@/services/shopService";
import { toast } from "react-hot-toast";
import { RoleViewSwitcher } from "./RoleViewSwitcher";
import {
  LogOut,
  ChevronDown,
  ShoppingCart,
  Store,
  User,
  Menu,
  Bell,
  Clock,
  Check,
  Trash2,
  XCircle,
  RotateCcw,
  AlertCircle,
  Package,
  DollarSign,
} from "lucide-react";
import { ShoppingCartModal } from "./ShoppingCartModal";
import { useOnlineOrdersNotification } from "@/hooks/useOnlineOrdersNotification";

interface TopNavBarProps {
  onCartModalStateChange?: (isOpen: boolean) => void;
  onMenuToggle?: () => void;
}

export function TopNavBar({
  onCartModalStateChange,
  onMenuToggle,
}: TopNavBarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const permissions = usePermissions();
  // Paired with the Home menu entry in the Sidebar - one owner setting drives both.
  const { isPosSurfaceVisible } = usePosSurfaceVisibility();
  const { getCartItemCount } = useCart();
  const {
    selectedCurrency,
    setSelectedCurrency,
    defaultCurrency,
    getCurrencySymbol,
  } = useCurrency();
  const { businessSettings, refreshSettings } = useSettings();
  const { language, setLanguage, t } = useLanguage();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);

  const { unseenOrdersCount, markAsSeen } = useOnlineOrdersNotification();

  // Get view mode context for role switching
  const { viewAsRole, setViewAsRole, isViewingAsOtherRole } = useViewMode();

  const languages = [
    { name: "English", flag: "🇺🇸", code: "EN", value: "en" as const },
    { name: "Burmese", flag: "🇲🇲", code: "MM", value: "my" as const },
  ];

  const currencies = [
    { code: "MMK", name: "Myanmar Kyat", symbol: "Ks" },
    { code: "THB", name: "Thai Baht", symbol: "฿" },
  ];

  const handleLanguageChange = (langValue: "en" | "my") => {
    setLanguage(langValue);
    setIsLanguageDropdownOpen(false);
  };

  const handleCurrencyChange = (currency: "THB" | "MMK") => {
    setSelectedCurrency(currency);
    setIsCurrencyDropdownOpen(false);
    console.log("Currency changed to:", currency);
  };

  const handleBranchChange = async (branchName: string) => {
    try {
      console.log("User object:", user);
      console.log("User UID:", user?.uid);
      console.log("Attempting to change branch to:", branchName);

      // Use email as fallback identifier if uid is not available
      const userId = user?.uid || user?.email;

      if (!userId) {
        console.error("No user identification available (uid or email)");
        toast.error("User not authenticated", {
          duration: 2,
          position: "top-right",
        });
        return;
      }

      // Save branch selection to localStorage for immediate effect
      const storageKey = `userBranch_${userId}`;
      localStorage.setItem(storageKey, branchName);
      console.log("Saved to localStorage:", storageKey, branchName);

      // Doc: "Branch Selection" is available to all roles, but only a role that
      // can edit business settings persists it to the shared settings document.
      // Staff keep their branch choice local to their own device.
      if (permissions.canEditBusinessSettings) {
        try {
          // Use PATCH endpoint to update only currentBranch without affecting other fields
          const response = await fetch("/api/settings", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ currentBranch: branchName }),
          });

          if (!response.ok) {
            console.error("Failed to save branch to Firebase");
          }
        } catch (error) {
          console.error("Error saving branch to Firebase:", error);
        }
      }

      // Immediately close dropdown
      setIsBranchDropdownOpen(false);
      console.log("Dropdown closed");

      // Refresh settings to reflect the new branch across all pages
      console.log("Refreshing settings...");
      await refreshSettings();
      console.log("Settings refreshed");

      // Force Next.js to refresh the current page to pick up the new branch
      router.refresh();
      console.log("Page refreshed");

      // Show success notification
      toast.success(`Switched to ${branchName}`, {
        duration: 2,
        position: "top-right",
      });
    } catch (error) {
      console.error("Error switching branch:", error);
      toast.error("Failed to switch branch", {
        duration: 2,
        position: "top-right",
      });
    }
  };

  // Load shops on component mount
  useEffect(() => {
    const loadShops = async () => {
      try {
        setIsLoadingShops(true);
        console.log("Loading shops...");
        const shopsData = await ShopService.getAllShops();
        console.log("Shops loaded:", shopsData);
        // Order comes from ShopService.getAllShops (createdAt ascending), so
        // the first branch created stays at the top of the dropdown.
        setShops(shopsData || []);
      } catch (error) {
        console.error("Error loading shops:", error);
        setShops([]);
      } finally {
        setIsLoadingShops(false);
      }
    };

    loadShops();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLanguageDropdownOpen(false);
      }
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCurrencyDropdownOpen(false);
      }
      if (
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBranchDropdownOpen(false);
      }
      // Notification dropdown outside-click handling is managed inside
      // NotificationDropdown itself, since it's rendered via a portal and
      // notificationDropdownRef (which only wraps the bell button) would
      // never "contain" clicks made inside the portaled dropdown content.
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Listen to unread notifications count
  useEffect(() => {
    const fetchUnreadNotifications = async () => {
      try {
        const { collection, query, where, onSnapshot } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        
        if (!db) return;
        
        const notificationsRef = collection(db, "notifications");
        const q = query(
          notificationsRef,
          where("read", "==", false)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          setUnreadNotificationsCount(snapshot.size);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching unread notifications:", error);
      }
    };
    
    fetchUnreadNotifications();
  }, []);

  // The sticky bar sits at z-30: above in-page content such as product card
  // badges (z-10/z-20), but below the mobile sidebar overlay (z-40) and drawer
  // (z-50) so those can still cover it.
  return (
    <header className="sticky top-0 z-30 bg-white shadow-md border-b border-gray-200">
      <div className="px-2 sm:px-4">
        <div className="flex justify-between items-center h-16 px-2 sm:px-4">
          <div className="flex items-center">
            <button
              onClick={() => onMenuToggle?.()}
              className="mr-2 sm:mr-3 p-2 rounded-md hover:bg-gray-100 lg:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6 text-gray-900" />
            </button>

            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 hidden xl:block">
              {user?.displayName || user?.email || "Owner"}
            </h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4 lg:space-x-6">
            {/* Branch Selector */}
            <div className="relative" ref={branchDropdownRef}>
              <button
                onClick={(e) => {
                  console.log(
                    "Branch button clicked, current state:",
                    isBranchDropdownOpen,
                  );
                  e.stopPropagation();
                  setIsBranchDropdownOpen(!isBranchDropdownOpen);
                  console.log("Dropdown toggled to:", !isBranchDropdownOpen);
                }}
                aria-haspopup="menu"
                aria-expanded={isBranchDropdownOpen}
                className="hidden sm:flex items-center space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-50 backdrop-blur-sm border border-gray-200 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all"
                title="Click to change branch"
              >
                <Store className="w-4 h-4 text-gray-900" />
                <span className="text-xs sm:text-sm font-medium text-gray-900 max-w-[80px] sm:max-w-none truncate">
                  {businessSettings?.currentBranch === "No Branch"
                    ? t.noBranch
                    : businessSettings?.currentBranch || t.mainBranch}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-900 transition-transform ${
                    isBranchDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isBranchDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-2xl border border-gray-300 py-1 z-[9999]"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {isLoadingShops ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      Loading branches...
                    </div>
                  ) : shops.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      No branches available
                    </div>
                  ) : (
                    <>
                      {shops.map((shop) => {
                        const isSelected =
                          businessSettings?.currentBranch === shop.name;
                        return (
                          <button
                            key={shop.id}
                            role="menuitem"
                            type="button"
                            onClick={(e) => {
                              console.log("Branch clicked:", shop.name);
                              e.preventDefault();
                              e.stopPropagation();
                              handleBranchChange(shop.name);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-pink-100 text-gray-900 font-medium"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Store className="w-4 h-4" />
                              <span>{shop.name}</span>
                            </div>
                            
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Date Display */}
            <div className="hidden lg:block text-sm text-gray-900 font-medium">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>

            {/* Main Currency Title */}
            {/* <div className="hidden md:flex items-center space-x-1 px-3 py-2 bg-white flex-shrink-0">
              <span className="text-sm text-gray-600 whitespace-nowrap">
                {t.mainCurrency} {getCurrencySymbol(defaultCurrency)}{" "}
                {defaultCurrency}
              </span>
            </div> */}

            {/* Currency Selector (clean pill + simple dropdown) */}
            <div className="relative" ref={currencyDropdownRef}>
              <button
                onClick={() =>
                  setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)
                }
                aria-haspopup="menu"
                aria-expanded={isCurrencyDropdownOpen}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 backdrop-blur-sm border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 rounded-lg transition-all"
              >
                <span className="text-sm font-semibold text-gray-900">
                  {currencies.find((c) => c.code === selectedCurrency)?.symbol}
                </span>
                <span className="text-xs text-gray-900 font-medium">
                  {selectedCurrency}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-900 transition-transform ${
                    isCurrencyDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isCurrencyDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                >
                  {currencies.map((currency) => {
                    const isSelected = selectedCurrency === currency.code;
                    return (
                      <button
                        key={currency.code}
                        role="menuitem"
                        onClick={() =>
                          handleCurrencyChange(currency.code as "THB" | "MMK")
                        }
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "bg-pink-50 text-gray-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{currency.code}</span>
                          <span className="text-xs text-gray-500">
                            {currency.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{currency.symbol}</span>
                          {/* {isSelected && (
                            <span className="text-cyan-600">✓</span>
                          )} */}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Language Selector (compact pill + dropdown) */}
            <div className="relative" ref={languageDropdownRef}>
              <button
                title={t.language}
                onClick={() =>
                  setIsLanguageDropdownOpen(!isLanguageDropdownOpen)
                }
                aria-haspopup="menu"
                aria-expanded={isLanguageDropdownOpen}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 backdrop-blur-sm border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300 rounded-lg transition-all"
              >
                <span className="text-sm font-medium text-gray-900">
                  {languages.find((l) => l.value === language)?.name}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-900 transition-transform ${
                    isLanguageDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isLanguageDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                >
                  {languages.map((lang) => {
                    const isSelected = language === lang.value;
                    return (
                      <button
                        key={lang.code}
                        role="menuitem"
                        onClick={() => handleLanguageChange(lang.value)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "bg-pink-50 text-gray-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{lang.flag}</span>
                          <div className="text-left">
                            <div className="font-medium">{lang.name}</div>
                            <div className="text-xs text-gray-500">
                              {lang.code}
                            </div>
                          </div>
                        </div>
                        {/* {isSelected && <span className="text-cyan-600">✓</span>} */}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Role View Switcher (Owner only) */}
            <RoleViewSwitcher
              currentView={viewAsRole}
              onViewChange={setViewAsRole}
            />

            {/* Shopping Cart. Hidden together with the Home menu entry when the
                owner has turned off the walk-in POS in Settings. */}
            {isPosSurfaceVisible && (
              <button
                type="button"
                className="relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-300 rounded"
                aria-label={`Shopping cart, ${getCartItemCount()} item(s)`}
                onClick={() => {
                  setIsCartModalOpen(true);
                  onCartModalStateChange?.(true);
                }}
              >
                <ShoppingCart className="h-6 w-6 text-gray-900 hover:text-gray-800 transition-colors" />
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                  {getCartItemCount()}
                </span>
              </button>
            )}

            {/* Notifications */}
            <div className="relative" ref={notificationDropdownRef}>
              <button
                onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                className="relative cursor-pointer focus:outline-none flex items-center"
                aria-label="Notifications"
              >
                <Bell className="h-6 w-6 text-gray-900 hover:text-gray-800 transition-colors" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotificationDropdown && (
                <NotificationDropdown 
                  onClose={() => setShowNotificationDropdown(false)} 
                  triggerRef={notificationDropdownRef}
                />
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center space-x-2 focus:outline-none"
                aria-label="User menu"
              >
                <div className="w-11 h-11 rounded-full border-2 border-gray-200 bg-gray-50 flex items-center justify-center text-gray-900">
                  <User className="w-5 h-5" />
                </div>
              </button>

              {/* Dropdown Menu */}
              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.displayName || "User"}
                    </p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shopping Cart Modal */}
      <ShoppingCartModal
        isOpen={isCartModalOpen}
        onClose={() => {
          setIsCartModalOpen(false);
          onCartModalStateChange?.(false);
        }}
      />
    </header>
  );
}



// Notification Dropdown Component
interface NotificationDropdownProps {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
}

interface Notification {
  id: string;
  type: "online_order" | "cancellation_request" | "refund_request" | "refund_payment" | "low_stock" | "out_of_stock";
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  link?: string;
}

// The "notifications" collection is shared with customer-facing
// notifications (written with a `userId` field for the storefront
// account). Only these types are meant for the owner/staff POS UI.
const OWNER_NOTIFICATION_TYPES = new Set<Notification["type"]>([
  "online_order",
  "cancellation_request",
  "refund_request",
  "refund_payment",
  "low_stock",
  "out_of_stock",
]);

function NotificationDropdown({ onClose, triggerRef }: NotificationDropdownProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get default link based on notification type
  const getDefaultLink = (type: Notification["type"]) => {
    switch (type) {
      case "online_order":
        return "/owner/sales/online-orders";
      case "cancellation_request":
        return "/owner/requests/cancellations";
      case "refund_request":
        return "/owner/requests/refunds";
      case "refund_payment":
        return "/owner/requests/pending-refunds";
      case "low_stock":
      case "out_of_stock":
        return "/owner/inventory/stocks";
      default:
        return "/owner/notifications";
    }
  };

  // Calculate position based on trigger element
  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // 8px gap below the button
        right: window.innerWidth - rect.right,
      });
    }
  }, [triggerRef]);

  // Close on outside click / Escape. Handled here (not in TopNavBar) because
  // this dropdown is rendered via a portal into document.body, so it is not
  // a DOM descendant of the bell button's ref.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideDropdown = dropdownRef.current?.contains(target);
      const clickedTrigger = triggerRef.current?.contains(target);
      if (!clickedInsideDropdown && !clickedTrigger) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, triggerRef]);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { collection, query, orderBy, limit, onSnapshot } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        
        if (!db) return;
        
        const notificationsRef = collection(db, "notifications");
        // Fetch extra and filter client-side since customer-facing
        // notifications (with userId) live in the same collection.
        const q = query(
          notificationsRef,
          orderBy("createdAt", "desc"),
          limit(20)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const notifs: Notification[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId || !OWNER_NOTIFICATION_TYPES.has(data.type)) return;
            notifs.push({
              id: doc.id,
              type: data.type,
              title: data.title,
              message: data.message,
              read: data.read || false,
              createdAt: data.createdAt?.toDate() || new Date(),
              link: data.link,
            });
          });
          setNotifications(notifs.slice(0, 5));
          setLoading(false);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching notifications:", error);
        setLoading(false);
      }
    };
    
    fetchNotifications();
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      if (!db) return;
      
      const notifRef = doc(db as any, "notifications", notificationId);
      await updateDoc(notifRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "online_order":
        return <ShoppingCart className="w-4 h-4 text-blue-600" />;
      case "cancellation_request":
        return <XCircle className="w-4 h-4 text-orange-600" />;
      case "refund_request":
        return <RotateCcw className="w-4 h-4 text-purple-600" />;
      case "refund_payment":
        return <DollarSign className="w-4 h-4 text-green-600" />;
      case "low_stock":
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case "out_of_stock":
        return <Package className="w-4 h-4 text-red-600" />;
      default:
        return <Bell className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className="fixed w-96 bg-white rounded-2xl shadow-2xl border-2 border-gray-200 overflow-hidden"
      style={{ 
        top: `${position.top}px`, 
        right: `${position.right}px`,
        zIndex: 999999
      }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 flex items-center justify-between">
        <h3 className="text-white font-semibold text-lg">Notifications</h3>
        <button
          onClick={() => {
            onClose();
            window.location.href = "/owner/notifications";
          }}
          className="text-white text-sm hover:underline cursor-pointer bg-transparent border-none"
        >
          View All
        </button>
      </div>

      {/* Notifications List */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                  !notification.read ? "bg-blue-50" : ""
                }`}
                onClick={() => {
                  if (!notification.read) {
                    markAsRead(notification.id);
                  }
                  const link = notification.link || getDefaultLink(notification.type);
                  onClose();
                  window.location.href = link;
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${!notification.read ? "bg-white" : "bg-gray-100"}`}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900 mb-0.5">
                          {notification.title}
                        </h4>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {getTimeAgo(notification.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <button
            onClick={() => {
              onClose();
              window.location.href = "/owner/notifications";
            }}
            className="text-sm text-pink-600 hover:text-pink-700 font-medium block text-center w-full cursor-pointer bg-transparent border-none"
          >
            See all notifications →
          </button>
        </div>
      )}
    </div>
  );

  // Render dropdown using portal to escape z-index stacking context
  return typeof window !== 'undefined' ? createPortal(dropdownContent, document.body) : null;
}
