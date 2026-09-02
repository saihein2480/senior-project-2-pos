// PATCH /api/settings - Partial update (e.g., just currentBranch)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body.currentBranch !== "string") {
      return NextResponse.json(
        { success: false, error: "currentBranch is required" },
        { status: 400 },
      );
    }
    // Get current settings
    const current = await SettingsService.getBusinessSettings();
    if (!current) {
      return NextResponse.json(
        { success: false, error: "No business settings found" },
        { status: 404 },
      );
    }
    // Update only currentBranch
    const updated = await SettingsService.saveBusinessSettings({
      ...current,
      currentBranch: body.currentBranch,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/settings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update settings",
      },
      { status: 500 },
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import {
  SettingsService,
  BusinessSettings,
  CouponPackage,
} from "@/services/settingsService";

interface SettingsResponse {
  success: boolean;
  data?: BusinessSettings;
  error?: string;
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

// GET /api/settings - Get business settings
export async function GET(request: NextRequest) {
  try {
    const settings = await SettingsService.getBusinessSettings();

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
    console.error("Error in GET /api/settings:", error);
    const response: SettingsResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch settings",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// POST /api/settings - Save/Update business settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
      currentBranch: body.currentBranch || "Main Branch",
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

    const savedSettings =
      await SettingsService.saveBusinessSettings(settingsData);

    const response: SettingsResponse = {
      success: true,
      data: savedSettings,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in POST /api/settings:", error);
    const response: SettingsResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save settings",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT /api/settings/reset - Reset settings to default
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "reset") {
      const resetSettings = await SettingsService.resetBusinessSettings();

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
    console.error("Error in PUT /api/settings:", error);
    const response: SettingsResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reset settings",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
