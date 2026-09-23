/**
 * Notify one customer about their own order, cancellation, return or refund —
 * by email and Telegram.
 *
 * Same shape as `customer-campaign`: the browser calls this, the route holds the
 * shared secret and forwards to the storefront app. Staff are allowed here
 * (they update delivery status and process sales) but not on campaigns.
 *
 * POST /api/notifications/customer-event
 *   headers: Authorization: Bearer <firebase id token>
 *   body:    { customerId, type, order: { orderRef, totalAmount, ... }, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { authoriseRole, isAuthorisationFailure } from "@/lib/firebase-admin";
import { notifyCustomer } from "@/lib/customerNotify";

export async function POST(request: NextRequest) {
  // Doc: "Update Delivery Status" is Owner + Manager, but Staff process sales,
  // so every POS role may trigger a transactional message about one order.
  const caller = await authoriseRole(request, ["owner", "manager", "staff"]);
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

  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";

  if (!customerId) {
    return NextResponse.json(
      { success: false, error: "customerId is required" },
      { status: 400 },
    );
  }

  const outcome = await notifyCustomer({ ...body, customerId });

  if (!outcome.ok) {
    return NextResponse.json(
      { success: false, error: outcome.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: outcome.result });
}
