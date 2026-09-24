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
  /**
   * The branch this promotion belongs to: the shop document id, plus its name
   * for display.
   *
   * A product group that is stocked in three branches exists as three separate
   * stock documents, so `productId` already implies a branch. Recording it
   * explicitly means the promotions table can name the branch without loading
   * stocks, and the branch survives even if the stock document is later removed.
   *
   * Absent on promotions created before branch selection was introduced.
   */
  shop?: string;
  branchName?: string;
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
  /** Shop document id of the branch the promoted product belongs to. */
  shop?: string;
  /** Branch name, stored for display alongside `shop`. */
  branchName?: string;
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

    // Every optional field is coalesced to a concrete value: Firestore rejects
    // `undefined`, and `input` is spread wholesale.
    await addDoc(collection(db, COLLECTION_NAME), {
      ...input,
      shop: input.shop || "",
      branchName: input.branchName || "",
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
