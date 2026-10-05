/**
 * Append-only audit trail, shown to the owner as the Activity log.
 *
 * Every server action that changes an order writes one `auditLog` document
 * inside the same Firestore transaction as the change itself, so the log can
 * never disagree with the data: either both are committed or neither is.
 * Plain record changes (stock, customers, expenses, staff, shops, settings),
 * sign-ins and completed sales are added with `recordAudit` after the save.
 *
 * The actor is a `VerifiedActor`, which can only be built from the caller
 * that `requireRole` verified (uid from the ID token, role from users/{uid}).
 * Nothing the browser sends about who it is ends up here.
 *
 * Server only (Admin SDK). Documents are never updated or deleted by the app.
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { AuthorisedCaller } from "@/lib/firebase-admin";
import { getAdminAuth, getAdminDb } from "./adminDb";
import { stripUndefined } from "./serialize";

export const AUDIT_COLLECTION = "auditLog";

declare const verifiedBrand: unique symbol;

/** Who did it, as proven by the request's ID token. */
export type VerifiedActor = {
  readonly uid: string;
  readonly role: string;
  readonly email: string | null;
  /** Display name from Firebase Auth, when the account has one. */
  readonly name: string | null;
  /** What legacy "...By" fields show: email, else display name, else uid. */
  readonly label: string;
  readonly [verifiedBrand]: true;
};

/**
 * Build the actor from a caller `requireRole` returned.
 *
 * `email` / `displayName` are looked up from Firebase Auth by uid; a failed
 * lookup only costs the label, never the action.
 */
export async function resolveActor(caller: AuthorisedCaller): Promise<VerifiedActor> {
  let email: string | null = null;
  let displayName: string | null = null;
  try {
    const user = await getAdminAuth().getUser(caller.uid);
    email = user.email ?? null;
    displayName = user.displayName ?? null;
  } catch (error) {
    console.error(`Could not look up user ${caller.uid} for the audit log:`, error);
  }
  return actorFromVerifiedCaller(caller, email, displayName);
}

/**
 * Same as `resolveActor` when the email is already known. Only for callers
 * holding a verified `AuthorisedCaller` (and for tests).
 */
export function actorFromVerifiedCaller(
  caller: AuthorisedCaller,
  email: string | null = null,
  displayName: string | null = null,
): VerifiedActor {
  return {
    uid: caller.uid,
    role: caller.role,
    email,
    name: displayName,
    label: email || displayName || caller.uid,
  } as VerifiedActor;
}

export interface AuditEntry {
  /** e.g. "processRefund", "cancel", "archive". */
  action: string;
  targetCollection: string;
  targetId: string;
  /** Receipt number (TXN-...), when there is one. */
  transactionId?: string | null;
  actor: VerifiedActor;
  reason?: string | null;
  /** Small summary of the legacy status fields and money before the change. */
  before?: Record<string, unknown> | null;
  /** The same summary after the change. */
  after?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
}

/** The stored shape, shared by the transactional and plain writers. */
function auditDocument(entry: AuditEntry): Record<string, unknown> {
  return stripUndefined({
    action: entry.action,
    targetCollection: entry.targetCollection,
    targetId: entry.targetId,
    transactionId: entry.transactionId ?? null,
    actorUid: entry.actor.uid,
    actorRole: entry.actor.role,
    actorEmail: entry.actor.email ?? undefined,
    // Kept on the entry so the Activity log still names people whose
    // account was later removed.
    actorName: entry.actor.name ?? undefined,
    reason: entry.reason ?? undefined,
    before: entry.before ?? null,
    after: entry.after ?? null,
    details: entry.details,
    at: FieldValue.serverTimestamp(),
  });
}

/**
 * Write one audit document inside `tx`. Call it in the write phase (after
 * every `tx.get`), like any other write.
 */
export function appendAudit(
  tx: Transaction,
  entry: AuditEntry,
  db: Firestore = getAdminDb(),
): DocumentReference {
  const ref = db.collection(AUDIT_COLLECTION).doc();
  tx.create(ref, auditDocument(entry));
  return ref;
}

/** Firestore's ALREADY_EXISTS, returned when an idempotent id is reused. */
const ALREADY_EXISTS = 6;

/**
 * Write one audit document outside a transaction.
 *
 * For the plain create/update/delete routes (stocks, customers, expenses,
 * staff, shops, settings) and the Activity log's own events. It runs after
 * the change has been saved, so it never throws: a failed log line must not
 * turn a successful save into an error for the user.
 *
 * `docId` makes the write idempotent (a second write with the same id is
 * ignored), e.g. one "sale completed" entry per sale however often the
 * browser reports it. Resolves to whether an entry was written.
 */
export async function recordAudit(
  entry: AuditEntry,
  options: { docId?: string } = {},
): Promise<boolean> {
  try {
    const collection = getAdminDb().collection(AUDIT_COLLECTION);
    const ref = options.docId ? collection.doc(options.docId) : collection.doc();
    await ref.create(auditDocument(entry));
    return true;
  } catch (error) {
    if ((error as { code?: unknown })?.code === ALREADY_EXISTS) return false;
    console.error(`Could not write audit entry "${entry.action}":`, error);
    return false;
  }
}

/**
 * `resolveActor` + `recordAudit` for a caller `requireRole` returned: the
 * one line each CRUD route adds after a successful change. Never throws.
 */
export async function auditCaller(
  caller: AuthorisedCaller,
  entry: Omit<AuditEntry, "actor">,
  options: { docId?: string } = {},
): Promise<boolean> {
  try {
    const actor = await resolveActor(caller);
    return await recordAudit({ ...entry, actor }, options);
  } catch (error) {
    console.error(`Could not write audit entry "${entry.action}":`, error);
    return false;
  }
}
