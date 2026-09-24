import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

const COLLECTION_NAME = "business_settings";
const SETTINGS_DOC_ID = "main"; // Single document for business settings

export type ReceiptPaperSize =
  | "44mm"
  | "57mm"
  | "58mm"
  | "69mm"
  | "76mm"
  | "78mm"
  | "80mm"
  | "82.5mm"
  | "112mm"
  | "114mm"
  | "210mm";

/**
 * A reward tier the owner can offer. Several packages can coexist, e.g.
 * "2 points = 10% off" alongside "10 points = 50% off".
 */
export interface CouponPackage {
  id: string;
  name: string; // Label shown to the owner and the customer
  pointsRequired: number; // Points this package costs; deducted when used
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validityDays: number; // Days until the issued coupon expires
  enabled: boolean;
}

export interface LoyaltySettings {
  enabled: boolean;
  minimumSpendAmount: number; // Minimum spend to earn 1 point
  pointsPerPurchase: number; // Points earned per qualifying purchase (default: 1)
  /** Reward tiers. When empty, the legacy single-coupon fields below are used. */
  couponPackages?: CouponPackage[];
  // Legacy single-coupon configuration. Kept so existing saved settings and
  // already-issued coupons keep working; treated as one implicit package.
  pointsForCoupon: number; // Points needed to get a coupon (default: 10)
  couponDiscountType: 'percentage' | 'fixed'; // Discount type
  couponDiscountValue: number; // Discount value (e.g., 10 for 10% or ฿10)
  couponValidityDays: number; // Days until coupon expires (default: 30)
}

/**
 * Customer-facing store facts.
 *
 * These back the storefront chatbot's answers about location, hours, delivery
 * and policies. Anything left blank is reported to customers as "not on file"
 * rather than guessed, so filling these in is what makes those answers useful.
 */
export interface StoreInfoSettings {
  address?: string;
  phone?: string;
  email?: string;
  openingHours?: string;
  branches?: Array<{
    name: string;
    address?: string;
    phone?: string;
    hours?: string;
  }>;
  deliveryAvailable?: boolean;
  deliveryAreas?: string;
  deliveryFee?: string;
  deliveryTime?: string;
  codAvailable?: boolean;
  codMaxAmount?: number;
  paymentMethods?: string[];
  returnPolicy?: string;
  exchangePolicy?: string;
  cancellationPolicy?: string;
}

export const LEGACY_COUPON_PACKAGE_ID = "legacy-default";

/**
 * Normalise loyalty settings into a list of usable reward tiers.
 *
 * Owners who never configured packages still have the four legacy fields, so
 * those are surfaced as a single implicit package. Returned sorted by cost so
 * callers can reason about "cheapest" and "best" tiers.
 */
export function resolveCouponPackages(
  loyaltySettings?: LoyaltySettings | null,
): CouponPackage[] {
  if (!loyaltySettings) return [];

  const configured = (loyaltySettings.couponPackages || []).filter(
    (pkg) => pkg && pkg.enabled !== false && Number(pkg.pointsRequired) > 0,
  );

  if (configured.length > 0) {
    return [...configured].sort(
      (a, b) => Number(a.pointsRequired) - Number(b.pointsRequired),
    );
  }

  if (Number(loyaltySettings.pointsForCoupon) > 0) {
    return [
      {
        id: LEGACY_COUPON_PACKAGE_ID,
        name: "Reward Coupon",
        pointsRequired: Number(loyaltySettings.pointsForCoupon),
        discountType: loyaltySettings.couponDiscountType || "percentage",
        discountValue: Number(loyaltySettings.couponDiscountValue) || 0,
        validityDays: Number(loyaltySettings.couponValidityDays) || 30,
        enabled: true,
      },
    ];
  }

  return [];
}

export interface BusinessSettings {
  businessName: string;
  shortName: string;
  defaultCurrency: string;
  taxRate: number;
  registeredBy: string;
  registeredAt: string;
  businessLogo: string;
  showBusinessLogoOnInvoice: boolean;
  autoPrintReceiptAfterCheckout: boolean;
  invoiceFooterMessage: string;
  invoiceFooterImage: string;
  receiptPaperSize: ReceiptPaperSize;
  enableDarkMode: boolean;
  enableSoundEffects: boolean;
  currencyRate: number;
  currentBranch?: string;
  /**
   * Owner workspace preference. When true, the walk-in POS surface is hidden
   * from the OWNER's interface only: the Home entry in the side menu and the
   * cart button in the top bar disappear together, since a cart with no way to
   * reach the product grid is useless.
   *
   * Managers and staff are never affected - they always keep Home and the cart.
   * See usePosSurfaceVisibility().
   */
  hidePosForOwner?: boolean;
  labelSettings?: {
    labelWidth: number;
    labelHeight: number;
    labelGap: number;
    standard: string;
    gs1CompanyPrefix: string;
    autoSequence: number;
    showCompany: boolean;
    showDates: boolean;
    showPrice: boolean;
  };
  loyaltySettings?: LoyaltySettings;
  storeInfo?: StoreInfoSettings;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurrencyInfo {
  code: "THB" | "MMK";
  name: string;
  symbol: string;
}

/**
 * Shape a raw settings document into `BusinessSettings`.
 *
 * Extracted so the one-shot read and the live subscription below cannot drift:
 * a field defaulted in one and not the other would make the same settings look
 * different depending on how they were loaded.
 */
function mapSettingsDoc(data: Record<string, any>): BusinessSettings {
  return {
    businessName: data.businessName || "",
    shortName: data.shortName || "",
    defaultCurrency: data.defaultCurrency || "THB",
    taxRate: data.taxRate || 0,
    registeredBy: data.registeredBy || "",
    registeredAt: data.registeredAt || "",
    businessLogo: data.businessLogo || "",
    showBusinessLogoOnInvoice: data.showBusinessLogoOnInvoice ?? true,
    autoPrintReceiptAfterCheckout: data.autoPrintReceiptAfterCheckout ?? true,
    invoiceFooterMessage: data.invoiceFooterMessage || "",
    invoiceFooterImage: data.invoiceFooterImage || "",
    receiptPaperSize: data.receiptPaperSize || "80mm",
    enableDarkMode: data.enableDarkMode ?? false,
    enableSoundEffects: data.enableSoundEffects ?? false,
    currencyRate: data.currencyRate || 0,
    currentBranch: data.currentBranch || "Main Branch",
    hidePosForOwner: data.hidePosForOwner ?? false,
    labelSettings: data.labelSettings,
    storeInfo: data.storeInfo || {},
    loyaltySettings: data.loyaltySettings || {
      enabled: false,
      minimumSpendAmount: 500,
      pointsPerPurchase: 1,
      couponPackages: [],
      pointsForCoupon: 10,
      couponDiscountType: "percentage",
      couponDiscountValue: 10,
      couponValidityDays: 30,
    },
    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
  };
}

export class SettingsService {
  private static currencyMap: Record<"THB" | "MMK", CurrencyInfo> = {
    THB: { code: "THB", name: "Thai Baht", symbol: "฿" },
    MMK: { code: "MMK", name: "Myanmar Kyat", symbol: "Ks" },
  };

