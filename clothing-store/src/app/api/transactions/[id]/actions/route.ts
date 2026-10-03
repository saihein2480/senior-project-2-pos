import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MANAGEMENT } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { resolveActor } from "@/server/auditLog";
import { runTransactionAction } from "@/server/orders";

// POST /api/transactions/[id]/actions
//
// One endpoint for every state change on a transaction. Body:
//   { action: "<name>", ...params }   (see `bodySchema` below)
//
// Access: Owner + Manager (Doc: Refund / Cancel Transactions, Update Delivery
// Status, Handle Cancellations, Manage Return Requests, Issue Refund Payments).
//
// The server always reads the transaction fresh; nothing about the order or
// the actor is taken from the body. Responses:
//   200 { success: true, data: TransactionActionResult }
//   400 invalid body · 401/403 auth · 404 transaction missing
//   409 the order's current state does not allow this action (message says why)

const refundMethod = z.enum(["cash", "original_payment", "bank_transfer"]);
const reason = z.string().trim().max(1000);
const lineIndex = z.number().int().min(0).max(10_000);
const quantity = z.number().int().min(1).max(100_000);
const returnStatus = z.enum(["fully_returned", "partially_returned"]);
const notes = z.string().trim().max(2000);
const proofUrl = z.string().trim().max(2000);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("processRefund"),
    items: z.array(z.object({ lineIndex, quantity })).min(1).max(500),
    reason: reason.optional(),
    refundMethod: refundMethod.optional(),
    inspectionResults: z
      .array(z.object({ lineIndex, result: z.enum(["accepted", "damaged"]) }))
      .max(500)
      .optional(),
    returnStatus: z.enum(["refunded", "partially_refunded"]).optional(),
    approveRefundRequest: z.boolean().optional(),
  }),
  z.object({ action: z.literal("confirmReturnStatus"), returnStatus }),
  z.object({
    action: z.literal("confirmRefundPayment"),
    refundId: z.string().trim().min(1).max(200),
    refundMethod,
    notes: notes.optional(),
    proofUrl: proofUrl.optional(),
  }),
  z.object({ action: z.literal("cancel"), reason: reason.optional(), refundMethod: refundMethod.optional() }),
  z.object({
    action: z.literal("confirmCancellationRefund"),
    refundMethod,
    notes: notes.optional(),
    proofUrl: proofUrl.optional(),
  }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: reason.optional() }),
  z.object({
    action: z.literal("updateDeliveryStatus"),
    deliveryStatus: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
  }),
  z.object({
    action: z.literal("setStatus"),
    status: z.enum(["pending", "completed", "cancelled", "refunded", "partially_refunded"]),
  }),
  z.object({ action: z.literal("approveCancellationRequest"), refundMethod: refundMethod.optional() }),
  z.object({ action: z.literal("rejectCancellationRequest"), reason: reason.min(1, "A reason is required") }),
  z.object({ action: z.literal("approveRefundRequest") }),
  z.object({ action: z.literal("rejectRefundRequest"), reason: reason.min(1, "A reason is required") }),
  z.object({ action: z.literal("markReturnReceived"), returnStatus }),
  z.object({
    action: z.literal("completeReturnInspection"),
    lines: z
      .array(
        z.object({
          lineIndex,
          quantity,
          result: z.enum(["accepted", "damaged"]),
          damageReason: reason.optional(),
        }),
      )
      .min(1)
      .max(500),
    returnStatus: returnStatus.optional(),
  }),
]);

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

/** Firestore document ids: non-empty, no slashes, not "." / "..". */
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
    if (!isDocId(id)) return jsonError(400, "Invalid transaction id");

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return jsonError(400, describeIssue(parsed.error));

    const actor = await resolveActor(auth.caller);
    const data = await runTransactionAction(getAdminDb(), actor, id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(
      error,
      `POST /api/transactions/${id}/actions`,
      "Failed to update the transaction",
    );
  }
}
