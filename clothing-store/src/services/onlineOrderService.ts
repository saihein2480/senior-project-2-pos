import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { StockService } from "@/services/stockService";
import { CustomerNotificationService } from "@/services/customerNotificationService";

/**
 * Online order status -> the customer notification it should trigger.
 *
 * Statuses that are not here (`pending`, `confirmed`) are internal bookkeeping
 * the customer has already been told about at checkout, so they stay silent.
 */
const STATUS_NOTIFICATION: Record<string, string> = {
  packaging: "order_packaging",
  delivering: "order_shipped",
  shipped: "order_shipped",
  delivered: "order_delivered",
};

export interface OnlineOrder {
  id: string;
  orderId: string;
  total?: number;
  amountMmk: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  provider?: string;
  paymentProvider?: string;
  transactionId?: string; // Link to transaction document
  // Financial breakdown
  subtotal?: number;
  tax?: number;
  taxRate?: number; // Percentage applied at checkout (e.g. 7 for 7%)
  discount?: number;
  exchangeRate?: number; // THB -> MMK rate used at checkout
  // Coupon fields
  couponCode?: string;
  appliedCouponCode?: string;
  couponId?: string;
  couponDiscountTHB?: number;
  /**
   * Promotions that reduced this order, named.
   *
   * Recorded with the order because promotion documents are edited and
   * deactivated over time, so they cannot be looked up afterwards to explain an
   * old invoice. Absent on orders placed before this was captured.
   */
  appliedPromotions?: Array<{
    promotionId?: string;
    name?: string;
    discountType?: string;
    discountValue?: number;
    discountTHB?: number;
  }>;
  customer?: {
    uid?: string;
    email?: string;
    displayName?: string;
    phone?: string;
    phoneNumber?: string;
    address?: string | Record<string, unknown>;
    shippingAddress?: string | Record<string, unknown>;
  };
  address?: string | Record<string, unknown>;
  shippingAddress?: string | Record<string, unknown>;
  product?: {
    productId?: string;
    productName?: string;
    variantId?: string;
    color?: string;
    size?: string;
    quantity?: number;
    priceTHB?: number;
    originalPriceTHB?: number;
    lineDiscountTHB?: number;
    promotionId?: string;
    promotionName?: string;
  };
  cartItems?: Array<{
    productId?: string;
    productName?: string;
    variantId?: string;
    color?: string;
    size?: string;
    image?: string;
    /** Unit price actually charged, after the winning promotion. */
    priceTHB?: number;
    /** Catalogue unit price before any promotion. */
    originalPriceTHB?: number;
    /** What this line saved. */
    lineDiscountTHB?: number;
    promotionId?: string;
    /** Name of the promotion that won for this line. */
    promotionName?: string;
    quantity?: number;
  }>;
  items?: Array<{
    name: string;
    amount: number;
    quantity: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
  stockDeductedAt?: string;
  stockRestoredAt?: string;
}

export interface OnlineTransaction {
  id: string;
  transactionId: string;
  onlineOrderId?: string;
  source?: string;
  total?: number;
  sellingTotal?: number;
  sellingCurrency?: string;
  paymentProvider?: string;
  paymentMethod?: string;
  status?: string;
  paymentStatus?: string; // Added to match actual data structure
  timestamp?: string;
  exchangeRate?: number;
  customer?: {
    uid?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
    customerType?: string;
  };
  items?: Array<{
    productId?: string;
    stockId?: string;
    groupName?: string;
    selectedColor?: string;
    selectedSize?: string;
    colorCode?: string;
    unitPrice?: number;
    originalPrice?: number;
    quantity?: number;
  }>;
  /**
   * Money breakdown stored at purchase time. These were already being written
   * by the storefront (see api/transactions/create-cod and api/mmpay/webhook)
   * but were missing from this interface, so readers had to cast to `any`.
   */
  subtotal?: number;
  discount?: number;
  tax?: number;
  /** Percentage applied at purchase time, e.g. 7 for 7%. */
  taxRate?: number;
  amountPaid?: number;
  amountMmk?: number;
  couponCode?: string;
  appliedCouponCode?: string;
  couponDiscountTHB?: number;
  branchName?: string;
}

function normalizeDate(input: unknown): string {
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
}

class OnlineOrderService {
  private isCancelledStatus(value: string): boolean {
    return /cancelled|canceled|void/i.test(value || "");
  }

