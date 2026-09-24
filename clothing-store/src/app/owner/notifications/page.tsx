"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNavBar } from "@/components/ui/TopNavBar";
import { Bell, ShoppingCart, AlertCircle, RotateCcw, XCircle, Package, Check, Clock, Trash2, DollarSign } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "online_order" | "cancellation_request" | "refund_request" | "refund_payment" | "low_stock" | "out_of_stock";
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  link?: string;
  metadata?: {
    orderId?: string;
    transactionId?: string;
    productName?: string;
    stockLevel?: number;
  };
}

function NotificationsContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [activeItem, setActiveItem] = useState("notifications");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

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

  // Listen to real-time notifications
  useEffect(() => {
    if (!db) return;

    const notificationsRef = collection(db, "notifications");
    const q = query(
      notificationsRef,
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Skip customer-facing notifications (they carry a userId and
        // types this owner UI doesn't recognize/route).
        if (data.userId || !OWNER_NOTIFICATION_TYPES.has(data.type)) return;
        notifs.push({
          id: doc.id,
          type: data.type,
          title: data.title,
          message: data.message,
          read: data.read || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          link: data.link,
          metadata: data.metadata,
        });
      });
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const markAsRead = async (notificationId: string) => {
    if (!db) return;
    try {
      const notifRef = doc(db as any, "notifications", notificationId);
      await updateDoc(notifRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!db) return;
    try {
      const unreadNotifs = notifications.filter((n) => !n.read);
      const promises = unreadNotifs.map((n) =>
        updateDoc(doc(db as any, "notifications", n.id), { read: true })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db as any, "notifications", notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const clearAllRead = async () => {
    if (!db) return;
    try {
      const readNotifs = notifications.filter((n) => n.read);
      const promises = readNotifs.map((n) =>
        deleteDoc(doc(db as any, "notifications", n.id))
      );
      await Promise.all(promises);
    } catch (error) {
      console.error("Error clearing read notifications:", error);
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "online_order":
        return <ShoppingCart className="w-5 h-5 text-blue-600" />;
      case "cancellation_request":
        return <XCircle className="w-5 h-5 text-orange-600" />;
      case "refund_request":
        return <RotateCcw className="w-5 h-5 text-purple-600" />;
      case "refund_payment":
        return <DollarSign className="w-5 h-5 text-green-600" />;
      case "low_stock":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "out_of_stock":
        return <Package className="w-5 h-5 text-red-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getNotificationBgColor = (type: Notification["type"]) => {
    switch (type) {
      case "online_order":
        return "bg-blue-50 border-blue-200";
      case "cancellation_request":
        return "bg-orange-50 border-orange-200";
      case "refund_request":
        return "bg-purple-50 border-purple-200";
      case "refund_payment":
        return "bg-green-50 border-green-200";
      case "low_stock":
        return "bg-yellow-50 border-yellow-200";
      case "out_of_stock":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const filteredNotifications = notifications.filter((n) =>
    filter === "all" ? true : !n.read
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => setActiveItem(item.id)}
          isCartModalOpen={isCartModalOpen}
        />
      </div>

      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <Sidebar
          activeItem={activeItem}
          onItemClick={(item) => {
            setActiveItem(item.id);
            setIsMobileSidebarOpen(false);
          }}
          isCartModalOpen={isCartModalOpen}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavBar
          onCartModalStateChange={setIsCartModalOpen}
          onMenuToggle={() => setIsMobileSidebarOpen((s) => !s)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-screen-2xl mx-auto">
            {/* Page Title */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                {t.notifications}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t.notificationsSubtitle}
              </p>
            </div>

            {/* Action Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFilter("all")}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      filter === "all"
                        ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t.all} ({notifications.length})
                  </button>
                  <button
                    onClick={() => setFilter("unread")}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      filter === "unread"
                        ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t.unread} ({unreadCount})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                    >
                      <Check className="w-4 h-4" />
                      {t.markAllAsRead}
                    </button>
                  )}
                  {notifications.filter((n) => n.read).length > 0 && (
                    <button
                      onClick={clearAllRead}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t.clearRead}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications List */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {filter === "unread" ? t.noUnreadNotifications : t.noNotificationsYet}
                </h3>
                <p className="text-sm text-gray-600">
                  {filter === "unread"
                    ? t.allCaughtUp
                    : t.notificationsWillAppearHere}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      console.log("Notification clicked:", notification); // Debug log
                      if (!notification.read) {
                        markAsRead(notification.id);
                      }
                      const link = notification.link || getDefaultLink(notification.type);
                      console.log("Navigating to:", link); // Debug log
                      window.location.href = link;
                    }}
                    className={`rounded-2xl border-2 p-4 transition-all hover:shadow-md cursor-pointer ${
                      notification.read
                        ? "bg-white border-gray-200"
                        : `${getNotificationBgColor(notification.type)} border-2`
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${notification.read ? "bg-gray-100" : "bg-white"}`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                              {notification.title}
                            </h3>
                            <p className="text-sm text-gray-600 mb-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>
                                {formatDistanceToNow(notification.createdAt, {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title={t.markAsRead}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t.delete}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationsContent />
    </ProtectedRoute>
  );
}
