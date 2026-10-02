import { NextRequest, NextResponse } from "next/server";
import { StockItem, StockResponse } from "@/types/stock";
import { isStockAdjustmentError, type EditedVariant } from "@/lib/stockMath";
import {
  ALL_STAFF,
  MANAGEMENT,
  OWNER_ONLY,
} from "@/config/rolePermissions";
import {
  handleRouteError,
  jsonError,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  deleteStock,
  getStockById,
  updateStock,
  updateStockWithMerge,
} from "@/server/stocksAdmin";

// Access:
//   GET    - every POS role.
//   PUT    - Owner + Manager (Doc: "Edit Product Details" / "Manage Stock").
//   DELETE - Owner only (Doc: "Delete Products").

/** Parse a price field: a finite number >= 0, or null if invalid. */
function parsePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(price) && price >= 0 ? price : null;
}

// GET /api/stocks/[id] - Get a specific stock item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  try {
    const stock = await getStockById(id);

    if (!stock) {
      const response: StockResponse = {
        success: false,
        error: "Stock item not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: StockResponse = {
      success: true,
      data: stock,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      `GET /api/stocks/${id}`,
      "Failed to fetch stock item",
    );
  }
}

// PUT /api/stocks/[id] - Update a specific stock item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  const { id } = await params;

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

    // Prepare update data
    const updateData: Partial<StockItem> = {
      groupName: body.groupName,
      unitPrice,
      originalPrice,
      releaseDate: body.releaseDate,
      shop: body.shop,
      isColorless: body.isColorless,
      groupImage: body.groupImage,
      wholesaleTiers: body.wholesaleTiers || [],
      colorVariants: body.colorVariants || [],
    };

    // Only include category if it has a value (Firestore doesn't accept undefined)
    if (body.category) {
      updateData.category = body.category;
    }

    // The edit page sends the variants it was loaded from. With that we can
    // merge quantities as changes against the live document, so a sale made
    // while the form was open is not overwritten by the form's stale numbers.
    if (Array.isArray(body.baseColorVariants)) {
      const { colorVariants: _ignored, ...otherFields } = updateData;
      void _ignored;

      const editedVariants: EditedVariant[] = (
        Array.isArray(body.colorVariants) ? body.colorVariants : []
      ).map((variant: Record<string, unknown>) => ({
        sourceIndex:
          typeof variant.sourceIndex === "number" ? variant.sourceIndex : null,
        color: String(variant.color ?? ""),
        colorCode: String(variant.colorCode ?? ""),
        barcode: String(variant.barcode ?? ""),
        ...(typeof variant.image === "string" ? { image: variant.image } : {}),
        sizeQuantities: Array.isArray(variant.sizeQuantities)
          ? (variant.sizeQuantities as Array<Record<string, unknown>>).map(
              (sq) => ({
                size: String(sq.size ?? ""),
                quantity: Number(sq.quantity ?? 0),
              }),
            )
          : [],
      }));

      try {
        await updateStockWithMerge(
          id,
          otherFields,
          editedVariants,
          body.baseColorVariants,
        );
      } catch (error) {
        if (isStockAdjustmentError(error)) {
          const status = error.code === "stock_not_found" ? 404 : 409;
          return jsonError(status, error.message, {
            code: error.code,
            details: error.details,
          });
        }
        throw error;
      }

      const response: StockResponse = {
        success: true,
        message: "Stock item updated successfully",
      };
      return NextResponse.json(response);
    }

    // Legacy callers that do not send a base snapshot: whole-array overwrite.
    console.warn(
      `PUT /api/stocks/${id} without baseColorVariants: quantities overwritten as sent`,
    );
    await updateStock(id, updateData);

    const response: StockResponse = {
      success: true,
      message: "Stock item updated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      `PUT /api/stocks/${id}`,
      "Failed to update stock item",
    );
  }
}

// DELETE /api/stocks/[id] - Delete a specific stock item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  try {
    await deleteStock(id);

    const response: StockResponse = {
      success: true,
      message: "Stock item deleted successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      `DELETE /api/stocks/${id}`,
      "Failed to delete stock item",
    );
  }
}
