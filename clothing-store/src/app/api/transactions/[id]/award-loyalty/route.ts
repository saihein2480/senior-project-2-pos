import { NextRequest, NextResponse } from "next/server";
import { ALL_STAFF } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { resolveActor } from "@/server/auditLog";
import { awardSaleLoyalty } from "@/server/orders";

// POST /api/transactions/[id]/award-loyalty      (no body)
//
// [id] is the transactions/{id} document id (recordSale returns it as `id`).
// Awards the sale's loyalty points to `customer.uid`, once: only a walk-in
// sale whose status is "completed" qualifies, and a sale that already carries
// `loyaltyAward` (or a legacy pointsHistory entry) is left alone. Pending
// scan/COD sales are awarded when they are approved instead.
//
// Access: every active POS role (Owner, Manager, Staff): staff ring up sales.
//
//   200 { success: true, data: { awarded: boolean, points: number, reason?: string } }
//       reason when not awarded: no_customer | not_walk_in | not_completed |
//       already_awarded | legacy_awarded | customer_not_found |
//       loyalty_disabled | below_minimum | no_points_configured
//   400 invalid id · 401/403 auth · 404 transaction missing

function isDocId(id: string): boolean {
  return !!id && id.length <= 1500 && !id.includes("/") && id !== "." && id !== "..";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  try {
    if (!isDocId(id)) return jsonError(400, "Invalid transaction id");
    const actor = await resolveActor(auth.caller);
    const data = await awardSaleLoyalty(getAdminDb(), actor, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(
      error,
      `POST /api/transactions/${id}/award-loyalty`,
      "Failed to award loyalty points",
    );
  }
}
