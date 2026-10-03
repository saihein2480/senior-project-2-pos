import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { resolveActor } from "@/server/auditLog";
import { setOnlineOrderStatuses } from "@/server/orders";

// POST /api/online-orders/bulk-status
//
// Body: { ids: string[] (1-200), status: <same values as /api/online-orders/[id]/actions setStatus> }
// One Firestore transaction per order; a refused order does not stop the others.
// Access: Owner + Manager.
// 200 { success: true, data: { successCount, failCount, results: [{ id, ok, data | error, status }] } }

const bodySchema = z.object({
  ids: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(1500)
        .refine((id) => !id.includes("/") && id !== "." && id !== "..", "Invalid order id"),
    )
    .min(1)
    .max(200),
  status: z.enum([
    "pending",
    "packaging",
    "delivering",
    "delivered",
    "cancelled",
    "fully_returned",
    "partially_returned",
  ]),
});

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(
        400,
        issue ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Invalid request body",
      );
    }

    const actor = await resolveActor(auth.caller);
    const ids = Array.from(new Set(parsed.data.ids));
    const data = await setOnlineOrderStatuses(getAdminDb(), actor, ids, parsed.data.status);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(error, "POST /api/online-orders/bulk-status", "Failed to update orders");
  }
}
