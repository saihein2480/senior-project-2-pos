"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePosSurfaceVisibility } from "@/hooks/usePosSurfaceVisibility";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { type BranchRef, NO_BRANCH_NAME } from "@/lib/branch";
import { OPEN_POS_CART_EVENT } from "@/lib/posCartEvents";
import { toast } from "react-hot-toast";
import { RoleViewSwitcher } from "./RoleViewSwitcher";
import {
  LogOut,
  ChevronDown,
  ShoppingCart,
  Store,
  Menu,
  Bell,
  Clock,
  Check,
  XCircle,
  RotateCcw,
  AlertCircle,
  Package,
  DollarSign,
} from "lucide-react";
import { ShoppingCartModal } from "./ShoppingCartModal";
import {
  OWNER_NOTIFICATION_TYPES,
  useOwnerNotificationBadge,
  type OwnerNotificationType,
} from "@/hooks/useOwnerNotifications";

interface TopNavBarProps {
  onCartModalStateChange?: (isOpen: boolean) => void;
  onMenuToggle?: () => void;
}

/**
 * Live time and date for the till.
 *
 * Rendered only after mount: the server's clock (and time zone) would not
 * match the browser's, which would otherwise trip a hydration mismatch.
 */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return <div className="h-10 w-40" aria-hidden="true" />;

  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
        <Clock className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-gray-900 tabular">{time}</p>
        <p className="text-xs text-gray-500 whitespace-nowrap">{date}</p>
      </div>
    </div>
  );
}

