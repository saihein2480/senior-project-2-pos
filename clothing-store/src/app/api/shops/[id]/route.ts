import { NextRequest, NextResponse } from 'next/server';
import { UpdateShopRequest, ShopResponse } from '@/types/shop';
import { OWNER_ONLY } from '@/config/rolePermissions';
import {
  handleRouteError,
  requireAdminConfigured,
  requireRole,
} from '@/lib/server/apiAuth';
import {
  deleteShop,
  getShopById,
  updateShop,
} from '@/server/shopsAdmin';

// Access:
//   GET        - public (same reasoning as GET /api/shops).
//   PUT/DELETE - Owner only (Doc: "Add/Edit/Delete Shop").

// GET /api/shops/[id] - Get a specific shop by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unavailable = requireAdminConfigured();
  if (unavailable) return unavailable;

  try {
    const { id } = await params;

    if (!id) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop ID is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const shop = await getShopById(id);

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
    return handleRouteError(error, 'GET /api/shops/[id]', 'Failed to fetch shop');
  }
}

/** Fields PUT accepts; each must be a string when present. */
const TEXT_FIELDS = [
  'name',
  'address',
  'primaryPhone',
  'secondaryPhone',
  'township',
  'city',
  'openingHours',
] as const;

// PUT /api/shops/[id] - Update a specific shop
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ('response' in auth) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (!id) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop ID is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (
      !body ||
      typeof body !== 'object' ||
      TEXT_FIELDS.some(
        (field) => body[field] !== undefined && typeof body[field] !== 'string'
      ) ||
      (body.status !== undefined &&
        body.status !== 'active' &&
        body.status !== 'inactive')
    ) {
      const response: ShopResponse = {
        success: false,
        error: 'Invalid shop fields',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check if shop exists
    const existingShop = await getShopById(id);
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

    await updateShop(id, updateData);

    // Fetch updated shop
    const updatedShop = await getShopById(id);

    const response: ShopResponse = {
      success: true,
      data: updatedShop!,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'PUT /api/shops/[id]', 'Failed to update shop');
  }
}

// DELETE /api/shops/[id] - Delete a specific shop
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ('response' in auth) return auth.response;

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
    const existingShop = await getShopById(id);
    if (!existingShop) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    await deleteShop(id);

    const response: ShopResponse = {
      success: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'DELETE /api/shops/[id]', 'Failed to delete shop');
  }
}
