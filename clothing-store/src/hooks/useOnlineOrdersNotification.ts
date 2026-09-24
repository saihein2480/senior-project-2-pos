import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Orders the owner has already acknowledged, stored as ids.
 *
 * The previous version stored a *count* baseline, which quietly lost
 * notifications: process one order and receive a new one and the total is
 * unchanged, so the badge stayed silent for a genuinely new order. Ids cannot
 * cancel each other out like that.
 */
const SEEN_KEY = "seenOnlineOrderIds";

/** Fired after "mark as seen" so every mounted copy of the hook agrees. */
const SEEN_EVENT = "onlineOrdersSeenLocally";

/**
 * Statuses an order can sit at while it still needs the owner to do something.
 *
 * `paid` is a QR order whose payment cleared. `pending` covers COD, which is
 * filtered further below — see `needsAttention`.
 */
const OPEN_STATUSES = ["paid", "pending"] as const;

interface OpenOrder {
  id: string;
  status: string;
  paymentMethod: string;
}

/**
 * Does this order still need the owner's attention?
 *
 * The two payment methods reach the owner in different states, which is the
 * reason this cannot be a single status check:
 *
 * - **QR / MyanMyanPay** orders are created as `pending` and only become `paid`
 *   when the gateway webhook confirms the payment. A QR order still sitting at
 *   `pending` usually means the customer never paid, so counting those would
 *   badge the owner for abandoned checkouts.
 * - **COD** orders are never "paid" online — money changes hands on delivery.
 *   `api/transactions/create-cod` writes `status: "pending"` and it stays there
 *   until the owner moves it to packaging. So a pending COD order *is* the new
 *   order, and excluding it is exactly why COD never raised a badge.
 *
 * Anything the owner has already moved on (packaging, delivering, delivered,
 * cancelled, returned) falls outside `OPEN_STATUSES` and never reaches here.
 */
function needsAttention(order: OpenOrder): boolean {
  const status = order.status.toLowerCase();
  const method = order.paymentMethod.toLowerCase();

  if (status === "paid") return true;
  return status === "pending" && method === "cod";
}

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    // Unreadable or blocked storage just means nothing is acknowledged yet.
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Storage blocked; the badge still clears for this session.
  }
}

export function useOnlineOrdersNotification() {
  const [unseenOrdersCount, setUnseenOrdersCount] = useState(0);
  /** Ids currently awaiting action, so "mark as seen" knows what to record. */
  const openOrderIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!db) return;

    const recount = () => {
      const seen = readSeenIds();
      const open = openOrderIdsRef.current;
      setUnseenOrdersCount(open.filter((id) => !seen.has(id)).length);
    };

    const q = query(
      collection(db, "onlineOrders"),
      where("status", "in", [...OPEN_STATUSES]),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const open = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            status: String(data.status || ""),
            // COD is recorded on `paymentMethod`, but older documents only
            // carry `provider`, so fall back rather than miss them.
            paymentMethod: String(data.paymentMethod || data.provider || ""),
          };
        })
        .filter(needsAttention);

      openOrderIdsRef.current = open.map((order) => order.id);

      // Drop acknowledgements for orders that have moved on, so the stored set
      // cannot grow without bound over the life of the shop.
      const stillOpen = new Set(openOrderIdsRef.current);
      const seen = readSeenIds();
      const pruned = new Set(
        Array.from(seen).filter((id) => stillOpen.has(id)),
      );
      if (pruned.size !== seen.size) writeSeenIds(pruned);

      recount();
    });

    window.addEventListener(SEEN_EVENT, recount);
    window.addEventListener("storage", recount);

    return () => {
      unsubscribe();
      window.removeEventListener(SEEN_EVENT, recount);
      window.removeEventListener("storage", recount);
    };
  }, []);

  const markAsSeen = () => {
    writeSeenIds(new Set(openOrderIdsRef.current));
    setUnseenOrdersCount(0);
    window.dispatchEvent(new Event(SEEN_EVENT));
  };

  return { unseenOrdersCount, markAsSeen };
}
