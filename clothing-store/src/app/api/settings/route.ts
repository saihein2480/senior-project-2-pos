import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
  BusinessSettings,
  CouponPackage,
  LoyaltySettings,
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
import { parseJson, parseQuery } from "@/server/validation";
import { auditCaller } from "@/server/auditLog";
import { roundMoney } from "@/lib/money";

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
  return roundMoney(fee, "THB");
}

// ---- Request schemas -------------------------------------------------------
//
// POST is a whole-document save from the Settings page, and it has always
// been forgiving: a field of the wrong type falls back to its default rather
// than failing the save (an odd legacy value must not lock the owner out of
// their settings). The `.catch(default)` fields below keep exactly that. What
// is rejected is input that would corrupt money maths: a body that is not an
// object, a tax rate outside 0-100, or a negative exchange rate.

const RECEIPT_PAPER_SIZES = [
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
] as const;

/** Text field: a string, otherwise "" (callers apply their own `||` default). */
const textOrEmpty = z.string().catch("");
const flagOr = (fallback: boolean) => z.boolean().catch(fallback);
const numberOr = (fallback: number) => z.number().catch(fallback);
/** A number, or 0 when the field is missing or not a number. */
const numberOrZero = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
    schema,
  );

const defaultLoyaltySettings = () =>
  ({
    enabled: false,
    minimumSpendAmount: 500,
    pointsPerPurchase: 1,
    couponPackages: [] as CouponPackage[],
    pointsForCoupon: 10,
    couponDiscountType: "percentage" as const,
    couponDiscountValue: 10,
    couponValidityDays: 30,
  }) satisfies LoyaltySettings;

const loyaltySettingsSchema = z
  .object({
    enabled: flagOr(false),
    minimumSpendAmount: numberOr(500),
    pointsPerPurchase: numberOr(1),
    couponPackages: z.unknown().transform(sanitizeCouponPackages),
    pointsForCoupon: numberOr(10),
    couponDiscountType: z.enum(["percentage", "fixed"]).catch("percentage"),
    couponDiscountValue: numberOr(10),
    couponValidityDays: numberOr(30),
  })
  // Missing, null or not an object: the default programme (disabled).
  .catch(defaultLoyaltySettings);

const TAX_RATE_MESSAGE = "taxRate must be between 0 and 100";

const saveSettingsSchema = z.object({
  businessName: textOrEmpty,
  shortName: textOrEmpty,
  defaultCurrency: z.enum(["THB", "MMK"]).catch("THB"),
  taxRate: numberOrZero(
    z.number().min(0, TAX_RATE_MESSAGE).max(100, TAX_RATE_MESSAGE),
  ),
  registeredBy: textOrEmpty,
  registeredAt: textOrEmpty,
  businessLogo: textOrEmpty,
  showBusinessLogoOnInvoice: flagOr(true),
  autoPrintReceiptAfterCheckout: flagOr(true),
  invoiceFooterMessage: textOrEmpty,
  invoiceFooterImage: textOrEmpty,
  receiptPaperSize: z.enum(RECEIPT_PAPER_SIZES).catch("80mm"),
  enableDarkMode: flagOr(false),
  enableSoundEffects: flagOr(false),
  currencyRate: numberOrZero(
    z.number().min(0, "currencyRate must not be negative"),
  ),
  // Read by the refund flow: refund the tax share of returned items too.
  // Booleans only; anything else saves as false (keep tax, the old behaviour).
  refundTaxOnReturns: flagOr(false),
  // Flat THB fee the storefront adds to every order. Anything that is not
  // a finite, non-negative number is stored as 0 (free delivery) rather
  // than letting NaN or a negative charge reach checkout.
  deliveryFee: z.unknown().transform(sanitizeDeliveryFee),
  currentBranch: textOrEmpty,
  // Owner-only workspace preference; hides Home + cart for the owner.
  hidePosForOwner: flagOr(false),
  storeInfo: z.unknown().transform(sanitizeStoreInfo),
  loyaltySettings: loyaltySettingsSchema,
});

const BRANCH_REQUIRED = "currentBranch is required";

const patchSettingsSchema = z.object(
  { currentBranch: z.string({ error: BRANCH_REQUIRED }) },
  { error: BRANCH_REQUIRED },
);

const settingsActionSchema = z.object({
  action: z.literal("reset", { error: "Invalid action" }),
});

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
    const body = await parseJson(request, saveSettingsSchema);

    const settingsData: Omit<BusinessSettings, "createdAt" | "updatedAt"> = {
      ...body,
      currentBranch: body.currentBranch || "Main Branch",
    };

    // What it was before, only to say which settings changed in the log.
    const previous = (await getBusinessSettings().catch(() => null)) as
      | Record<string, unknown>
      | null;

    const savedSettings = await saveBusinessSettings(settingsData);

    const changedFields = Object.keys(settingsData).filter(
      (key) =>
        JSON.stringify(previous?.[key] ?? null) !==
        JSON.stringify((settingsData as Record<string, unknown>)[key] ?? null),
    );
    await auditCaller(auth.caller, {
      action: "settings.update",
      targetCollection: "settings",
      targetId: "main",
      details: { fields: changedFields.slice(0, 25) },
    });

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
    // Only ?action=reset exists; anything else is a 400 "Invalid action".
    parseQuery(request, settingsActionSchema);

    const resetSettings = await resetBusinessSettings();

    await auditCaller(auth.caller, {
      action: "settings.reset",
      targetCollection: "settings",
      targetId: "main",
    });

    const response: SettingsResponse = {
      success: true,
      data: resetSettings,
    };

    return NextResponse.json(response);
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
    const body = await parseJson(request, patchSettingsSchema, {
      invalidBodyMessage: BRANCH_REQUIRED,
    });

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

    if (current.currentBranch !== body.currentBranch) {
      await auditCaller(auth.caller, {
        action: "settings.defaultBranch",
        targetCollection: "settings",
        targetId: "main",
        details: {
          name: body.currentBranch,
          previous: current.currentBranch ?? null,
        },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(
      error,
      "PATCH /api/settings",
      "Failed to update settings",
    );
  }
}
