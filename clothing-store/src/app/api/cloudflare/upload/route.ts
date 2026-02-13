import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = formData.get("folder") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Allow caller to force upload (bypass duplicate detection)
    const forceFlag = (formData.get("force") as string) === "true";

    // Upload to Cloudflare R2 (with duplicate detection unless forced)
    const result = await uploadToR2(
      buffer,
      file.type,
      folder,
      file.name,
      forceFlag,
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
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload image",
        success: false,
      },
      { status: 500 }
    );
  }
}
