import { NextRequest, NextResponse } from "next/server";
import { StockService } from "@/services/stockService";
import { StockResponse } from "@/types/stock";
import { isStockAdjustmentError, type EditedVariant } from "@/lib/stockMath";

// GET /api/stocks/[id] - Get a specific stock item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // For now, we'll get all stocks and find the specific one
    // In a real implementation, you'd have a getStockById method
    const stocks = await StockService.getAllStocks();
    const stock = stocks.find((s) => s.id === id);

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
    console.error(`Error in GET /api/stocks/${(await params).id}:`, error);
    const response: StockResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch stock item",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT /api/stocks/[id] - Update a specific stock item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Basic validation
    if (!body.groupName || !body.unitPrice || !body.originalPrice) {
      const response: StockResponse = {
        success: false,
        error: "Missing required fields: groupName, unitPrice, originalPrice",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Prepare update data
    const updateData: any = {
      groupName: body.groupName,
      unitPrice: parseFloat(body.unitPrice),
      originalPrice: parseFloat(body.originalPrice),
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
        await StockService.updateStockWithMerge(
          id,
          otherFields,
          editedVariants,
          body.baseColorVariants,
        );
      } catch (error) {
        if (isStockAdjustmentError(error)) {
          const response: StockResponse = {
            success: false,
            error: error.message,
          };
          const status = error.code === "stock_not_found" ? 404 : 409;
          return NextResponse.json(
            { ...response, code: error.code, details: error.details },
            { status },
          );
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
    await StockService.updateStock(id, updateData);

    const response: StockResponse = {
      success: true,
      message: "Stock item updated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Error in PUT /api/stocks/${(await params).id}:`, error);
    const response: StockResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update stock item",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// DELETE /api/stocks/[id] - Delete a specific stock item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await StockService.deleteStock(id);

    const response: StockResponse = {
      success: true,
      message: "Stock item deleted successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Error in DELETE /api/stocks/${(await params).id}:`, error);
    const response: StockResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete stock item",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
