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

export interface OnlineOrder {
  id: string;
  orderId: string;
  total?: number;
  amountMmk: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  provider?: string;
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
  };
  cartItems?: Array<{
    productId?: string;
    productName?: string;
    variantId?: string;
    color?: string;
    size?: string;
    image?: string;
    priceTHB?: number;
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
  timestamp?: string;
  exchangeRate?: number;
  customer?: {
    uid?: string;
    displayName?: string;
    email?: string;
  };
  items?: Array<{
    unitPrice?: number;
    originalPrice?: number;
    quantity?: number;
  }>;
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

    const batch = writeBatch(firestore);
    const updatedAt = new Date().toISOString();

    orderIds.forEach((orderId) => {
      batch.update(doc(firestore, "onlineOrders", orderId), {
        status,
        updatedAt,
      });
    });

    await batch.commit();
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