  static async getBusinessSettings(): Promise<BusinessSettings | null> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return mapSettingsDoc(docSnap.data());
      }

      return null; // No settings found
    } catch (error) {
      console.error("Error fetching business settings:", error);
      throw new Error("Failed to fetch business settings");
    }
  }

  /**
   * Watch the business settings document and report every change.
   *
   * Settings are shared by the whole business, so a change made anywhere — the
   * Settings page, another device, or the branch picker in the top bar — has to
   * reach every open screen without anyone reloading. A one-shot read cannot do
   * that, which is why switching branch used to need a page refresh before the
   * rest of the app noticed.
   *
   * @returns an unsubscribe function; a no-op when Firebase is not configured.
   */
  static subscribeToBusinessSettings(
    onChange: (settings: BusinessSettings | null) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    if (!db || !isFirebaseConfigured) {
      onError?.(new Error("Firebase is not configured"));
      return () => {};
    }

    const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);

    return onSnapshot(
      docRef,
      (snapshot) => {
        onChange(snapshot.exists() ? mapSettingsDoc(snapshot.data()) : null);
      },
      (error) => {
        console.error("Error watching business settings:", error);
        onError?.(error);
      },
    );
  }

  static async saveBusinessSettings(
    settings: Omit<BusinessSettings, "createdAt" | "updatedAt">,
  ): Promise<BusinessSettings> {
    if (!db || !isFirebaseConfigured) {
      throw new Error("Firebase is not configured");
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);

      // Check if document exists to determine if this is create or update
      const existingDoc = await getDoc(docRef);
      const isUpdate = existingDoc.exists();

      const settingsData = {
        ...settings,
        updatedAt: serverTimestamp(),
        ...(isUpdate ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(docRef, settingsData, { merge: true });

      // Return the saved settings with current timestamp
      return {
        ...settings,
        createdAt: isUpdate
          ? existingDoc.data()?.createdAt?.toDate?.()?.toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error saving business settings:", error);
      throw new Error("Failed to save business settings");
    }
  }

  static async resetBusinessSettings(): Promise<BusinessSettings> {
    const defaultSettings: Omit<BusinessSettings, "createdAt" | "updatedAt"> = {
      businessName: "",
      shortName: "",
      defaultCurrency: "THB",
      taxRate: 0,
      registeredBy: "",
      registeredAt: "",
      businessLogo: "",
      showBusinessLogoOnInvoice: true,
      autoPrintReceiptAfterCheckout: true,
      invoiceFooterMessage: "",
      invoiceFooterImage: "",
      receiptPaperSize: "80mm",
      enableDarkMode: false,
      enableSoundEffects: false,
      currencyRate: 0,
    };

    return await this.saveBusinessSettings(defaultSettings);
  }

  /**
   * Get currency information by code
   */
  static getCurrencyInfo(code: "THB" | "MMK"): CurrencyInfo {
    return this.currencyMap[code];
  }

  /**
   * Format price with currency symbol
   */
  static formatPrice(amount: number, currencyCode: "THB" | "MMK"): string {
    const currency = this.getCurrencyInfo(currencyCode);

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "symbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace(currencyCode, currency.symbol);
  }

  /**
   * Convert price between currencies using the exchange rate
   * The exchange rate is always interpreted as: 1 [defaultCurrency] = exchangeRate [otherCurrency]
   */
  static convertPrice(
    amount: number,
    fromCurrency: "THB" | "MMK",
    toCurrency: "THB" | "MMK",
    exchangeRate: number,
    defaultCurrency: "THB" | "MMK" = "THB",
  ): number {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Determine the exchange rate interpretation based on default currency
    if (defaultCurrency === "THB") {
      // Rate means: 1 THB = exchangeRate MMK
      if (fromCurrency === "THB" && toCurrency === "MMK") {
        return amount * exchangeRate;
      } else if (fromCurrency === "MMK" && toCurrency === "THB") {
        return amount / exchangeRate;
      }
    } else if (defaultCurrency === "MMK") {
      // Rate means: 1 MMK = exchangeRate THB
      if (fromCurrency === "MMK" && toCurrency === "THB") {
        return amount * exchangeRate;
      } else if (fromCurrency === "THB" && toCurrency === "MMK") {
        return amount / exchangeRate;
      }
    }

    return amount;
  }
}
