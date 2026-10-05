import { NextRequest, NextResponse } from "next/server";
import type {
  ColorVariant,
  StockItem,
  StockResponse,
  WholesaleTier,
} from "@/types/stock";
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
  stockRequestSchema,
  updateStock,
  updateStockWithMerge,
} from "@/server/stocksAdmin";
import { parseJson } from "@/server/validation";
import { auditCaller } from "@/server/auditLog";

// Access:
//   GET    - every POS role.
//   PUT    - Owner + Manager (Doc: "Edit Product Details" / "Manage Stock").
//   DELETE - Owner only (Doc: "Delete Products").

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
    const body = await parseJson(request, stockRequestSchema);

    // Prepare update data. Fields the form left out stay undefined and are
    // not written (stripUndefined), so they keep their stored values.
    const updateData: Partial<StockItem> = {
      groupName: body.groupName,
      unitPrice: body.unitPrice,
      originalPrice: body.originalPrice,
      releaseDate: body.releaseDate,
      shop: body.shop ?? undefined,
      isColorless: body.isColorless ?? undefined,
      groupImage: body.groupImage ?? undefined,
      // Tiers and variants are written as the form sent them (validated, but
      // the form does not send tier ids), exactly as before.
      wholesaleTiers: (body.wholesaleTiers || []) as unknown as WholesaleTier[],
      colorVariants: (body.colorVariants || []) as unknown as ColorVariant[],
    };

    // Only include category if it has a value (Firestore doesn't accept undefined)
    if (body.category) {
      updateData.category = body.category;
    }

    // The edit page sends the variants it was loaded from. With that we can
    // merge quantities as changes against the live document, so a sale made
    // while the form was open is not overwritten by the form's stale numbers.
    if (body.baseColorVariants) {
      const { colorVariants: _ignored, ...otherFields } = updateData;
      void _ignored;

      const editedVariants: EditedVariant[] = (body.colorVariants || []).map(
        (variant) => ({
          sourceIndex: variant.sourceIndex ?? null,
          color: variant.color,
          colorCode: variant.colorCode,
          barcode: variant.barcode,
          ...(variant.image !== undefined ? { image: variant.image } : {}),
          sizeQuantities: variant.sizeQuantities.map((sq) => ({
            size: sq.size,
            quantity: sq.quantity,
          })),
        }),
      );

      try {
        await updateStockWithMerge(
          id,
          otherFields,
          editedVariants,
          // The loaded snapshot, as stored; mergeOwnerEdit reads it defensively.
          body.baseColorVariants as unknown as ColorVariant[],
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

      await auditCaller(auth.caller, {
        action: "stock.update",
        targetCollection: "stocks",
        targetId: id,
        details: { name: body.groupName, unitPrice: body.unitPrice },
      });

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

    await auditCaller(auth.caller, {
      action: "stock.update",
      targetCollection: "stocks",
      targetId: id,
      details: { name: body.groupName, unitPrice: body.unitPrice },
    });

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
    // Read the name first: after the delete there is nothing left to show.
    const existing = await getStockById(id).catch(() => null);

    await deleteStock(id);

    await auditCaller(auth.caller, {
      action: "stock.delete",
      targetCollection: "stocks",
      targetId: id,
      details: { name: existing?.groupName ?? null },
    });

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
