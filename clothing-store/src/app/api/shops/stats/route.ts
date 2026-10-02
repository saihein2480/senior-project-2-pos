import { NextRequest, NextResponse } from 'next/server';
import { ShopStatsResponse } from '@/types/shop';
import { OWNER_ONLY } from '@/config/rolePermissions';
import { handleRouteError, requireRole } from '@/lib/server/apiAuth';
import { getShopStats } from '@/server/shopsAdmin';

// GET /api/shops/stats - Get shop statistics
// Doc: "View Shop Reports" - Owner only.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ('response' in auth) return auth.response;

  try {
    const stats = await getShopStats();

    const response: ShopStatsResponse = {
      success: true,
      data: stats,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      'GET /api/shops/stats',
      'Failed to fetch shop statistics',
    );
  }
}
