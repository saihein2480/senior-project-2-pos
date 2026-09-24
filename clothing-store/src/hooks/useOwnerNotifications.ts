import { useCallback, useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type OwnerNotificationType =
  | "online_order"
  | "cancellation_request"
  | "refund_request"
  | "refund_payment"
  | "low_stock"
  | "out_of_stock";

/**
 * The notification types meant for the owner/staff POS.
 *
 * The `notifications` collection is shared with customer-facing notifications,
 * which carry a `userId` and types this UI does not route. Anything outside this
 * set belongs to the storefront and must not reach the POS bell.
 */
export const OWNER_NOTIFICATION_TYPES = new Set<OwnerNotificationType>([
  "online_order",
  "cancellation_request",
  "refund_request",
  "refund_payment",
  "low_stock",
  "out_of_stock",
]);

/** Fired when the bell is opened, so every mounted badge clears together. */
const SEEN_EVENT = "ownerNotificationsSeen";

function storageKey(userKey?: string) {
  return userKey ? `notificationsSeenAt_${userKey}` : "notificationsSeenAt";
}

function readSeenAt(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    // Private browsing can refuse localStorage; treat everything as unseen.
    return 0;
  }
}

/**
 * When a notification was created, in epoch ms.
 *
 * A document written with `serverTimestamp()` reports `null` until the server
 * resolves it. Those are treated as "just now" so a brand-new notification
 * counts as unseen rather than being silently skipped.
 */
function createdAtMs(data: Record<string, unknown>): number {
  const value = data?.createdAt as
    | { toDate?: () => Date }
    | string
    | null
    | undefined;

  if (value && typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {
      return Date.now();
    }
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  return Date.now();
}

/**
 * Unread-notification count for the top bar bell, and a way to clear it.
 *
 * The badge counts unread owner notifications the user has not yet acknowledged
 * by opening the bell. Acknowledgement is stored as a per-user "seen at"
 * timestamp rather than by flipping each document's `read` flag, for two
 * reasons: opening the bell should not silently discard which items are new (the
 * dropdown and the notifications page both still highlight unread ones and offer
 * an explicit "Mark all as read"), and the badge must stay cleared across page
 * navigations instead of reappearing on the next mount.
 */
export function useOwnerNotificationBadge(userKey?: string) {
  const key = storageKey(userKey);
  const [unseenCount, setUnseenCount] = useState(0);

  /** Creation times of the unread owner notifications currently in Firestore. */
  const unreadTimesRef = useRef<number[]>([]);

  const recount = useCallback(() => {
    const seenAt = readSeenAt(key);
    setUnseenCount(
      unreadTimesRef.current.filter((time) => time > seenAt).length,
    );
  }, [key]);

  useEffect(() => {
    if (!db) return;

    const unreadQuery = query(
      collection(db, "notifications"),
      where("read", "==", false),
    );

    const unsubscribe = onSnapshot(
      unreadQuery,
      (snapshot) => {
        const times: number[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;

          // Skip customer-facing notifications. The badge used to count these,
          // so it could show a higher number than the dropdown ever listed.
          if (data.userId) return;
          if (
            !OWNER_NOTIFICATION_TYPES.has(data.type as OwnerNotificationType)
          ) {
            return;
          }

          times.push(createdAtMs(data));
        });

        unreadTimesRef.current = times;
        recount();
      },
      (error) => {
        console.error("Error watching owner notifications:", error);
      },
    );

    return unsubscribe;
  }, [recount]);

  // Follow acknowledgement from other components in this tab and other tabs.
  useEffect(() => {
    const handle = () => recount();
    window.addEventListener(SEEN_EVENT, handle);
    window.addEventListener("storage", handle);
    return () => {
      window.removeEventListener(SEEN_EVENT, handle);
      window.removeEventListener("storage", handle);
    };
  }, [recount]);

  const markAllSeen = useCallback(() => {
    // `Date.now()` is included so a notification whose server timestamp has not
    // resolved yet is still covered and cannot pop back into the badge once it
    // does; the recorded times cover the case where the server clock runs ahead.
    const latest = Math.max(Date.now(), ...unreadTimesRef.current);

    try {
      localStorage.setItem(key, String(latest));
    } catch {
      // The badge still clears for this session even if it can't persist.
    }

    setUnseenCount(0);
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [key]);

  return { unseenCount, markAllSeen };
}
