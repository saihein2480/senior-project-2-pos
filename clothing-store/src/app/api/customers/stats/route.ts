import { NextRequest, NextResponse } from 'next/server';
import { CustomerStatsResponse } from '@/types/customer';
import { ALL_STAFF } from '@/config/rolePermissions';
import { handleRouteError, requireRole } from '@/lib/server/apiAuth';
import { getCustomerStats } from '@/server/customersAdmin';

// GET /api/customers/stats - Get customer statistics
// Access: every POS role (shown on the customers page, which all roles open).
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ('response' in auth) return auth.response;

  try {
    const stats = await getCustomerStats();

    const response: CustomerStatsResponse = {
      success: true,
      data: stats,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      'GET /api/customers/stats',
      'Failed to fetch customer statistics',
    );
  }
}
