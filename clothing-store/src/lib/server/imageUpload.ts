/**
 * Validation shared by the image upload/delete routes that write to R2.
 *
 * The browser's `file.type` and file name are not trusted: the type is decided
 * from the file's magic bytes, the stored extension and Content-Type follow
 * from that, and the destination folder comes from a fixed allowlist. This
 * keeps SVG/HTML (which can carry script) out of the public bucket.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Upper bound for the whole multipart body, checked from Content-Length
 * before parsing. The file limit plus room for the other form fields.
 */
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 512 * 1024;

/** Root of every key this app writes; deletes outside it are refused. */
export const R2_ROOT_PREFIX = "pos-clothing-store";

export const DEFAULT_UPLOAD_FOLDER = R2_ROOT_PREFIX;

/** Folders the POS UI uploads to (ImageUpload `folder` props and pages). */
const ALLOWED_UPLOAD_FOLDERS = new Set<string>([
  R2_ROOT_PREFIX,
  `${R2_ROOT_PREFIX}/variants`,
  `${R2_ROOT_PREFIX}/groups`,
  `${R2_ROOT_PREFIX}/business-logos`,
  `${R2_ROOT_PREFIX}/invoice-footer`,
  `${R2_ROOT_PREFIX}/expenses`,
  `${R2_ROOT_PREFIX}/customers`,
]);

export type SniffedImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: "jpg" | "png" | "webp" | "gif";
};

/** Identify JPEG, PNG, WEBP or GIF from the leading bytes; null otherwise. */
export function sniffImageType(bytes: Uint8Array): SniffedImage | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  // JPEG: FF D8 FF
  if (startsWith([0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }
  // WEBP: "RIFF" <4-byte size> "WEBP"
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  // GIF: "GIF87a" / "GIF89a"
  if (startsWith([0x47, 0x49, 0x46, 0x38])) {
    return { contentType: "image/gif", extension: "gif" };
  }
  return null;
}

export type ImageReadResult =
  | { ok: true; buffer: Buffer; image: SniffedImage }
  | { ok: false; status: number; error: string };

/** Refuse obviously oversized bodies before `request.formData()` buffers them. */
export function checkUploadContentLength(
  request: Request,
): { status: number; error: string } | null {
  const header = request.headers.get("content-length");
  const length = header ? Number(header) : NaN;
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return { status: 413, error: "File size must be less than 5MB" };
  }
  return null;
}

/** Validate a multipart `file` entry: present, at most 5 MB, a real image. */
export async function readImageFile(
  entry: FormDataEntryValue | null,
): Promise<ImageReadResult> {
  if (!entry || typeof entry === "string") {
    return { ok: false, status: 400, error: "No file provided" };
  }

  if (entry.size > MAX_IMAGE_BYTES) {
    return { ok: false, status: 400, error: "File size must be less than 5MB" };
  }

  const buffer = Buffer.from(await entry.arrayBuffer());
  if (buffer.length === 0) {
    return { ok: false, status: 400, error: "No file provided" };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 400, error: "File size must be less than 5MB" };
  }

  const image = sniffImageType(buffer);
  if (!image) {
    return {
      ok: false,
      status: 400,
      error: "File must be a JPEG, PNG, WEBP or GIF image",
    };
  }

  return { ok: true, buffer, image };
}

/**
 * Map a client-supplied folder to an allowed one. Slashes are normalised and
 * any `.`/`..` segment or unknown folder falls back to the default.
 */
export function resolveUploadFolder(folder: unknown): string {
  if (typeof folder !== "string") return DEFAULT_UPLOAD_FOLDER;

  const segments = folder.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return DEFAULT_UPLOAD_FOLDER;
  }

  const normalised = segments.join("/");
  return ALLOWED_UPLOAD_FOLDERS.has(normalised)
    ? normalised
    : DEFAULT_UPLOAD_FOLDER;
}

/**
 * Name recorded with the object. Only its extension affects the key (see
 * uploadToR2), so it is built from the sniffed type plus a sanitised base.
 */
export function safeUploadFilename(base: unknown, image: SniffedImage): string {
  const cleaned =
    typeof base === "string"
      ? base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)
      : "";
  return `${cleaned || "image"}.${image.extension}`;
}

/**
 * Can this key be deleted through the API? It must sit under the app's root
 * prefix and contain no `.`/`..` segments, backslashes or control characters.
 */
export function isDeletableKey(key: string): boolean {
  if (!key.startsWith(`${R2_ROOT_PREFIX}/`)) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(key)) return false;
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return segments.length >= 2;
}
