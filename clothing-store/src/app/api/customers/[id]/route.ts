import { NextRequest, NextResponse } from "next/server";
import { CustomerResponse } from "@/types/customer";
import { ALL_STAFF, OWNER_ONLY } from "@/config/rolePermissions";
import { handleRouteError, requireRole } from "@/lib/server/apiAuth";
import {
  deleteCustomer,
  getCustomerById,
  updateCustomer,
  updateCustomerSchema,
} from "@/server/customersAdmin";
import { parseJson } from "@/server/validation";

// Access:
//   GET / PUT - every POS role (Doc: "Edit Customer Info"). PUT only accepts
//               profile fields; loyalty state cannot be set here.
//   DELETE    - Owner only (Doc: "Delete Customers").

// GET /api/customers/[id] - Get a specific customer by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;

    if (!id) {
      const response: CustomerResponse = {
        success: false,
        error: "Customer ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const customer = await getCustomerById(id);

    if (!customer) {
      const response: CustomerResponse = {
        success: false,
        error: "Customer not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: CustomerResponse = {
      success: true,
      data: customer,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      "GET /api/customers/[id]",
      "Failed to fetch customer",
    );
  }
}

// PUT /api/customers/[id] - Update a specific customer
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;

    if (!id) {
      const response: CustomerResponse = {
        success: false,
        error: "Customer ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const body = await parseJson(request, updateCustomerSchema, {
      invalidBodyMessage: "Update data is required",
    });

    const updatedCustomer = await updateCustomer(id, body);

    const response: CustomerResponse = {
      success: true,
      data: updatedCustomer,
      message: "Customer updated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      "PUT /api/customers/[id]",
      "Failed to update customer",
    );
  }
}

// DELETE /api/customers/[id] - Delete a specific customer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;

    if (!id) {
      const response: CustomerResponse = {
        success: false,
        error: "Customer ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    await deleteCustomer(id);

    const response: CustomerResponse = {
      success: true,
      message: "Customer deleted successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(
      error,
      "DELETE /api/customers/[id]",
      "Failed to delete customer",
    );
  }
}
