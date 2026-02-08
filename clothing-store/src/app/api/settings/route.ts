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
import { SettingsService, BusinessSettings } from "@/services/settingsService";

interface SettingsResponse {
  success: boolean;
  data?: BusinessSettings;
  error?: string;
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
