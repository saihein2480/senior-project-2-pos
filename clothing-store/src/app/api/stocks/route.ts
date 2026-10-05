import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CreateStockRequest,
  StockResponse,
  StockListResponse,
} from "@/types/stock";
import { ALL_STAFF, MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, requireRole } from "@/lib/server/apiAuth";
import {
  createStock,
  getAllStocks,
  getRecentStocks,
  getStocksByShop,
  stockRequestSchema,
} from "@/server/stocksAdmin";
import { parseJson, parseQuery } from "@/server/validation";
import { auditCaller } from "@/server/auditLog";

// Access:
//   GET  - every POS role (the product grid and cart read stock for sales).
//   POST - Owner + Manager (Doc: "Add New Products").

const MAX_LIMIT = 1000;
const LIMIT_MESSAGE = "limit must be a positive integer";

/** GET query. An empty value counts as absent, as it always has. */
const emptyAsAbsent = (value: unknown) => (value === "" ? undefined : value);

const stockListQuerySchema = z.object({
  shop: z.string().optional(),
  recent: z.string().optional(),
  limit: z.preprocess(
    emptyAsAbsent,
    z
      .string()
      .regex(/^\d+$/, LIMIT_MESSAGE)
      .transform(Number)
      .pipe(z.number().int().positive(LIMIT_MESSAGE))
      .optional(),
  ),
});

// GET /api/stocks - Get all stocks or recent stocks
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  try {
    const { shop, recent, limit } = parseQuery(request, stockListQuerySchema);

    let stocks;

    if (shop) {
      stocks = await getStocksByShop(shop);
    } else if (recent === "true") {
      // Get recent stocks (last 20 items by default)
      stocks = await getRecentStocks(20);
    } else if (limit !== undefined) {
      stocks = await getRecentStocks(Math.min(limit, MAX_LIMIT));
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
    const body = await parseJson(request, stockRequestSchema);

    const stockData: CreateStockRequest = {
      groupName: body.groupName,
      unitPrice: body.unitPrice,
      originalPrice: body.originalPrice,
      // Optional on the wire; a missing date is simply not stored, as before.
      releaseDate: body.releaseDate as string,
      shop: body.shop || "Main Shop",
      isColorless: body.isColorless || false,
      groupImage: body.groupImage ?? undefined,
      wholesaleTiers: body.wholesaleTiers || [],
      colorVariants: body.colorVariants || [],
    };

    // Only include category if it has a value (Firestore doesn't accept undefined)
    if (body.category) {
      stockData.category = body.category;
    }

    const createdStock = await createStock(stockData, auth.caller.uid);

    await auditCaller(auth.caller, {
      action: "stock.create",
      targetCollection: "stocks",
      targetId: createdStock.id,
      details: {
        name: body.groupName,
        unitPrice: body.unitPrice,
        variants: (body.colorVariants || []).length,
      },
    });

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
