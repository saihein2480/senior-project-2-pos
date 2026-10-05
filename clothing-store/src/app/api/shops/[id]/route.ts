import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import { parseJson, validate } from '@/server/validation';
import { auditCaller } from '@/server/auditLog';

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

const INVALID_SHOP_FIELDS = 'Invalid shop fields';

/** A text field PUT accepts: a string when present (null is not "absent"). */
const shopText = z.string({ error: INVALID_SHOP_FIELDS }).optional();

/** PUT body: only these fields are applied, each optional. */
const updateShopSchema = z.object(
  {
    name: shopText,
    address: shopText,
    primaryPhone: shopText,
    secondaryPhone: shopText,
    township: shopText,
    city: shopText,
    openingHours: shopText,
    status: z
      .enum(['active', 'inactive'], { error: INVALID_SHOP_FIELDS })
      .optional(),
  },
  { error: INVALID_SHOP_FIELDS },
);

/** Edit-form phone format: starts with 09, 9-11 digits. */
const EDIT_PHONE_PATTERN = /^09\d{7,9}$/;

/**
 * Phone formats, checked after the shop is known to exist (a missing shop is
 * a 404 even when the phone is also wrong). Empty values are not checked:
 * an empty secondaryPhone clears it.
 */
const updateShopPhonesSchema = z.object({
  primaryPhone: z
    .string()
    .optional()
    .refine(
      (phone) => !phone || EDIT_PHONE_PATTERN.test(phone),
      'Invalid primary phone number format. Must start with 09 and be 9-11 digits long',
    ),
  secondaryPhone: z
    .string()
    .optional()
    .refine(
      (phone) => !phone || phone.trim() === '' || EDIT_PHONE_PATTERN.test(phone),
      'Invalid secondary phone number format. Must start with 09 and be 9-11 digits long',
    ),
});

// PUT /api/shops/[id] - Update a specific shop
export async function PUT(
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

    const body = await parseJson(request, updateShopSchema, {
      invalidBodyMessage: INVALID_SHOP_FIELDS,
    });

    // Check if shop exists
    const existingShop = await getShopById(id);
    if (!existingShop) {
      const response: ShopResponse = {
        success: false,
        error: 'Shop not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    validate(body, updateShopPhonesSchema);

    // A blank name would leave the branch unmatchable by name and push the
    // real name into formerNames, so it is refused rather than stored.
    if (body.name !== undefined && body.name.trim() === '') {
      const response: ShopResponse = {
        success: false,
        error: 'Shop name is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Prepare update data (only include fields that are provided).
    // Renames are handled by updateShop: the old name is kept in
    // `formerNames` and a business default naming this shop follows it.
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

    await auditCaller(auth.caller, {
      action: 'shop.update',
      targetCollection: 'shops',
      targetId: id,
      details: {
        name: updatedShop?.name ?? existingShop.name,
        // A rename is worth seeing at a glance.
        ...(updateData.name && updateData.name !== existingShop.name
          ? { renamedFrom: existingShop.name }
          : {}),
        fields: Object.keys(updateData),
      },
    });

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

    await auditCaller(auth.caller, {
      action: 'shop.delete',
      targetCollection: 'shops',
      targetId: id,
      details: { name: existingShop.name },
    });

    const response: ShopResponse = {
      success: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'DELETE /api/shops/[id]', 'Failed to delete shop');
  }
}
