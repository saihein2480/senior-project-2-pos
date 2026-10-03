/**
 * Collects the writes of one order action so they can all be applied at the
 * end of the transaction, after every read.
 *
 * Several parts of an action can touch the same document (the action's own
 * fields, the legacy status fields, the stock-returns ledger when the ledger
 * lives on that same document). `update` merges those into ONE update per
 * document instead of issuing several.
 */

import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { stripUndefined } from "@/server/serialize";

type Op =
  | { kind: "create"; ref: DocumentReference; data: Record<string, unknown> }
  | { kind: "set"; ref: DocumentReference; data: Record<string, unknown> }
  | { kind: "delete"; ref: DocumentReference };

export class TxWriteSet {
  private readonly updates = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
  private readonly ops: Op[] = [];

  /** Merge `data` (field paths allowed) into the pending update of `ref`. */
  update(ref: DocumentReference, data: Record<string, unknown> | null | undefined): void {
    if (!data || Object.keys(data).length === 0) return;
    const existing = this.updates.get(ref.path);
    if (existing) Object.assign(existing.data, data);
    else this.updates.set(ref.path, { ref, data: { ...data } });
  }

  create(ref: DocumentReference, data: Record<string, unknown>): void {
    this.ops.push({ kind: "create", ref, data });
  }

  set(ref: DocumentReference, data: Record<string, unknown>): void {
    this.ops.push({ kind: "set", ref, data });
  }

  delete(ref: DocumentReference): void {
    this.ops.push({ kind: "delete", ref });
  }

  /** The pending update for `ref`, if any (for building audit snapshots). */
  pendingUpdate(ref: DocumentReference): Record<string, unknown> | undefined {
    return this.updates.get(ref.path)?.data;
  }

  commit(tx: Transaction): void {
    for (const { ref, data } of this.updates.values()) {
      tx.update(ref, stripUndefined(data));
    }
    for (const op of this.ops) {
      if (op.kind === "create") tx.create(op.ref, stripUndefined(op.data));
      else if (op.kind === "set") tx.set(op.ref, stripUndefined(op.data));
      else tx.delete(op.ref);
    }
  }
}

/**
 * `data` with an update applied, field paths ("a.b") included. Used to
 * derive the order's state after an action before anything is written.
 */
export function withUpdates<T extends Record<string, unknown>>(
  data: T,
  updates: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...data };
  for (const [path, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const parts = path.split(".");
    let cursor: Record<string, unknown> = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const next = cursor[key];
      const copy =
        next && typeof next === "object" && !Array.isArray(next)
          ? { ...(next as Record<string, unknown>) }
          : {};
      cursor[key] = copy;
      cursor = copy;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return out as T;
}
