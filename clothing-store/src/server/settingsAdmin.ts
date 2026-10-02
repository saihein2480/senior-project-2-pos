/**
 * business_settings/main through the Admin SDK (server only).
 *
 * Mirrors SettingsService.getBusinessSettings / saveBusinessSettings /
 * resetBusinessSettings so /api/settings keeps returning the same shapes.
 */

import { FieldValue } from "firebase-admin/firestore";
import {
  mapSettingsDoc,
  type BusinessSettings,
} from "@/services/settingsService";
import { getAdminDb } from "./adminDb";
import { stripUndefined } from "./serialize";

const COLLECTION_NAME = "business_settings";
const SETTINGS_DOC_ID = "main";

function settingsRef() {
  return getAdminDb().collection(COLLECTION_NAME).doc(SETTINGS_DOC_ID);
}

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  const snapshot = await settingsRef().get();
  if (!snapshot.exists) return null;
  return mapSettingsDoc(snapshot.data() ?? {});
}

export async function saveBusinessSettings(
  settings: Omit<BusinessSettings, "createdAt" | "updatedAt">,
): Promise<BusinessSettings> {
  const docRef = settingsRef();

  const existing = await docRef.get();
  const isUpdate = existing.exists;

  await docRef.set(
    {
      // Firestore rejects undefined (e.g. an optional branch field left blank).
      ...stripUndefined(settings),
      updatedAt: FieldValue.serverTimestamp(),
      ...(isUpdate ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return {
    ...settings,
    createdAt: isUpdate
      ? existing.data()?.createdAt?.toDate?.()?.toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function resetBusinessSettings(): Promise<BusinessSettings> {
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
    deliveryFee: 0,
  };

  return saveBusinessSettings(defaultSettings);
}
