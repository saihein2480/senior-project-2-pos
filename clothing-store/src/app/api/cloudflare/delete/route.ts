import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";
import { MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { isDeletableKey } from "@/lib/server/imageUpload";

// Access: Owner + Manager (same pages as /api/cloudflare/upload).
// Only objects under "pos-clothing-store/" can be deleted.
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const { key, url } = (body ?? {}) as { key?: unknown; url?: unknown };

    if (!key && !url) {
      return jsonError(400, "Either key or url must be provided");
    }

    // Extract key from URL if not provided directly
    let fileKey: string | undefined = typeof key === "string" ? key : undefined;
    if (!fileKey && url) {
      if (typeof url !== "string") {
        return jsonError(400, "Invalid URL format");
      }
      // Extract key from R2 URL (everything after the domain)
      try {
        const urlObj = new URL(url);
        fileKey = urlObj.pathname.substring(1); // Remove leading slash
      } catch {
        return jsonError(400, "Invalid URL format");
      }
    }

    if (!fileKey) {
      return jsonError(400, "Could not determine file key for deletion");
    }

    if (!isDeletableKey(fileKey)) {
      return jsonError(400, "This file cannot be deleted");
    }

    // Delete from R2
    await deleteFromR2(fileKey);

    return NextResponse.json({
      success: true,
      key: fileKey,
    });
  } catch (error) {
    return handleRouteError(
      error,
      "POST /api/cloudflare/delete",
      "Failed to delete image",
    );
  }
}
