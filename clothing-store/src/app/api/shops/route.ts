import { NextRequest, NextResponse } from "next/server";
import {
  CreateShopRequest,
  ShopResponse,
  ShopListResponse,
  ShopFilters,
} from "@/types/shop";
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

// Access:
//   GET  - public. Branch names/addresses are shown to customers; the
//          storefront server proxies this route, and the POS home page and
//          cart read it for every role.
//   POST - Owner only (Doc: "Add/Edit/Delete Shop").

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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      const response: ShopResponse = {
        success: false,
        error: "Invalid JSON body",
      };
      return NextResponse.json(response, { status: 400 });
    }
    // Treat empty string as undefined for secondaryPhone
    if (body.secondaryPhone === "") {
      body.secondaryPhone = undefined;
    }

    // Basic validation
    const textFields = [
      "name",
      "address",
      "primaryPhone",
      "township",
      "city",
    ] as const;
    if (textFields.some((field) => !body[field] || typeof body[field] !== "string")) {
      const response: ShopResponse = {
        success: false,
        error:
          "Missing required fields: name, address, primaryPhone, township, and city are required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const optionalTextFields = ["secondaryPhone", "openingHours"] as const;
    if (
      optionalTextFields.some(
        (field) =>
          body[field] !== undefined &&
          body[field] !== null &&
          typeof body[field] !== "string",
      ) ||
      (body.status &&
        body.status !== "active" &&
        body.status !== "inactive")
    ) {
      const response: ShopResponse = {
        success: false,
        error: "Invalid shop fields",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate phone number format: allow any starting digit, 7-17 digits
    const phoneRegex = /^\d{7,17}$/;
    if (!phoneRegex.test(body.primaryPhone)) {
      const response: ShopResponse = {
        success: false,
        error: "Invalid primary phone number format. Must be 7-17 digits.",
      };
      return NextResponse.json(response, { status: 400 });
    }
    // secondaryPhone is optional, but if provided, must match format
    if (body.secondaryPhone && !phoneRegex.test(body.secondaryPhone)) {
      const response: ShopResponse = {
        success: false,
        error: "Invalid secondary phone number format. Must be 7-17 digits.",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const shopData: CreateShopRequest = {
      name: body.name.trim(),
      address: body.address.trim(),
      primaryPhone: body.primaryPhone.trim(),
      secondaryPhone: body.secondaryPhone?.trim() || undefined,
      township: body.township.trim(),
      city: body.city.trim(),
      openingHours: body.openingHours?.trim() || undefined,
      status: body.status || "active",
    };

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
