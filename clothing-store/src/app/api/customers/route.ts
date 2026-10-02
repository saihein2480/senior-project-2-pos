import { NextRequest, NextResponse } from 'next/server';
import { CustomerListResponse, CustomerFilters } from '@/types/customer';
import { ALL_STAFF } from '@/config/rolePermissions';
import { handleRouteError, jsonError, requireRole } from '@/lib/server/apiAuth';
import {
  createCustomer,
  getAllCustomers,
  getCustomersWithFilters,
} from '@/server/customersAdmin';

// Access: every POS role (Doc: "View Customer List" / "Add New Customers").

// GET /api/customers - Get all customers or filtered customers
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ('response' in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    
    // Extract filter parameters
    const filters: CustomerFilters = {
      customerType: searchParams.get('customerType') as 'retailer' | 'wholesaler' | 'distributor' | 'individual' | 'other' | undefined,
      search: searchParams.get('search') || undefined,
      customerSource: searchParams.get('customerSource') as 'pos' | 'online' | 'all' | undefined,
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof CustomerFilters] === undefined) {
        delete filters[key as keyof CustomerFilters];
      }
    });

    let customers;
    
    // If no filters, get all customers
    if (Object.keys(filters).length === 0) {
      customers = await getAllCustomers();
    } else {
      customers = await getCustomersWithFilters(filters);
    }

    const response: CustomerListResponse = {
      success: true,
      data: customers,
      total: customers.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'GET /api/customers', 'Failed to fetch customers');
  }
}

// POST /api/customers - Create a POS customer
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonError(400, 'Invalid JSON body');
    }

    const customer = await createCustomer(body);
    
    return NextResponse.json({
      success: true,
      data: customer
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'POST /api/customers', 'Failed to create customer');
  }
}
