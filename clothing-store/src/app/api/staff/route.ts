import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import { parseJson, parseQuery } from "@/server/validation";

// Doc: every Staff Management action (view list, add, edit, change role,
// delete) is Owner only.

const MISSING_FIELDS = "Missing required fields";
const STAFF_ROLES = ["staff", "manager"] as const;

/**
 * POST body. Presence of all four fields is checked before the password
 * length and the role, so a half-filled form keeps getting "Missing required
 * fields" first, as it always has. Email and display name are trimmed; the
 * password is taken as typed.
 */
const createStaffSchema = z
  .object(
    {
      email: z.string({ error: MISSING_FIELDS }).trim().min(1, MISSING_FIELDS),
      password: z.string({ error: MISSING_FIELDS }).min(1, MISSING_FIELDS),
      displayName: z
        .string({ error: MISSING_FIELDS })
        .trim()
        .min(1, MISSING_FIELDS),
      role: z.string({ error: MISSING_FIELDS }).min(1, MISSING_FIELDS),
    },
    { error: MISSING_FIELDS },
  )
  .pipe(
    z.object({
      email: z.string(),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters"),
      displayName: z.string(),
      role: z.enum(STAFF_ROLES, { error: "Invalid role" }),
    }),
  );

/** PUT body: the fields updateStaff accepts, with its messages. */
const updateStaffSchema = z.object({
  displayName: z
    .string({ error: "displayName must be a non-empty string" })
    .trim()
    .min(1, "displayName must be a non-empty string")
    .optional(),
  isActive: z.boolean({ error: "isActive must be a boolean" }).optional(),
  currentBranch: z
    .string({ error: "currentBranch must be a string" })
    .optional(),
  role: z.enum(STAFF_ROLES, { error: "Invalid role" }).optional(),
});

const staffIdQuerySchema = z.object({
  id: z.string({ error: "ID is required" }).min(1, "ID is required"),
});

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
    const input = await parseJson(request, createStaffSchema, {
      invalidBodyMessage: MISSING_FIELDS,
    });

    const staffMember = await createStaff(input, auth.caller.uid);

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
    const { id } = parseQuery(request, staffIdQuerySchema);
    const body = await parseJson(request, updateStaffSchema);

    // updateStaff applies the same whitelist and answers "No editable
    // fields provided" when nothing above was sent.
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
