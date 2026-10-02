import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { ALL_STAFF, MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import {
  checkUploadContentLength,
  readImageFile,
  safeUploadFilename,
} from "@/lib/server/imageUpload";

const UPLOAD_TYPES = ["customer", "business-logo", "expense"] as const;
type UploadType = (typeof UPLOAD_TYPES)[number];

const FOLDER_BY_TYPE: Record<Exclude<UploadType, "business-logo">, string> = {
  customer: "pos-clothing-store/customers",
  expense: "pos-clothing-store/expenses",
};

// Access:
//   type=customer      - every POS role (Doc: "Add New Customers")
//   type=expense       - Owner + Manager (Doc: "Upload Receipts")
//   type=business-logo - not implemented (501)
export async function POST(request: NextRequest) {
  // Every caller must at least be POS staff; the per-type check follows once
  // the form has been read.
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  const tooLarge = checkUploadContentLength(request);
  if (tooLarge) return jsonError(tooLarge.status, tooLarge.error);

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError(400, "Invalid form data");
    }

    const fileEntry = formData.get("file");
    const type = formData.get("type"); // 'customer', 'expense' or 'business-logo'
    const id = formData.get("id"); // optional ID for naming

    if (!fileEntry) {
      return jsonError(400, "No file provided");
    }

    if (
      typeof type !== "string" ||
      !UPLOAD_TYPES.includes(type as UploadType)
    ) {
      return jsonError(
        400,
        'Invalid upload type. Must be "customer", "expense" or "business-logo"',
      );
    }

    if (type === "business-logo") {
      return jsonError(501, "Business logo upload not implemented with R2 yet.");
    }

    if (type === "expense" && !MANAGEMENT.includes(auth.caller.role)) {
      return jsonError(403, "You do not have permission to perform this action");
    }

    const file = await readImageFile(fileEntry);
    if (!file.ok) return jsonError(file.status, file.error);

    // Content-Type and extension come from the sniffed bytes, never from the
    // client's file.type or file name.
    const result = await uploadToR2(
      file.buffer,
      file.image.contentType,
      FOLDER_BY_TYPE[type as Exclude<UploadType, "business-logo">],
      safeUploadFilename(id, file.image),
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleRouteError(error, "POST /api/upload", "Failed to upload image");
  }
}
