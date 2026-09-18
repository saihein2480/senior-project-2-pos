import { NextRequest, NextResponse } from "next/server";
import { ShopService } from "@/services/shopService";
import {
  CreateShopRequest,
  ShopResponse,
  ShopListResponse,
  ShopFilters,
} from "@/types/shop";

// GET /api/shops - Get all shops or filtered shops
export async function GET(request: NextRequest) {
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
      shops = await ShopService.getAllShops();
    } else {
      shops = await ShopService.getShopsWithFilters(filters);
    }

    const response: ShopListResponse = {
      success: true,
      data: shops,
      total: shops.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in GET /api/shops:", error);
    const response: ShopListResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch shops",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// POST /api/shops - Create a new shop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Treat empty string as undefined for secondaryPhone
    if (body.secondaryPhone === "") {
      body.secondaryPhone = undefined;
    }

    // Basic validation
    if (
      !body.name ||
      !body.address ||
      !body.primaryPhone ||
      !body.township ||
      !body.city
    ) {
      const response: ShopResponse = {
        success: false,
        error:
          "Missing required fields: name, address, primaryPhone, township, and city are required",
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

    // TODO: Get actual user ID from authentication
    const userId = "current-user-id"; // This should come from auth context

    const shop = await ShopService.createShop(shopData, userId);

    const response: ShopResponse = {
      success: true,
      data: shop,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/shops:", error);
    const response: ShopResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create shop",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