  private buildStockRestorationItems(order: OnlineOrder): Array<{
    stockId: string;
    colorName: string;
    size: string;
    quantity: number;
    variantHint?: string;
  }> {
    if (order.cartItems && order.cartItems.length > 0) {
      const restorations: Array<{
        stockId: string;
        colorName: string;
        size: string;
        quantity: number;
        variantHint?: string;
      }> = [];

      order.cartItems.forEach((item) => {
        const stockId = String(item.productId || "").trim();
        const quantity = Math.max(0, Number(item.quantity || 0));

        if (!stockId || quantity <= 0) return;

        restorations.push({
          stockId,
          colorName: String(item.color || "").trim(),
          size: String(item.size || "").trim(),
          quantity,
          variantHint: String(item.variantId || "").trim() || undefined,
        });
      });

      return restorations;
    }

    const stockId = String(order.product?.productId || "").trim();
    const quantity = Math.max(0, Number(order.product?.quantity || 0));
    if (!stockId || quantity <= 0) return [];

    return [
      {
        stockId,
        colorName: String(order.product?.color || "").trim(),
        size: String(order.product?.size || "").trim(),
        quantity,
        variantHint: String(order.product?.variantId || "").trim() || undefined,
      },
    ];
  }

  private async restoreStockIfNeeded(order: OnlineOrder): Promise<boolean> {
    if (!order.stockDeductedAt || order.stockRestoredAt) {
      return false;
    }

    const restorations = this.buildStockRestorationItems(order);
    if (restorations.length === 0) {
      return false;
    }

    await StockService.restoreMultipleItems(restorations);
    return true;
  }

