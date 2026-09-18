import { NextRequest, NextResponse } from 'next/server';
import { ShopService } from '@/services/shopService';
import { UpdateShopRequest, ShopResponse } from '@/types/shop';

// GET /api/shops/[id] - Get a specific shop by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop ID is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const shop = await ShopService.getShopById(id);

    if (!shop) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ShopResponse = {
      success: true,
      data: shop,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/shops/[id]:', error);
    const response: ShopResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch shop',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT /api/shops/[id] - Update a specific shop
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop ID is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check if shop exists
    const existingShop = await ShopService.getShopById(id);
    if (!existingShop) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Validate phone numbers if provided
    const phoneRegex = /^09\d{7,9}$/;
    if (body.primaryPhone && !phoneRegex.test(body.primaryPhone)) {
      const response: ShopResponse = {
        success: false,
        error: 'Invalid primary phone number format. Must start with 09 and be 9-11 digits long',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (body.secondaryPhone && body.secondaryPhone.trim() !== '' && !phoneRegex.test(body.secondaryPhone)) {
      const response: ShopResponse = {
        success: false,
        error: 'Invalid secondary phone number format. Must start with 09 and be 9-11 digits long',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Prepare update data (only include fields that are provided)
    const updateData: UpdateShopRequest = {};
    
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.address !== undefined) updateData.address = body.address.trim();
    if (body.primaryPhone !== undefined) updateData.primaryPhone = body.primaryPhone.trim();
    if (body.secondaryPhone !== undefined) {
      updateData.secondaryPhone = body.secondaryPhone.trim() || undefined;
    }
    if (body.township !== undefined) updateData.township = body.township.trim();
    if (body.city !== undefined) updateData.city = body.city.trim();
    if (body.openingHours !== undefined) {
      updateData.openingHours = body.openingHours.trim() || undefined;
    }
    if (body.status !== undefined) updateData.status = body.status;

    await ShopService.updateShop(id, updateData);

    // Fetch updated shop
    const updatedShop = await ShopService.getShopById(id);

    const response: ShopResponse = {
      success: true,
      data: updatedShop!,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in PUT /api/shops/[id]:', error);
    const response: ShopResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update shop',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// DELETE /api/shops/[id] - Delete a specific shop
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop ID is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check if shop exists
    const existingShop = await ShopService.getShopById(id);
    if (!existingShop) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    await ShopService.deleteShop(id);

    const response: ShopResponse = {
      success: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in DELETE /api/shops/[id]:', error);
    const response: ShopResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete shop',
    };
    return NextResponse.json(response, { status: 500 });
  }
}