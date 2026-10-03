import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { resolveActor } from "@/server/auditLog";
import { setOnlineOrderPaymentStatus, setOnlineOrderStatus } from "@/server/orders";

// POST /api/online-orders/[id]/actions
//
// Body:
//   { action: "setStatus", status: "pending" | "packaging" | "delivering" |
//       "delivered" | "cancelled" | "fully_returned" | "partially_returned" }
//   { action: "setPaymentStatus", paymentStatus: "SUCCESS" | "PENDING" }   (COD only)
//
// Access: Owner + Manager (Doc: "Update Order Status", "Process Orders").
// 200 { success: true, data: OnlineOrderActionResult } · 400 · 404 · 409 invalid transition

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setStatus"),
    status: z.enum([
      "pending",
      "packaging",
      "delivering",
      "delivered",
      "cancelled",
      "fully_returned",
      "partially_returned",
    ]),
  }),
  z.object({
    action: z.literal("setPaymentStatus"),
    paymentStatus: z.enum(["SUCCESS", "PENDING"]),
  }),
]);

function isDocId(id: string): boolean {
  return !!id && id.length <= 1500 && !id.includes("/") && id !== "." && id !== "..";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, MANAGEMENT);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  try {
    if (!isDocId(id)) return jsonError(400, "Invalid order id");

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
    const db = getAdminDb();
    const data =
      parsed.data.action === "setStatus"
        ? await setOnlineOrderStatus(db, actor, id, parsed.data.status)
        : await setOnlineOrderPaymentStatus(db, actor, id, parsed.data.paymentStatus);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(error, `POST /api/online-orders/${id}/actions`, "Failed to update the order");
  }
}
