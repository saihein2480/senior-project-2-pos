/**
 * "Delete" for transactions: financial records are never destroyed.
 *
 * In one Firestore transaction the document is copied to
 * `transactions_archive/{sameId}` with who archived it and why, the original
 * is removed from `transactions` (so every page stops showing it), and an
 * audit entry is appended. Owner only (enforced by the route).
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { auditSnapshot } from "@/lib/orderState";
import { ApiError, isApiError } from "@/server/errors";
import { appendAudit, type VerifiedActor } from "@/server/auditLog";
import { TRANSACTIONS } from "./context";
import type { BulkResult } from "./types";

export const TRANSACTIONS_ARCHIVE = "transactions_archive";

export interface ArchiveResult {
  id: string;
  transactionId: string | null;
  archivedTo: string;
}

export async function archiveTransaction(
  db: Firestore,
  actor: VerifiedActor,
  id: string,
  reason?: string,
): Promise<ArchiveResult> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(TRANSACTIONS).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Transaction not found");
    const data = snap.data() ?? {};
    const archiveRef = db.collection(TRANSACTIONS_ARCHIVE).doc(id);

    tx.set(archiveRef, {
      ...data,
      archivedAt: FieldValue.serverTimestamp(),
      archivedBy: actor.label,
      archivedByUid: actor.uid,
      archivedByRole: actor.role,
      archiveReason: reason || null,
    });
    tx.delete(ref);
    appendAudit(
      tx,
      {
        action: "archive",
        targetCollection: TRANSACTIONS,
        targetId: id,
        transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
        actor,
        reason: reason || null,
        before: auditSnapshot(data),
        after: null,
        details: { archivedTo: archiveRef.path, onlineOrderId: data.onlineOrderId ?? null },
      },
      db,
    );

    return {
      id,
      transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
      archivedTo: archiveRef.path,
    };
  });
}

/** One transaction per id; reports success/fail counts like the old bulk delete. */
export async function archiveTransactions(
  db: Firestore,
  actor: VerifiedActor,
  ids: string[],
  reason?: string,
): Promise<BulkResult<ArchiveResult>> {
  const results: BulkResult<ArchiveResult>["results"] = [];
  for (const id of ids) {
    try {
      results.push({ id, ok: true, data: await archiveTransaction(db, actor, id, reason) });
    } catch (error) {
      if (!isApiError(error)) console.error(`Failed to archive transaction ${id}:`, error);
      results.push({
        id,
        ok: false,
        error: isApiError(error) ? error.message : "Failed to archive this transaction",
        status: isApiError(error) ? error.status : 500,
      });
    }
  }
  const successCount = results.filter((r) => r.ok).length;
  return { successCount, failCount: results.length - successCount, results };
}
