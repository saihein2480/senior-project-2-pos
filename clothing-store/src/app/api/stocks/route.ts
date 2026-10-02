import { NextRequest, NextResponse } from "next/server";
import {
  CreateStockRequest,
  StockResponse,
  StockListResponse,
} from "@/types/stock";
import { ALL_STAFF, MANAGEMENT } from "@/config/rolePermissions";
import {
  handleRouteError,
  jsonError,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  createStock,
  getAllStocks,
  getRecentStocks,
  getStocksByShop,
} from "@/server/stocksAdmin";

// Access:
//   GET  - every POS role (the product grid and cart read stock for sales).
//   POST - Owner + Manager (Doc: "Add New Products").

const MAX_LIMIT = 1000;

/** Parse a price field: a finite number >= 0, or null if invalid. */
function parsePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(price) && price >= 0 ? price : null;
}

// GET /api/stocks - Get all stocks or recent stocks
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const shop = searchParams.get("shop");
    const recent = searchParams.get("recent");

    let stocks;

    if (shop) {
      stocks = await getStocksByShop(shop);
    } else if (recent === "true") {
      // Get recent stocks (last 20 items by default)
      stocks = await getRecentStocks(20);
    } else if (limit) {
      const count = Number.parseInt(limit, 10);
      if (!Number.isInteger(count) || count <= 0) {
        return jsonError(400, "limit must be a positive integer");
      }
      stocks = await getRecentStocks(Math.min(count, MAX_LIMIT));
    } else {
      stocks = await getAllStocks();
    }

    const response: StockListResponse = {
      success: true,
      data: stocks,
      total: stocks.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "GET /api/stocks", "Failed to fetch stocks");
  }
}

// POST /api/stocks - Create a new stock item
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    // Basic validation
    if (!body.groupName || !body.unitPrice || !body.originalPrice) {
      const response: StockResponse = {
        success: false,
        error: "Missing required fields: groupName, unitPrice, originalPrice",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const unitPrice = parsePrice(body.unitPrice);
    const originalPrice = parsePrice(body.originalPrice);
    if (unitPrice === null || originalPrice === null) {
      const response: StockResponse = {
        success: false,
        error: "unitPrice and originalPrice must be non-negative numbers",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const stockData: CreateStockRequest = {
      groupName: body.groupName,
      unitPrice,
      originalPrice,
      releaseDate: body.releaseDate,
      shop: body.shop || "Main Shop",
      isColorless: body.isColorless || false,
      groupImage: body.groupImage,
      wholesaleTiers: body.wholesaleTiers || [],
      colorVariants: body.colorVariants || [],
    };

    // Only include category if it has a value (Firestore doesn't accept undefined)
    if (body.category) {
      stockData.category = body.category;
    }

    const createdStock = await createStock(stockData, auth.caller.uid);

    const response: StockResponse = {
      success: true,
      data: createdStock,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleRouteError(
      error,
      "POST /api/stocks",
      "Failed to create stock item",
    );
  }
}
