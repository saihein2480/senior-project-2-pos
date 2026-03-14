import {
  collection,
  doc,
  getDoc,
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
  createdAt?: string;
  updatedAt?: string;
}

export interface CurrencyInfo {
  code: "THB" | "MMK";
  name: string;
  symbol: string;
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
        const data = docSnap.data();
        return {
          businessName: data.businessName || "",
          shortName: data.shortName || "",
          defaultCurrency: data.defaultCurrency || "THB",
          taxRate: data.taxRate || 0,
          registeredBy: data.registeredBy || "",
          registeredAt: data.registeredAt || "",
          businessLogo: data.businessLogo || "",
          showBusinessLogoOnInvoice: data.showBusinessLogoOnInvoice ?? true,
          autoPrintReceiptAfterCheckout:
            data.autoPrintReceiptAfterCheckout ?? true,
          invoiceFooterMessage: data.invoiceFooterMessage || "",
          invoiceFooterImage: data.invoiceFooterImage || "",
          receiptPaperSize: data.receiptPaperSize || "80mm",
          enableDarkMode: data.enableDarkMode ?? false,
          enableSoundEffects: data.enableSoundEffects ?? false,
          currencyRate: data.currencyRate || 0,
          currentBranch: data.currentBranch || "Main Branch",
          labelSettings: data.labelSettings,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt:
            data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        };
      }

      return null; // No settings found
    } catch (error) {
      console.error("Error fetching business settings:", error);
      throw new Error("Failed to fetch business settings");
    }
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
