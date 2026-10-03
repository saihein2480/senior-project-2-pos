import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { drainNotificationOutbox, OUTBOX_DRAIN_LIMIT } from "@/server/notificationOutbox";

// GET | POST /api/cron/notification-outbox[?limit=25]
//
// Delivers customer email/Telegram messages that are still waiting in
// `notificationOutbox` (the post-commit attempt failed or timed out), oldest
// first. Each item is leased in a Firestore transaction, so overlapping runs
// never send the same message twice; after 5 failed attempts it is "dead".
//
// Auth: `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends exactly that
// header when CRON_SECRET is set on the project (see vercel.json); any other
// scheduler must send it too. 401 otherwise, including when CRON_SECRET is unset.
//
//   200 { success: true, data: { scanned, sent, failed, dead, skipped, deferred } }

export const maxDuration = 60;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time check (hashing first also hides the secret's length). */
function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

async function handle(request: NextRequest) {
  if (!isAuthorised(request)) return jsonError(401, "Not authorised");

  try {
    const raw = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : OUTBOX_DRAIN_LIMIT;
    const data = await drainNotificationOutbox(getAdminDb(), { limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(error, "/api/cron/notification-outbox", "Failed to process the notification outbox");
  }
}

export const GET = handle;
export const POST = handle;
