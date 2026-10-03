import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OWNER_ONLY } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { resolveActor } from "@/server/auditLog";
import { archiveTransactions } from "@/server/orders";

// POST /api/transactions/archive
//
// "Delete" one or more transactions. Nothing is destroyed: each document is
// moved to transactions_archive/{sameId} (with archivedAt/By/ByRole and the
// reason) and an auditLog entry is written, in one Firestore transaction per id.
//
// Access: Owner only (Doc: "Delete Transactions" / "Bulk Delete").
//
// Body: { ids: string[] (1-500), reason?: string }
// 200 { success: true, data: { successCount, failCount, results: [{ id, ok, data | error, status }] } }

const bodySchema = z.object({
  ids: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(1500)
        .refine((id) => !id.includes("/") && id !== "." && id !== "..", "Invalid transaction id"),
    )
    .min(1)
    .max(500),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
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
    const data = await archiveTransactions(getAdminDb(), actor, ids, parsed.data.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleRouteError(error, "POST /api/transactions/archive", "Failed to delete transactions");
  }
}