/** Two-to-three option switch; one tap instead of opening a menu. */
function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  fullWidth = false,
}: {
  label: string;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`items-center rounded-xl bg-gray-100 p-1 ${
        fullWidth ? "flex w-full" : "inline-flex"
      }`}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              fullWidth ? "flex-1" : ""
            } ${
              isActive
                ? "bg-white text-rose-600 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TopNavBar({
  onCartModalStateChange,
  onMenuToggle,
}: TopNavBarProps) {
  const { user, logout } = useAuth();
  // Paired with the Home menu entry in the Sidebar - one owner setting drives both.
  const { isPosSurfaceVisible } = usePosSurfaceVisibility();
  const { getCartItemCount } = useCart();
  const { selectedCurrency, setSelectedCurrency } = useCurrency();
  const {
    branch: currentBranch,
    branches: shops,
    branchesLoaded,
    selectBranch,
  } = useSettings();
  const isLoadingShops = !branchesLoaded;
  const { language, setLanguage, t } = useLanguage();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Bell badge. Opening the bell acknowledges everything currently unread, so
   * the count resets and stays reset as the user moves between pages.
   */
  const { unseenCount, markAllSeen } = useOwnerNotificationBadge(
    user?.uid || user?.email || undefined,
  );

  // Get view mode context for role switching
  const { viewAsRole, setViewAsRole } = useViewMode();

  const languageOptions = [
    { value: "en" as const, label: "EN", title: "English" },
    { value: "my" as const, label: "မြန်မာ", title: "Burmese" },
  ];

  const currencyOptions = [
    { value: "MMK" as const, label: "Ks MMK", title: "Myanmar Kyat" },
    { value: "THB" as const, label: "฿ THB", title: "Thai Baht" },
  ];

  const handleCurrencyChange = (currency: "THB" | "MMK") => {
    setSelectedCurrency(currency);
  };

  const openCart = () => {
    setIsCartModalOpen(true);
    onCartModalStateChange?.(true);
  };

  // Other parts of the page (the POS terminal's order panel) open this one
  // checkout instance instead of mounting their own.
  useEffect(() => {
    const handleOpenRequest = () => {
      setIsCartModalOpen(true);
      onCartModalStateChange?.(true);
    };
    window.addEventListener(OPEN_POS_CART_EVENT, handleOpenRequest);
    return () =>
      window.removeEventListener(OPEN_POS_CART_EVENT, handleOpenRequest);
  }, [onCartModalStateChange]);

  /**
   * Switch the working branch.
   *
   * The settings context applies the change locally and every screen listening
   * to it re-filters straight away, so there is no page reload here. It used to
   * call `router.refresh()`, which reloaded the whole route and still left
   * anything reading cached settings a step behind.
   *
   * Doc: "Branch Selection" is available to all roles. It only ever changes
   * this user's own working branch (stored per user, by shop id); the
   * business-wide default is changed separately by the owner in Settings.
   * The branch list comes live from the settings context (oldest first), so
   * renames and new branches appear without a reload.
   */
  const handleBranchChange = (branch: BranchRef) => {
    if (!user?.uid && !user?.email) {
      toast.error(t.userNotAuthenticated, {
        duration: 2000,
        position: "top-right",
      });
      return;
    }

    selectBranch(branch);
    setIsBranchDropdownOpen(false);

    // Branch name leads so the sentence reads naturally in both languages.
    toast.success(`${branch.name} ${t.branchSelected}`, {
      duration: 2000,
      position: "top-right",
    });
  };

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

  const branchLabel =
    currentBranch.name === NO_BRANCH_NAME ? t.noBranch : currentBranch.name;

  // Display only (who is signed in); access is gated elsewhere.
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

  const cartCount = getCartItemCount();

  // The sticky bar sits at z-30: above in-page content such as product card
  // badges (z-10/z-20), but below the mobile sidebar overlay (z-40) and drawer
  // (z-50) so those can still cover it.
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200/80">
      <div className="h-16 px-3 sm:px-5 flex items-center justify-between gap-3">
        {/* Left: menu, clock, branch */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onMenuToggle?.()}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 lg:hidden flex-shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden md:block">
            <LiveClock />
          </div>

          <span className="hidden md:block h-8 w-px bg-gray-200" aria-hidden="true" />

          {/* Branch Selector */}
          <div className="relative min-w-0" ref={branchDropdownRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsBranchDropdownOpen(!isBranchDropdownOpen);
              }}
              aria-haspopup="menu"
              aria-expanded={isBranchDropdownOpen}
              className="flex items-center gap-2 h-10 pl-2 pr-2.5 max-w-full bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 transition-colors"
              title={t.clickToChangeBranch}
            >
              <span className="h-7 w-7 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                <Store className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-gray-900 truncate max-w-[88px] sm:max-w-[160px]">
                {branchLabel}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                  isBranchDropdownOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {isBranchDropdownOpen && (
              <div
                role="menu"
                aria-orientation="vertical"
                className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-[9999]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {t.branch}
                </p>
                {isLoadingShops ? (
                  <div className="px-3 py-3 text-sm text-gray-500 text-center">
                    {t.loadingBranches}
                  </div>
                ) : shops.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-500 text-center">
                    {t.noBranchesAvailable}
                  </div>
                ) : (
                  shops.map((shop) => {
                    const isSelected = currentBranch.id === shop.id;
                    return (
                      <button
                        key={shop.id}
                        role="menuitem"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleBranchChange(shop);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm rounded-xl transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-rose-50 text-rose-700 font-semibold"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Store
                            className={`w-4 h-4 flex-shrink-0 ${
                              isSelected ? "text-rose-500" : "text-gray-400"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{shop.name}</span>
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-rose-600 flex-shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: preferences, cart, notifications, profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          <div className="hidden lg:block">
            <SegmentedControl
              label={t.currency}
              options={currencyOptions}
              value={selectedCurrency as "THB" | "MMK"}
              onChange={handleCurrencyChange}
            />
          </div>

          <div className="hidden xl:block">
            <SegmentedControl
              label={t.language}
              options={languageOptions}
              value={language}
              onChange={setLanguage}
            />
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
              className="relative inline-flex h-10 items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-3 text-white shadow-brand transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
              aria-label={`Shopping cart, ${cartCount} item(s)`}
              onClick={openCart}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline text-sm font-semibold">
                {t.cartLabel}
              </span>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-rose-600 tabular">
                {cartCount}
              </span>
            </button>
          )}

          {/* Notifications */}
          <div className="relative" ref={notificationDropdownRef}>
            <button
              type="button"
              onClick={() => {
                const opening = !showNotificationDropdown;
                setShowNotificationDropdown(opening);
                // Clear the badge on open only, so closing the dropdown
                // cannot re-acknowledge anything that arrived while it was up.
                if (opening) markAllSeen();
              }}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 ${
                showNotificationDropdown
                  ? "bg-rose-50 text-rose-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
              aria-label={
                unseenCount > 0
                  ? `${t.notifications} (${unseenCount})`
                  : t.notifications
              }
              aria-haspopup="menu"
              aria-expanded={showNotificationDropdown}
            >
              <Bell className="h-5 w-5" />
              {unseenCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white tabular">
                  {unseenCount > 99 ? "99+" : unseenCount}
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
              type="button"
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-2 rounded-xl p-1 pr-1 xl:pr-2 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              aria-label="User menu"
              aria-haspopup="menu"
              aria-expanded={isProfileDropdownOpen}
            >
              <span className="h-8 w-8 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                {initials}
              </span>
              <span className="hidden xl:block text-left leading-tight max-w-[120px]">
                <span className="block text-sm font-semibold text-gray-900 truncate">
                  {displayName}
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden xl:block w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>

            {/* Dropdown Menu */}
            {isProfileDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
              >
                <div className="px-4 py-3.5 bg-brand-soft border-b border-rose-100 flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user?.displayName || "User"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    <span className="mt-1 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                      {roleLabel}
                    </span>
                  </div>
                </div>

                {/* Preferences that don't fit in the bar on smaller screens */}
                <div className="xl:hidden p-3 space-y-3 border-b border-gray-100">
                  <div className="lg:hidden">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {t.currency}
                    </p>
                    <SegmentedControl
                      label={t.currency}
                      options={currencyOptions}
                      value={selectedCurrency as "THB" | "MMK"}
                      onChange={handleCurrencyChange}
                      fullWidth
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {t.language}
                    </p>
                    <SegmentedControl
                      label={t.language}
                      options={languageOptions}
                      value={language}
                      onChange={setLanguage}
                      fullWidth
                    />
                  </div>
                </div>

                <div className="p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 rounded-xl hover:bg-rose-50 hover:text-rose-700 transition-colors"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t.logout}
                  </button>
                </div>
              </div>
            )}
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
  type: OwnerNotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  link?: string;
}

function NotificationDropdown({ onClose, triggerRef }: NotificationDropdownProps) {
  const { t } = useLanguage();
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
        return <ShoppingCart className="w-4 h-4 text-rose-600" />;
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
    
    if (seconds < 60) return t.justNow;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}${t.minutesAgo}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}${t.hoursAgo}`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}${t.daysAgo}`;
    return date.toLocaleDateString();
  };

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className="fixed w-[min(24rem,calc(100vw-1rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ 
        top: `${position.top}px`, 
        right: `${position.right}px`,
        zIndex: 999999
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
            <Bell className="w-4 h-4" aria-hidden="true" />
          </span>
          <h3 className="text-gray-900 font-semibold text-base">{t.notifications}</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            window.location.href = "/owner/notifications";
          }}
          className="text-rose-600 hover:text-rose-700 text-sm font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer"
        >
          {t.viewAll}
        </button>
      </div>

      {/* Notifications List */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-rose-100 border-t-rose-500"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center">
              <Bell className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm">{t.noNotificationsYet}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                  !notification.read ? "bg-rose-50/50" : ""
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
                        <div className="w-2 h-2 bg-rose-500 rounded-full flex-shrink-0 mt-1"></div>
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
        <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/70">
          <button
            type="button"
            onClick={() => {
              onClose();
              window.location.href = "/owner/notifications";
            }}
            className="text-sm text-rose-600 hover:text-rose-700 font-semibold block text-center w-full cursor-pointer bg-transparent border-none"
          >
            {t.seeAllNotifications} →
          </button>
        </div>
      )}
    </div>
  );

  // Render dropdown using portal to escape z-index stacking context
  return typeof window !== 'undefined' ? createPortal(dropdownContent, document.body) : null;
}
