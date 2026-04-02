import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const COLLECTION_NAME = "online_promotions";

export type PromotionScope = "group" | "variant";
export type PromotionDiscountType = "percentage" | "fixed";

export interface OnlinePromotion {
  id: string;
  name: string;
  description?: string;
  scope: PromotionScope;
  productId: string;
  productName?: string;
  variantId?: string;
  variantName?: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  maxDiscountTHB?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateOnlinePromotionInput {
  name: string;
  description?: string;
  scope: PromotionScope;
  productId: string;
  productName?: string;
  variantId?: string;
  variantName?: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  maxDiscountTHB?: number;
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

class OnlinePromotionService {
  async getPromotions(): Promise<OnlinePromotion[]> {
    if (!db) return [];

    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("updatedAt", "desc"),
    );
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data = d.data() as Omit<OnlinePromotion, "id">;
      return {
        id: d.id,
        ...data,
        createdAt: normalizeDate(data.createdAt),
        updatedAt: normalizeDate(data.updatedAt),
      };
    });
  }

  async createPromotion(input: CreateOnlinePromotionInput): Promise<void> {
    if (!db) return;

    await addDoc(collection(db, COLLECTION_NAME), {
      ...input,
      isActive: input.isActive ?? true,
      startDate: input.startDate || "",
      endDate: input.endDate || "",
      maxDiscountTHB: Number(input.maxDiscountTHB || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async updatePromotion(
    id: string,
    updates: Partial<CreateOnlinePromotionInput> & { isActive?: boolean },
  ): Promise<void> {
    if (!db || !id) return;

    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async togglePromotion(id: string, isActive: boolean): Promise<void> {
    await this.updatePromotion(id, { isActive });
  }

  async deletePromotion(id: string): Promise<void> {
    if (!db || !id) return;
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
}

export const onlinePromotionService = new OnlinePromotionService();
