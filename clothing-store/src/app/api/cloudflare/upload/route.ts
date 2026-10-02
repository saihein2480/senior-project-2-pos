import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import {
  checkUploadContentLength,
  readImageFile,
  resolveUploadFolder,
  safeUploadFilename,
} from "@/lib/server/imageUpload";

// Access: Owner + Manager. Used by ImageUpload on the stock, settings and
// expense pages, all of which are Owner + Manager only.
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
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

    const file = await readImageFile(formData.get("file"));
    if (!file.ok) return jsonError(file.status, file.error);

    // Only known folders; anything else (or a traversal attempt) falls back
    // to the default root folder.
    const folder = resolveUploadFolder(formData.get("folder"));

    // Content-Type and extension come from the sniffed bytes, never from the
    // client's file.type or file name.
    const result = await uploadToR2(
      file.buffer,
      file.image.contentType,
      folder,
      safeUploadFilename("image", file.image),
    );

    return NextResponse.json({
      success: true,
      key: result.key,
      url: result.url,
      hash: result.hash,
      width: result.width,
      height: result.height,
      size: result.size,
      contentType: result.contentType,
    });
  } catch (error) {
    return handleRouteError(
      error,
      "POST /api/cloudflare/upload",
      "Failed to upload image",
    );
  }
}
