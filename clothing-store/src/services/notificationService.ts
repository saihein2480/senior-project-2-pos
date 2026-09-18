import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NotificationType = 
  | "online_order" 
  | "cancellation_request" 
  | "refund_request"
  | "refund_payment"
  | "low_stock" 
  | "out_of_stock";

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: {
    orderId?: string;
    transactionId?: string;
    productName?: string;
    stockLevel?: number;
  };
}

export class NotificationService {
  /**
   * Create a new notification
   */
  static async create(params: CreateNotificationParams): Promise<string | null> {
    if (!db) {
      console.error("Firestore is not initialized");
      return null;
    }

    try {
      const notificationsRef = collection(db, "notifications");
      const docRef = await addDoc(notificationsRef, {
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        metadata: params.metadata || null,
        read: false,
        createdAt: Timestamp.now(),
      });

      console.log("Notification created:", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("Error creating notification:", error);
      return null;
    }
  }

  /**
   * Create notification for new online order
   */
  static async notifyNewOrder(orderId: string, customerName: string): Promise<string | null> {
    return this.create({
      type: "online_order",
      title: "New Online Order",
      message: `Order #${orderId} has been placed by ${customerName}`,
      link: "/owner/sales/online-orders",
      metadata: {
        orderId,
      },
    });
  }

  /**
   * Create notification for cancellation request
   */
  static async notifyCancellationRequest(
    transactionId: string,
    orderId: string
  ): Promise<string | null> {
    return this.create({
      type: "cancellation_request",
      title: "Order Cancellation Request",
      message: `Customer requested to cancel order #${orderId}`,
      link: "/owner/requests/cancellations",
      metadata: {
        transactionId,
        orderId,
      },
    });
  }

  /**
   * Create notification for return/refund request
   */
  static async notifyRefundRequest(
    transactionId: string,
    orderId: string
  ): Promise<string | null> {
    return this.create({
      type: "refund_request",
      title: "Return Request",
      message: `Customer requested a return for order #${orderId}`,
      link: "/owner/requests/refunds",
      metadata: {
        transactionId,
        orderId,
      },
    });
  }

  /**
   * Create notification for pending refund payment
   */
  static async notifyRefundPayment(
    transactionId: string,
    orderId: string,
    amount: number
  ): Promise<string | null> {
    return this.create({
      type: "refund_payment",
      title: "Refund Payment Pending",
      message: `Refund of ${amount} MMK pending for order #${orderId}`,
      link: "/owner/requests/pending-refunds",
      metadata: {
        transactionId,
        orderId,
      },
    });
  }

  /**
   * Create notification for low stock
   */
  static async notifyLowStock(
    productName: string,
    stockLevel: number
  ): Promise<string | null> {
    return this.create({
      type: "low_stock",
      title: "Low Stock Alert",
      message: `${productName} is running low (${stockLevel} items left)`,
      link: "/owner/inventory/stocks",
      metadata: {
        productName,
        stockLevel,
      },
    });
  }

  /**
   * Create notification for out of stock
   */
  static async notifyOutOfStock(productName: string): Promise<string | null> {
    return this.create({
      type: "out_of_stock",
      title: "Out of Stock Alert",
      message: `${productName} is now out of stock`,
      link: "/owner/inventory/stocks",
      metadata: {
        productName,
        stockLevel: 0,
      },
    });
  }
}
