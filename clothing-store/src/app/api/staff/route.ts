import { NextRequest, NextResponse } from "next/server";
import {
  createStaffAccount,
  getAllStaff,
  updateStaff,
  deleteStaff,
} from "@/services/staffService";

export async function GET(request: NextRequest) {
  try {
    const staff = await getAllStaff();
    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("Error in GET /api/staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, displayName, role } = body;

    if (!email || !password || !displayName || !role) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    if (!["staff", "manager"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 },
      );
    }

    const staffMember = await createStaffAccount({
      email,
      password,
      displayName,
      role,
    });

    return NextResponse.json({ success: true, data: staffMember });
  } catch (error: unknown) {
    console.error("Error in POST /api/staff:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create staff account",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID is required" },
        { status: 400 },
      );
    }

    const updated = await updateStaff(id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error in PUT /api/staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update staff" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID is required" },
        { status: 400 },
      );
    }

    // Delete from Firestore
    await deleteStaff(id);

    // Delete from Firebase Authentication
    try {
      const { adminAuth, isAdminInitialized } =
        await import("@/lib/firebase-admin");

      if (isAdminInitialized && adminAuth) {
        try {
          await adminAuth.deleteUser(id);
          console.log("Successfully deleted user from Firebase Auth:", id);
        } catch (authError: unknown) {
          // If user doesn't exist in Auth, that's fine - they might have been deleted already
          if (
            authError &&
            typeof authError === "object" &&
            "code" in authError &&
            authError.code === "auth/user-not-found"
          ) {
            console.log(
              "User not found in Firebase Auth (already deleted):",
              id,
            );
          } else {
            console.error("Error deleting from Firebase Auth:", authError);
          }
        }
      } else {
        console.warn(
          "Firebase Admin not initialized. User deleted from Firestore only.",
        );
      }
    } catch (authError) {
      console.error("Error deleting from Firebase Auth:", authError);
      // Continue even if auth deletion fails - Firestore is already deleted
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete staff" },
      { status: 500 },
    );
  }
}
