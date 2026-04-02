import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useOnlineOrdersNotification() {
  const [unseenOrdersCount, setUnseenOrdersCount] = useState(0);
  const totalPaidRef = useRef(0);

  useEffect(() => {
    if (!db) return;

    // Listen for orders that are successfully paid but perhaps not yet processing
    const q = query(
      collection(db, "onlineOrders"),
      where("status", "==", "paid"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const totalPaid = snapshot.docs.length;
      totalPaidRef.current = totalPaid;

      const dismissedStr = localStorage.getItem("dismissedOnlineOrdersCount");
      const dismissedCount = dismissedStr ? parseInt(dismissedStr, 10) : 0;

      if (totalPaid > dismissedCount) {
        setUnseenOrdersCount(totalPaid - dismissedCount);
      } else {
        localStorage.setItem(
          "dismissedOnlineOrdersCount",
          totalPaid.toString(),
        );
        setUnseenOrdersCount(0);
      }
    });

    const handleStorageChange = () => {
      const dismissedStr = localStorage.getItem("dismissedOnlineOrdersCount");
      const dismissedCount = dismissedStr ? parseInt(dismissedStr, 10) : 0;
      if (totalPaidRef.current > dismissedCount) {
        setUnseenOrdersCount(totalPaidRef.current - dismissedCount);
      } else {
        setUnseenOrdersCount(0);
      }
    };

    window.addEventListener("onlineOrdersSeenLocally", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener(
        "onlineOrdersSeenLocally",
        handleStorageChange,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const markAsSeen = () => {
    localStorage.setItem(
      "dismissedOnlineOrdersCount",
      totalPaidRef.current.toString(),
    );
    setUnseenOrdersCount(0);
    window.dispatchEvent(new Event("onlineOrdersSeenLocally"));
  };

  return { unseenOrdersCount, markAsSeen };
}
