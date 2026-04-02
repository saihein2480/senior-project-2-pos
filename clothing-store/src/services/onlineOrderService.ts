import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { StockService } from "@/services/stockService";

export interface OnlineOrder {
  id: string;
  orderId: string;
  amountMmk: number;
  status: string;
  paymentStatus: string;
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
      return order.cartItems
        .map((item) => {
          const stockId = String(item.productId || "").trim();
          const quantity = Math.max(0, Number(item.quantity || 0));

          if (!stockId || quantity <= 0) return null;

          return {
            stockId,
            colorName: String(item.color || "").trim(),
            size: String(item.size || "").trim(),
            quantity,
            variantHint: String(item.variantId || "").trim() || undefined,
          };
        })
        .filter(
          (
            item,
          ): item is {
            stockId: string;
            colorName: string;
            size: string;
            quantity: number;
            variantHint?: string;
          } => !!item,
        );
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

    if (nextStatusIsCancelled) {
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const current = {
          id: snap.id,
          ...(snap.data() as Omit<OnlineOrder, "id">),
        } as OnlineOrder;
        shouldMarkRestoredAt = await this.restoreStockIfNeeded(current);
      }
    }

    await updateDoc(orderRef, {
      status,
      updatedAt: new Date().toISOString(),
      ...(shouldMarkRestoredAt
        ? { stockRestoredAt: new Date().toISOString() }
        : {}),
    });
  }

  async updateOnlineOrderStatuses(
    orderIds: string[],
    status: string,
  ): Promise<void> {
    if (!db || !orderIds.length || !status) return;

    if (this.isCancelledStatus(status)) {
      for (const orderId of orderIds) {
        await this.updateOnlineOrderStatus(orderId, status);
      }
      return;
    }

    const batch = writeBatch(db);
    const updatedAt = new Date().toISOString();

    orderIds.forEach((orderId) => {
      batch.update(doc(db, "onlineOrders", orderId), {
        status,
        updatedAt,
      });
    });

    await batch.commit();
  }
}

export const onlineOrderService = new OnlineOrderService();
