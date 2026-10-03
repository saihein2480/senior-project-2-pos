import { NextRequest, NextResponse } from "next/server";
import {
  CreateShopRequest,
  ShopResponse,
  ShopListResponse,
  ShopFilters,
} from "@/types/shop";
import { z } from "zod";
import { OWNER_ONLY } from "@/config/rolePermissions";
import {
  handleRouteError,
  requireAdminConfigured,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  createShop,
  getAllShops,
  getShopsWithFilters,
} from "@/server/shopsAdmin";
import { parseJson } from "@/server/validation";

// Access:
//   GET  - public. Branch names/addresses are shown to customers; the
//          storefront server proxies this route, and the POS home page and
//          cart read it for every role.
//   POST - Owner only (Doc: "Add/Edit/Delete Shop").

const MISSING_SHOP_FIELDS =
  "Missing required fields: name, address, primaryPhone, township, and city are required";
const INVALID_SHOP_FIELDS = "Invalid shop fields";
/** Any starting digit, 7-17 digits. */
const PHONE_PATTERN = /^\d{7,17}$/;

const requiredShopText = z
  .string({ error: MISSING_SHOP_FIELDS })
  .trim()
  .min(1, MISSING_SHOP_FIELDS);

/** Optional text: absent, null or "" all mean "not given". */
const optionalShopText = z
  .string({ error: INVALID_SHOP_FIELDS })
  .trim()
  .nullish()
  .transform((value) => value || undefined);

/**
 * POST body. Errors come out in the order the route always reported them:
 * a missing required field, then a wrongly typed optional field or status,
 * then the phone formats (checked last, once every field has the right type).
 */
const createShopSchema = z
  .object({
    name: requiredShopText,
    address: requiredShopText,
    primaryPhone: requiredShopText,
    township: requiredShopText,
    city: requiredShopText,
    secondaryPhone: optionalShopText,
    openingHours: optionalShopText,
    // A falsy status (absent, "", null) means the default, "active".
    status: z.preprocess(
      (value) => value || undefined,
      z
        .enum(["active", "inactive"], { error: INVALID_SHOP_FIELDS })
        .default("active"),
    ),
  })
  .superRefine((shop, ctx) => {
    if (!PHONE_PATTERN.test(shop.primaryPhone)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid primary phone number format. Must be 7-17 digits.",
      });
    }
    if (shop.secondaryPhone && !PHONE_PATTERN.test(shop.secondaryPhone)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid secondary phone number format. Must be 7-17 digits.",
      });
    }
  });

// GET /api/shops - Get all shops or filtered shops
export async function GET(request: NextRequest) {
  const unavailable = requireAdminConfigured();
  if (unavailable) return unavailable;

  try {
    const { searchParams } = new URL(request.url);

    // Extract filter parameters
    const filters: ShopFilters = {
      status: searchParams.get("status") as "active" | "inactive" | undefined,
      city: searchParams.get("city") || undefined,
      township: searchParams.get("township") || undefined,
      search: searchParams.get("search") || undefined,
    };

    // Remove undefined values
    Object.keys(filters).forEach((key) => {
      if (filters[key as keyof ShopFilters] === undefined) {
        delete filters[key as keyof ShopFilters];
      }
    });

    let shops;

    // If no filters, get all shops
    if (Object.keys(filters).length === 0) {
      shops = await getAllShops();
    } else {
      shops = await getShopsWithFilters(filters);
    }

    const response: ShopListResponse = {
      success: true,
      data: shops,
      total: shops.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "GET /api/shops", "Failed to fetch shops");
  }
}

// POST /api/shops - Create a new shop
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const shopData: CreateShopRequest = await parseJson(
      request,
      createShopSchema,
    );

    const shop = await createShop(shopData, auth.caller.uid);

    const response: ShopResponse = {
      success: true,
      data: shop,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/shops", "Failed to create shop");
  }
}
