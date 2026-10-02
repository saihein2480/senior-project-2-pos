import { NextRequest, NextResponse } from "next/server";
import type {
  BusinessSettings,
  CouponPackage,
  StoreInfoSettings,
} from "@/services/settingsService";
import { MANAGEMENT } from "@/config/rolePermissions";
import {
  handleRouteError,
  jsonError,
  requireAdminConfigured,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  getBusinessSettings,
  resetBusinessSettings,
  saveBusinessSettings,
} from "@/server/settingsAdmin";

// Access:
//   GET   - public. business_settings is public-read, and the storefront
//           server proxies this route without a user token.
//   POST / PUT?action=reset / PATCH - Owner + Manager
//           (Doc: "Business Information" / "Store Information" etc.)

interface SettingsResponse {
  success: boolean;
  data?: BusinessSettings;
  error?: string;
}

/**
 * Validate the customer-facing store facts. Blank strings are dropped entirely
 * so the storefront chatbot can tell the difference between "not configured"
 * and "configured as empty", and answer honestly either way.
 */
function sanitizeStoreInfo(input: unknown): StoreInfoSettings {
  if (!input || typeof input !== "object") return {};

  const raw = input as Record<string, unknown>;
  const result: StoreInfoSettings = {};

  const text = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const assign = <K extends keyof StoreInfoSettings>(
    key: K,
    value: StoreInfoSettings[K] | undefined,
  ) => {
    if (value !== undefined) result[key] = value;
  };

  assign("address", text(raw.address));
  assign("phone", text(raw.phone));
  assign("email", text(raw.email));
  assign("openingHours", text(raw.openingHours));
  assign("deliveryAreas", text(raw.deliveryAreas));
  assign("deliveryFee", text(raw.deliveryFee));
  assign("deliveryTime", text(raw.deliveryTime));
  assign("returnPolicy", text(raw.returnPolicy));
  assign("exchangePolicy", text(raw.exchangePolicy));
  assign("cancellationPolicy", text(raw.cancellationPolicy));

  if (typeof raw.deliveryAvailable === "boolean") {
    result.deliveryAvailable = raw.deliveryAvailable;
  }
  if (typeof raw.codAvailable === "boolean") {
    result.codAvailable = raw.codAvailable;
  }

  const codMax = Number(raw.codMaxAmount);
  if (Number.isFinite(codMax) && codMax > 0) {
    result.codMaxAmount = codMax;
  }

  if (Array.isArray(raw.paymentMethods)) {
    const methods = raw.paymentMethods
      .map((method) => text(method))
      .filter((method): method is string => !!method);
    if (methods.length > 0) result.paymentMethods = methods;
  }

  if (Array.isArray(raw.branches)) {
    const branches = (raw.branches as Array<Record<string, unknown>>)
      .filter((branch) => branch && typeof branch === "object")
      .map((branch) => ({
        name: text(branch.name) || "Branch",
        address: text(branch.address),
        phone: text(branch.phone),
        hours: text(branch.hours),
      }))
      // A branch with no contact detail tells the customer nothing.
      .filter((branch) => branch.address || branch.phone || branch.hours);

    if (branches.length > 0) result.branches = branches;
  }

  return result;
}

/**
 * Validate the owner-defined reward tiers. Anything malformed is dropped rather
 * than saved half-formed, since these values drive real point deductions.
 */
function sanitizeCouponPackages(input: unknown): CouponPackage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((pkg): pkg is Record<string, unknown> => !!pkg && typeof pkg === "object")
    .map((pkg, index) => {
      const pointsRequired = Number(pkg.pointsRequired);
      const discountValue = Number(pkg.discountValue);
      const validityDays = Number(pkg.validityDays);

      return {
        id:
          typeof pkg.id === "string" && pkg.id.trim()
            ? pkg.id
            : `pkg_${Date.now()}_${index}`,
        name:
          typeof pkg.name === "string" && pkg.name.trim()
            ? pkg.name.trim()
            : `Package ${index + 1}`,
        pointsRequired:
          Number.isFinite(pointsRequired) && pointsRequired > 0
            ? Math.floor(pointsRequired)
            : 0,
        discountType:
          pkg.discountType === "fixed" ? ("fixed" as const) : ("percentage" as const),
        discountValue:
          Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0,
        validityDays:
          Number.isFinite(validityDays) && validityDays > 0
            ? Math.floor(validityDays)
            : 30,
        enabled: pkg.enabled !== false,
      };
    })
    // A tier with no point cost or no discount cannot reward anything.
    .filter((pkg) => pkg.pointsRequired > 0 && pkg.discountValue > 0);
}

/**
 * Validate the storefront delivery fee (THB). Rounded to satang so the stored
 * value matches what the storefront shows to two decimals.
 */
function sanitizeDeliveryFee(input: unknown): number {
  const fee = Number(input);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round(fee * 100) / 100;
}

// GET /api/settings - Get business settings (public, see note above)
export async function GET() {
  const unavailable = requireAdminConfigured();
  if (unavailable) return unavailable;

  try {
    const settings = await getBusinessSettings();

    if (!settings) {
      // Return default settings if none exist
      const response: SettingsResponse = {
        success: true,
        data: {
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
          currentBranch: "Main Branch",
        },
      };
      return NextResponse.json(response);
    }

    const response: SettingsResponse = {
      success: true,
      data: settings,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      "GET /api/settings",
      "Failed to fetch settings",
    );
  }
}