  async getOnlineOrders(): Promise<OnlineOrder[]> {
    if (!db) return [];

    const q = query(
      collection(db, "onlineOrders"),
      orderBy("updatedAt", "desc"),
    );
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data = d.data() as Omit<OnlineOrder, "id">;
      return {
        id: d.id,
        ...data,
        createdAt: normalizeDate(data.createdAt),
        updatedAt: normalizeDate(data.updatedAt),
      };
    });
  }

  async getOnlineTransactions(): Promise<OnlineTransaction[]> {
    if (!db) return [];

    const q = query(
      collection(db, "transactions"),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<OnlineTransaction, "id">),
      }))
      .filter((tx) => tx.source === "online" || tx.paymentProvider === "MMPAY")
      .map((tx) => ({ ...tx, timestamp: normalizeDate(tx.timestamp || "") }));
  }

  /**
   * Tell the customer their order moved on, by email and Telegram.
   *
   * Best-effort and never throws: the status change is the operation that must
   * succeed, and the owner should not see a failed save because the storefront
   * notification service was unreachable.
   */
  private async notifyStatusChange(
    order: OnlineOrder,
    status: string,
  ): Promise<void> {
    const customerId = order.customer?.uid;
    if (!customerId) return;

    const normalised = (status || "").toLowerCase();
    const type = this.isCancelledStatus(status)
      ? "order_cancelled"
      : STATUS_NOTIFICATION[normalised];

    if (!type) return;

    try {
      await CustomerNotificationService.notifyOrderEvent({
        customerId,
        type,
        order: {
          orderRef: order.orderId || order.id,
          totalAmount: Number(order.total || 0),
          paymentMethod: order.paymentMethod || order.provider || "",
          paymentStatus: order.paymentStatus || "",
          items: (order.items || []).map((item) => ({
            name: item.name,
            quantity: item.quantity,
          })),
        },
      });
    } catch (error) {
      // notifyOrderEvent already swallows its own errors; this guards against
      // anything unexpected while building the payload.
      console.error(
        `Failed to notify customer about order ${order.id} -> ${status}:`,
        error,
      );
    }
  }

  async updateOnlineOrderStatus(
    orderId: string,
    status: string,
  ): Promise<void> {
    if (!db || !orderId || !status) return;

    const orderRef = doc(db, "onlineOrders", orderId);
    const nextStatusIsCancelled = this.isCancelledStatus(status);
    let shouldMarkRestoredAt = false;

    const snap = await getDoc(orderRef);
    if (!snap.exists()) return;

    const current = {
      id: snap.id,
      ...(snap.data() as Omit<OnlineOrder, "id">),
    } as OnlineOrder;

    // Only worth a message when something actually moved; owners re-save the
    // same status often enough that this matters.
    const statusChanged =
      (current.status || "").toLowerCase() !== (status || "").toLowerCase();

    if (nextStatusIsCancelled) {
      shouldMarkRestoredAt = await this.restoreStockIfNeeded(current);
    }

    await updateDoc(orderRef, {
      status,
      updatedAt: new Date().toISOString(),
      ...(shouldMarkRestoredAt
        ? { stockRestoredAt: new Date().toISOString() }
        : {}),
    });

    // If this is a COD order with a linked transaction, update the transaction too
    const isCOD = (current.paymentMethod || "").toLowerCase() === "cod";
    if (isCOD && orderId) {
      try {
        // COD orders use the same ID for both onlineOrder and transaction
        const transactionRef = doc(db, "transactions", orderId);
        const txSnap = await getDoc(transactionRef);
        
        if (txSnap.exists()) {
          // Map online order status to transaction delivery status AND orderStatus
          let deliveryStatus = status;
          if (status === "packaging") deliveryStatus = "confirmed";
          if (status === "delivering") deliveryStatus = "shipped";
          
          await updateDoc(transactionRef, {
            deliveryStatus,
            orderStatus: status, // Add orderStatus field for purchases page
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Failed to update linked COD transaction:", error);
      }
    }

    if (statusChanged) {
      await this.notifyStatusChange({ ...current, status }, status);
    }
  }

  async updateOnlineOrderStatuses(
    orderIds: string[],
    status: string,
  ): Promise<void> {
    if (!db || !orderIds.length || !status) return;
    const firestore = db;

    if (this.isCancelledStatus(status)) {
      for (const orderId of orderIds) {
        await this.updateOnlineOrderStatus(orderId, status);
      }
      return;
    }

    // Read the orders before the write so we can tell which ones actually
    // changed status, and so we have the customer and totals for the messages.
    const before = await Promise.all(
      orderIds.map(async (orderId) => {
        const snap = await getDoc(doc(firestore, "onlineOrders", orderId));
        if (!snap.exists()) return null;
        return {
          id: snap.id,
          ...(snap.data() as Omit<OnlineOrder, "id">),
        } as OnlineOrder;
      }),
    );

    const batch = writeBatch(firestore);
    const updatedAt = new Date().toISOString();

    orderIds.forEach((orderId) => {
      batch.update(doc(firestore, "onlineOrders", orderId), {
        status,
        updatedAt,
      });
    });

    await batch.commit();

    for (const order of before) {
      if (!order) continue;
      if ((order.status || "").toLowerCase() === (status || "").toLowerCase()) {
        continue;
      }
      await this.notifyStatusChange({ ...order, status }, status);
    }
  }

  async updateOnlineOrderPaymentStatus(
    orderId: string,
    paymentStatus: string,
  ): Promise<void> {
    if (!db) throw new Error("Database not initialized");

    const ref = doc(db, "onlineOrders", orderId);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) throw new Error("Order not found");
    
    const order = snap.data() as Omit<OnlineOrder, "id">;
    
    await updateDoc(ref, {
      paymentStatus,
      updatedAt: new Date().toISOString(),
    });

    // If this is a COD order, update the transaction status too
    const isCOD = (order.paymentMethod || "").toLowerCase() === "cod";
    if (isCOD && orderId) {
      try {
        // Query transactions collection to find the transaction with matching onlineOrderId
        const transactionsRef = collection(db, "transactions");
        const q = query(transactionsRef, where("onlineOrderId", "==", orderId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          // Update the first matching transaction (should only be one)
          const transactionDoc = querySnapshot.docs[0];
          const txStatus = paymentStatus === "SUCCESS" ? "completed" : "pending";
          
          await updateDoc(doc(db, "transactions", transactionDoc.id), {
            status: txStatus,
            paymentStatus, // Also add paymentStatus field
            updatedAt: new Date().toISOString(),
          });
          
          console.log(`Updated COD transaction ${transactionDoc.id} payment status to ${paymentStatus}`);
        } else {
          console.warn(`No transaction found with onlineOrderId: ${orderId}`);
        }
      } catch (error) {
        console.error("Failed to update linked COD transaction payment status:", error);
      }
    }
  }
}

export const onlineOrderService = new OnlineOrderService();
