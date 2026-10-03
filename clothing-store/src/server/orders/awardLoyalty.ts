/**
 * Loyalty points for a completed walk-in sale
 * (POST /api/transactions/[id]/award-loyalty).
 *
 * The sell screen calls this right after recordSale. It is idempotent: the
 * award is recorded on the transaction as `loyaltyAward` in the same Firestore
 * transaction as the points, so a retry, a double click or a later
 * approval never awards twice. Pending (scan/COD) sales are awarded by the
 * approve/delivered action instead (finishAction).
 */

import type { Firestore } from "firebase-admin/firestore";
import { appendAudit, type VerifiedActor } from "@/server/auditLog";
import {
  customerUpdateFor,
  loyaltyAuditDetails,
  planLoyaltyChanges,
  type AwardSkipReason,
} from "@/server/loyaltyAdmin";
import { loadTransactionContext, stateOf, toApiError, TRANSACTIONS } from "./context";

export type AwardLoyaltyReason =
  | AwardSkipReason
  | "not_completed"
  | "not_walk_in";

export interface AwardLoyaltyResult {
  /** True only when this call awarded the points. */
  awarded: boolean;
  /** Points this call awarded (0 otherwise). */
  points: number;
  /** Why nothing was awarded. */
  reason?: AwardLoyaltyReason;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function awardSaleLoyalty(
  db: Firestore,
  actor: VerifiedActor,
  id: string,
): Promise<AwardLoyaltyResult> {
  try {
    return await db.runTransaction(async (tx): Promise<AwardLoyaltyResult> => {
      const ctx = await loadTransactionContext(db, tx, actor, id);
      const state = stateOf(ctx);

      const buyer = ctx.data.customer?.uid;
      if (typeof buyer !== "string" || !buyer) return { awarded: false, points: 0, reason: "no_customer" };
      if (state.channel !== "walk_in") return { awarded: false, points: 0, reason: "not_walk_in" };
      if (lower(ctx.data.status) !== "completed" || state.cancelled) {
        return { awarded: false, points: 0, reason: "not_completed" };
      }

      const plan = planLoyaltyChanges({
        docId: ctx.id,
        before: ctx.data,
        after: ctx.data,
        beforeState: state,
        afterState: state,
        settings: ctx.loyaltySettings,
        customer: ctx.loyaltyCustomer,
        now: ctx.now,
        action: "awardLoyalty",
        forceAwardSource: "pos_sale",
      });
      if (!plan.award) {
        return { awarded: false, points: 0, reason: plan.awardSkipped ?? "already_awarded" };
      }

      ctx.writes.update(ctx.ref, plan.txnUpdates);
      const customerUpdate = customerUpdateFor(plan);
      if (customerUpdate && ctx.loyaltyCustomer) ctx.writes.update(ctx.loyaltyCustomer.ref, customerUpdate);
      ctx.writes.commit(tx);
      appendAudit(
        tx,
        {
          action: "awardLoyalty",
          targetCollection: TRANSACTIONS,
          targetId: ctx.id,
          transactionId: typeof ctx.data.transactionId === "string" ? ctx.data.transactionId : null,
          actor: ctx.actor,
          details: { loyalty: loyaltyAuditDetails(plan), customerId: ctx.loyaltyCustomer?.id ?? null },
        },
        db,
      );
      return { awarded: true, points: plan.award.points };
    });
  } catch (error) {
    throw toApiError(error);
  }
}
