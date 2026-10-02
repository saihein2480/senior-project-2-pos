import { NextRequest, NextResponse } from "next/server";
import { OWNER_ONLY } from "@/config/rolePermissions";
import {
  handleRouteError,
  jsonError,
  requireRole,
} from "@/lib/server/apiAuth";
import {
  createStaff,
  deleteStaff,
  listStaff,
  updateStaff,
} from "@/server/staffAdmin";

// Doc: every Staff Management action (view list, add, edit, change role,
// delete) is Owner only.

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const staff = await listStaff();
    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    return handleRouteError(error, "GET /api/staff", "Failed to fetch staff");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const { email, password, displayName, role } = (body ?? {}) as Record<
      string,
      unknown
    >;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof displayName !== "string" ||
      typeof role !== "string" ||
      !email.trim() ||
      !password ||
      !displayName.trim() ||
      !role
    ) {
      return jsonError(400, "Missing required fields");
    }

    if (password.length < 6) {
      return jsonError(400, "Password must be at least 6 characters");
    }

    if (role !== "staff" && role !== "manager") {
      return jsonError(400, "Invalid role");
    }

    const staffMember = await createStaff(
      {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
      },
      auth.caller.uid,
    );

    return NextResponse.json({ success: true, data: staffMember });
  } catch (error) {
    return handleRouteError(
      error,
      "POST /api/staff",
      "Failed to create staff account",
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError(400, "ID is required");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    const updated = await updateStaff(id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(error, "PUT /api/staff", "Failed to update staff");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError(400, "ID is required");
    }

    // Removes the users doc and the Firebase Auth account.
    await deleteStaff(id, auth.caller.uid);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/staff", "Failed to delete staff");
  }
}
