/**
 * Announce a promotion or a set of loyalty coupon packages to every opted-in
 * customer, by email and Telegram.
 *
 * The owner's browser calls this route; the route holds `NOTIFY_API_SECRET` and
 * forwards to the storefront app, which owns the mail transport and the bot.
 * The secret therefore never ships to the client.
 *
 * Authorisation is checked here rather than relying on the React permission
 * matrix: one request can mail the whole customer list, so "Create Promotions
 * is Owner + Manager only" has to hold on the server too.
 *
 * POST /api/notifications/customer-campaign
 *   headers: Authorization: Bearer <firebase id token>
 *   body:    { type: "promotion_created", promotion: {...} }
 *          | { type: "coupon_packages_published", couponPackages: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import { authoriseRole, isAuthorisationFailure } from "@/lib/firebase-admin";
import { broadcastToCustomers } from "@/lib/customerNotify";

const CAMPAIGN_TYPES = ["promotion_created", "coupon_packages_published"];

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Doc: "Create Promotions" / "Loyalty Program" - Owner + Manager.
  const caller = await authoriseRole(request, ["owner", "manager"]);
  if (isAuthorisationFailure(caller)) {
    return NextResponse.json(
      { success: false, error: caller.error },
      { status: caller.status },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.type !== "string" || !CAMPAIGN_TYPES.includes(body.type)) {
    return NextResponse.json(
      {
        success: false,
        error: `type must be one of: ${CAMPAIGN_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const outcome = await broadcastToCustomers(body);

  if (!outcome.ok) {
    // 502: the POS did its part, the downstream notification service did not.
    return NextResponse.json(
      { success: false, error: outcome.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: outcome.result });
}