// POST /api/settings - Save/Update business settings
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    // Validate required fields
    const settingsData: Omit<BusinessSettings, "createdAt" | "updatedAt"> = {
      businessName: body.businessName || "",
      shortName: body.shortName || "",
      defaultCurrency: body.defaultCurrency || "THB",
      taxRate: typeof body.taxRate === "number" ? body.taxRate : 0,
      registeredBy: body.registeredBy || "",
      registeredAt: body.registeredAt || "",
      businessLogo: body.businessLogo || "",
      showBusinessLogoOnInvoice:
        typeof body.showBusinessLogoOnInvoice === "boolean"
          ? body.showBusinessLogoOnInvoice
          : true,
      autoPrintReceiptAfterCheckout:
        typeof body.autoPrintReceiptAfterCheckout === "boolean"
          ? body.autoPrintReceiptAfterCheckout
          : true,
      invoiceFooterMessage: body.invoiceFooterMessage || "",
      invoiceFooterImage: body.invoiceFooterImage || "",
      receiptPaperSize: [
        "44mm",
        "57mm",
        "58mm",
        "69mm",
        "76mm",
        "78mm",
        "80mm",
        "82.5mm",
        "112mm",
        "114mm",
        "210mm",
      ].includes(body.receiptPaperSize)
        ? body.receiptPaperSize
        : "80mm",
      enableDarkMode:
        typeof body.enableDarkMode === "boolean" ? body.enableDarkMode : false,
      enableSoundEffects:
        typeof body.enableSoundEffects === "boolean"
          ? body.enableSoundEffects
          : false,
      currencyRate:
        typeof body.currencyRate === "number" ? body.currencyRate : 0,
      // Flat THB fee the storefront adds to every order. Anything that is not
      // a finite, non-negative number is stored as 0 (free delivery) rather
      // than letting NaN or a negative charge reach checkout.
      deliveryFee: sanitizeDeliveryFee(body.deliveryFee),
      currentBranch: body.currentBranch || "Main Branch",
      // Owner-only workspace preference; hides Home + cart for the owner.
      hidePosForOwner:
        typeof body.hidePosForOwner === "boolean"
          ? body.hidePosForOwner
          : false,
      storeInfo: sanitizeStoreInfo(body.storeInfo),
      loyaltySettings: body.loyaltySettings ? {
        enabled: typeof body.loyaltySettings.enabled === "boolean" ? body.loyaltySettings.enabled : false,
        minimumSpendAmount: typeof body.loyaltySettings.minimumSpendAmount === "number" ? body.loyaltySettings.minimumSpendAmount : 500,
        pointsPerPurchase: typeof body.loyaltySettings.pointsPerPurchase === "number" ? body.loyaltySettings.pointsPerPurchase : 1,
        couponPackages: sanitizeCouponPackages(body.loyaltySettings.couponPackages),
        pointsForCoupon: typeof body.loyaltySettings.pointsForCoupon === "number" ? body.loyaltySettings.pointsForCoupon : 10,
        couponDiscountType: (body.loyaltySettings.couponDiscountType === "percentage" || body.loyaltySettings.couponDiscountType === "fixed") ? body.loyaltySettings.couponDiscountType : "percentage",
        couponDiscountValue: typeof body.loyaltySettings.couponDiscountValue === "number" ? body.loyaltySettings.couponDiscountValue : 10,
        couponValidityDays: typeof body.loyaltySettings.couponValidityDays === "number" ? body.loyaltySettings.couponValidityDays : 30,
      } : {
        enabled: false,
        minimumSpendAmount: 500,
        pointsPerPurchase: 1,
        couponPackages: [],
        pointsForCoupon: 10,
        couponDiscountType: "percentage" as const,
        couponDiscountValue: 10,
        couponValidityDays: 30,
      },
    };

    const savedSettings = await saveBusinessSettings(settingsData);

    const response: SettingsResponse = {
      success: true,
      data: savedSettings,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      "POST /api/settings",
      "Failed to save settings",
    );
  }
}

// PUT /api/settings?action=reset - Reset settings to default
export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "reset") {
      const resetSettings = await resetBusinessSettings();

      const response: SettingsResponse = {
        success: true,
        data: resetSettings,
      };

      return NextResponse.json(response);
    }

    const response: SettingsResponse = {
      success: false,
      error: "Invalid action",
    };

    return NextResponse.json(response, { status: 400 });
  } catch (error) {
    return handleRouteError(
      error,
      "PUT /api/settings",
      "Failed to reset settings",
    );
  }
}

// PATCH /api/settings - Partial update (just currentBranch)
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.currentBranch !== "string") {
      return jsonError(400, "currentBranch is required");
    }

    const current = await getBusinessSettings();
    if (!current) {
      return jsonError(404, "No business settings found");
    }

    // Update only currentBranch. The mapped timestamps are ISO strings, so
    // they are left out rather than written back over the stored values.
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = current;
    void _createdAt;
    void _updatedAt;
    const updated = await saveBusinessSettings({
      ...rest,
      currentBranch: body.currentBranch,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(
      error,
      "PATCH /api/settings",
      "Failed to update settings",
    );
  }
}
