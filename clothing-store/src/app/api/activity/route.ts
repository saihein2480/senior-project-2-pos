import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp, type Query } from "firebase-admin/firestore";
import { ALL_STAFF, OWNER_ONLY } from "@/config/rolePermissions";
import { handleRouteError, jsonError, requireRole } from "@/lib/server/apiAuth";
import { getAdminDb } from "@/server/adminDb";
import { AUDIT_COLLECTION, auditCaller } from "@/server/auditLog";
import { toClientJson } from "@/server/serialize";
import { parseJson, parseQuery } from "@/server/validation";

// The Activity log: who did what on the POS, from the `auditLog` collection.
//
// GET  /api/activity?cursor=<entryId>&from=<ms>&to=<ms>&limit=<1-200>
//      Owner only. Newest first, one page at a time; `nextCursor` is the id
//      to pass as `cursor` for the next page (null when there is no more).
//      Also returns the POS accounts, so the page can name people and offer
//      a "person" filter.
//
// POST /api/activity  { action: "auth.signIn" | "auth.signOut" }
//                     { action: "sale.complete", transactionDocId }
//      Every POS role. The browser reports these few events; who did them is
//      always the verified caller, never anything in the body. A sale is only
//      logged for the account that rang it up, and only once.

const POS_ROLES = ["owner", "manager", "staff"] as const;
const DEFAULT_PAGE_SIZE = 60;

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(1500).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const reportSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auth.signIn") }),
  z.object({ action: z.literal("auth.signOut") }),
  z.object({
    action: z.literal("sale.complete"),
    transactionDocId: z.string().min(1).max(1500),
  }),
]);

function isDocId(id: string): boolean {
  return !!id && id.length <= 1500 && !id.includes("/") && id !== "." && id !== "..";
}

interface ActivityPerson {
  uid: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, OWNER_ONLY);
  if ("response" in auth) return auth.response;

  try {
    const { cursor, from, to, limit } = parseQuery(request, listQuerySchema);
    const pageSize = limit ?? DEFAULT_PAGE_SIZE;
    const db = getAdminDb();
    const collection = db.collection(AUDIT_COLLECTION);

    // Range and order on the same field, so no composite index is needed.
    let query: Query = collection.orderBy("at", "desc");
    if (to !== undefined) query = query.where("at", "<=", Timestamp.fromMillis(to));
    if (from !== undefined) query = query.where("at", ">=", Timestamp.fromMillis(from));
    if (cursor && isDocId(cursor)) {
      const cursorDoc = await collection.doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const [snapshot, usersSnapshot] = await Promise.all([
      query.limit(pageSize + 1).get(),
      db.collection("users").where("role", "in", [...POS_ROLES]).get(),
    ]);

    const people: ActivityPerson[] = usersSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        name:
          (typeof data.displayName === "string" && data.displayName.trim()) ||
          (typeof data.email === "string" && data.email) ||
          doc.id,
        email: typeof data.email === "string" ? data.email : null,
        role: String(data.role),
        isActive: data.isActive !== false,
      };
    });
    const byUid = new Map(people.map((person) => [person.uid, person]));

    const docs = snapshot.docs.slice(0, pageSize);
    const entries = docs.map((doc) => {
      const data = doc.data();
      const actorUid = typeof data.actorUid === "string" ? data.actorUid : "";
      const person = byUid.get(actorUid);
      return toClientJson({
        id: doc.id,
        action: String(data.action ?? ""),
        targetCollection: data.targetCollection ?? null,
        targetId: data.targetId ?? null,
        transactionId: data.transactionId ?? null,
        actorUid,
        actorRole: data.actorRole ?? person?.role ?? null,
        // Current name first; the stored one covers removed accounts.
        actorName:
          person?.name || data.actorName || data.actorEmail || actorUid || null,
        actorEmail: data.actorEmail ?? person?.email ?? null,
        reason: data.reason ?? null,
        before: data.before ?? null,
        after: data.after ?? null,
        details: data.details ?? null,
        at:
          data.at instanceof Timestamp
            ? data.at.toDate().toISOString()
            : null,
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        entries,
        people,
        nextCursor:
          snapshot.docs.length > pageSize ? docs[docs.length - 1]?.id ?? null : null,
      },
    });
  } catch (error) {
    return handleRouteError(error, "GET /api/activity", "Failed to load activity");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ALL_STAFF);
  if ("response" in auth) return auth.response;

  try {
    const body = await parseJson(request, reportSchema);

    if (body.action === "auth.signIn" || body.action === "auth.signOut") {
      const recorded = await auditCaller(auth.caller, {
        action: body.action,
        targetCollection: "users",
        targetId: auth.caller.uid,
      });
      return NextResponse.json({ success: true, data: { recorded } });
    }

    // sale.complete: check the sale really is this caller's before saying so.
    const id = body.transactionDocId;
    if (!isDocId(id)) return jsonError(400, "Invalid transaction id");

    const snapshot = await getAdminDb().collection("transactions").doc(id).get();
    if (!snapshot.exists) return jsonError(404, "Transaction not found");
    const sale = snapshot.data() ?? {};
    if (sale.soldByUid !== auth.caller.uid) {
      return jsonError(403, "Only the account that made the sale can report it");
    }

    const items = Array.isArray(sale.items) ? sale.items : [];
    const recorded = await auditCaller(
      auth.caller,
      {
        action: "sale.complete",
        targetCollection: "transactions",
        targetId: id,
        transactionId:
          typeof sale.transactionId === "string" ? sale.transactionId : null,
        details: {
          total: Number(sale.total) || 0,
          paymentMethod: sale.paymentMethod ?? null,
          status: sale.status ?? null,
          branch: sale.branchName ?? null,
          units: items.reduce(
            (sum: number, item: { quantity?: unknown }) =>
              sum + (Number(item?.quantity) || 0),
            0,
          ),
          customer:
            sale.customer?.displayName || sale.customer?.email || null,
        },
      },
      // One entry per sale, however many times the browser reports it.
      { docId: `sale_${id}` },
    );

    return NextResponse.json({ success: true, data: { recorded } });
  } catch (error) {
    return handleRouteError(error, "POST /api/activity", "Failed to record activity");
  }
}
