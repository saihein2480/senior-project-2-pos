import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, doc, Timestamp } from "firebase/firestore";

/**
 * Admin API to fix old refunded transactions
 * Updates status to "refunded" and sets proper orderStatus
 * 
 * Usage: POST http://localhost:3000/api/admin/fix-refund-status
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json(
        { error: "Database not initialized" },
        { status: 500 }
      );
    }

    const transactionsRef = collection(db, "transactions");
    const snapshot = await getDocs(transactionsRef);
    
    let updatedCount = 0;
    const updates: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const transactionId = docSnap.id;
      
      // Check if this transaction has a completed cancellation refund
      if (data.cancellationRefund?.status === "completed") {
        const currentStatus = data.status || "";
        const currentOrderStatus = data.orderStatus || "pending";
        
        // Only update if status is not already "refunded"
        if (currentStatus !== "refunded") {
          const wasDelivered = currentOrderStatus === "delivered" || currentOrderStatus === "delivering";
          const newOrderStatus = wasDelivered ? "returned" : "cancelled";
          
          await updateDoc(doc(db, "transactions", transactionId), {
            status: "refunded",
            orderStatus: newOrderStatus,
          });
          
          updatedCount++;
          updates.push(`${data.transactionId}: status ${currentStatus} → refunded, orderStatus ${currentOrderStatus} → ${newOrderStatus}`);
        }
      }
      
      // Check if this transaction has completed partial refunds
      if (data.refunds && Array.isArray(data.refunds)) {
        const completedRefunds = data.refunds.filter((r: any) => r.status === "completed");
        
        if (completedRefunds.length > 0) {
          const totalRefunded = completedRefunds.reduce((sum: number, r: any) => sum + (r.totalAmount || 0), 0);
          const transactionTotal = data.total || 0;
          
          const isFullyRefunded = totalRefunded >= transactionTotal;
          const isPartiallyRefunded = totalRefunded > 0 && totalRefunded < transactionTotal;
          
          let needsUpdate = false;
          const updateData: any = {};
          
          if (isFullyRefunded && data.status !== "refunded") {
            const currentOrderStatus = data.orderStatus || "pending";
            const wasDelivered = currentOrderStatus === "delivered" || currentOrderStatus === "delivering";
            const newOrderStatus = wasDelivered ? "returned" : "cancelled";
            
            updateData.status = "refunded";
            updateData.orderStatus = newOrderStatus;
            needsUpdate = true;
            
            updates.push(`${data.transactionId}: fully refunded - status → refunded, orderStatus → ${newOrderStatus}`);
          } else if (isPartiallyRefunded && data.status !== "partially_refunded") {
            updateData.status = "partially_refunded";
            needsUpdate = true;
            
            updates.push(`${data.transactionId}: partially refunded - status → partially_refunded`);
          }
          
          if (needsUpdate) {
            await updateDoc(doc(db, "transactions", transactionId), updateData);
            updatedCount++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} transaction(s)`,
      updates,
    });

  } catch (error) {
    console.error("Error fixing refund status:", error);
    return NextResponse.json(
      { 
        error: "Failed to fix refund status",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
