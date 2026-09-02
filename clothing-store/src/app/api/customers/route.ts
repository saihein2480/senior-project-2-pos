import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/services/customerService';
import { CustomerListResponse, CustomerFilters, CreateCustomerRequest } from '@/types/customer';

// GET /api/customers - Get all customers or filtered customers
export async function GET(request: NextRequest) {
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
      customers = await CustomerService.getAllCustomers();
    } else {
      customers = await CustomerService.getCustomersWithFilters(filters);
    }

    const response: CustomerListResponse = {
      success: true,
      data: customers,
      total: customers.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/customers:', error);
    const response: CustomerListResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch customers',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateCustomerRequest = await request.json();
    
    const customer = await CustomerService.createCustomer(body);
    
    return NextResponse.json({
      success: true,
      data: customer
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create customer' },
      { status: 500 }
    );
  }
}