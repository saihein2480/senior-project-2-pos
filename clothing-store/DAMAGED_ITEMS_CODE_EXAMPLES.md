# Damaged Items Inspection - Code Implementation Examples

## Key Code Snippets for Damaged Item Handling

### 1. Inspection Modal State Management

```typescript
// State for inspection results
const [inspectionResults, setInspectionResults] = useState<{
  [itemIndex: number]: "accepted" | "damaged"
}>({});

// Initialize inspection results when modal opens
const initializeInspection = (transaction: Transaction) => {
  const refundReq = transaction.refundRequest;
  const requestedItems = refundReq?.items || [];
  const initialInspection: { [itemIndex: number]: "accepted" | "damaged" } = {};
  
  transaction.items.forEach((item, index) => {
    const requestedItem = requestedItems.find(
      (ri: any) => ri.id === item.id || ri.groupName === item.groupName
    );
    if (requestedItem && requestedItem.quantity > 0) {
      // Default to "accepted" - owner must explicitly mark as damaged
      initialInspection[index] = "accepted";
    }
  });
  
  setInspectionResults(initialInspection);
};
```

### 2. Complete Inspection Handler

```typescript
const handleCompleteInspection = async () => {
  if (!selectedRequest || !selectedRequest.id) return;
  
  const refundReq = (selectedRequest as any).refundRequest;
  const requestedItems = refundReq.items || [];
  
  // Validate all items have inspection results
  const missingInspection = requestedItems.some((reqItem: any) => {
    const itemIndex = selectedRequest.items.findIndex(
      (item) => item.id === reqItem.id || item.groupName === reqItem.groupName
    );
    return itemIndex >= 0 && !inspectionResults[itemIndex];
  });
  
  if (missingInspection) {
    toast.error("Please inspect all returned items");
    return;
  }
  
  setProcessing(selectedRequest.id);
  
  try {
    const { doc, updateDoc } = await import("firebase/firestore");
    
    // Build inspection results array
    const itemInspectionResults = Object.entries(inspectionResults).map(
      ([itemIndex, status]) => ({
        itemIndex: parseInt(itemIndex),
        status,
        inspectedAt: new Date().toISOString(),
      })
    );
    
    // STEP 1: Update transaction with inspection results and payment status
    await updateDoc(doc(db!, "transactions", selectedRequest.id), {
      "refundRequest.inspectionCompleted": true,
      "refundRequest.itemInspectionResults": itemInspectionResults,
      "refundRequest.inspectedBy": user?.email || "Owner",
      "refundRequest.inspectedAt": new Date().toISOString(),
      "refundRequest.status": "completed",
      "paymentStatus": "pending_refund", // Important: Update payment status
    });
    
    // STEP 2: Sync to onlineOrders collection
    if (selectedRequest.onlineOrderId) {
      const onlineOrderRef = doc(db!, "onlineOrders", selectedRequest.onlineOrderId);
      await updateDoc(onlineOrderRef, {
        paymentStatus: "pending_refund",
        lastUpdated: new Date().toISOString(),
      });
    }
    
    // STEP 3: Confirm return status (updates ONLY orderStatus)
    await transactionService.confirmReturnStatus(
      selectedRequest.id,
      returnStatus, // "fully_returned" or "partially_returned"
      user?.email || "Owner"
    );
    
    // STEP 4: Get fresh transaction data
    const { getDoc } = await import("firebase/firestore");
    const transactionRef = doc(db!, "transactions", selectedRequest.id);
    const updatedTransactionDoc = await getDoc(transactionRef);
    
    if (!updatedTransactionDoc.exists()) {
      throw new Error("Transaction not found after inspection update");
    }
    
    const updatedTransaction = {
      ...updatedTransactionDoc.data(),
      id: updatedTransactionDoc.id,
    } as Transaction;
    
    // STEP 5: Process refund with inspection results
    // This creates the pending refund that moves to /pending-refunds
    const inspectionResultsForRefund: { [itemIndex: number]: "accepted" | "damaged" } = {};
    itemInspectionResults.forEach((result) => {
      inspectionResultsForRefund[result.itemIndex] = result.status as "accepted" | "damaged";
    });
    
    // Build refund items
    const refundItems: { [key: string]: number } = {};
    selectedRequest.items.forEach((item, index) => {
      const requestedItem = requestedItems.find(
        (ri: any) => ri.id === item.id || ri.groupName === item.groupName
      );
      
      if (requestedItem && requestedItem.quantity > 0) {
        const key = `${item.id || item.groupName}___${index}`;
        refundItems[key] = requestedItem.quantity;
      }
    });
    
    await transactionService.processRefund(
      selectedRequest.id,
      refundItems,
      updatedTransaction,
      refundReq.reason || "Customer return request",
      user?.email || "Owner",
      undefined, // refundMethod set during payment confirmation
      inspectionResultsForRefund, // Pass inspection results
      undefined // Do NOT pass returnStatus - already set above
    );
    
    toast.success(
      "Inspection complete! Go to 'Pending Refund Payments' to confirm payment."
    );
    
    setShowInspectionModal(false);
    setInspectionResults({});
  } catch (error) {
    console.error("Error completing inspection:", error);
    toast.error(`Failed to complete inspection: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    setProcessing(null);
  }
};
```

### 3. Inventory Restocking Logic (transactionService.ts)

```typescript
async processRefund(
  transactionId: string,
  refundItems: { [key: string]: number },
  transaction: Transaction,
  reason: string,
  processedBy: string,
  refundMethod?: "cash" | "original_payment" | "bank_transfer",
  inspectionResults?: { [itemIndex: number]: "accepted" | "damaged" },
  returnStatus?: "fully_returned" | "partially_returned"
): Promise<void> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  try {
    const transactionRef = doc(db, this.collectionName, transactionId);
    
    // Calculate refund items and restore inventory
    const refundItemsArray: Array<{
      itemIndex: number;
      quantity: number;
    }> = [];
    
    let totalRefundAmount = 0;
    const inventoryRestorations: Array<{
      stockId: string;
      colorName: string;
      size: string;
      quantity: number;
      variantHint?: string;
    }> = [];

    Object.entries(refundItems).forEach(([key, quantity]) => {
      if (quantity <= 0) return;
      
      const [, indexStr] = key.split("___");
      const itemIndex = parseInt(indexStr);
      const item = transaction.items[itemIndex];
      
      if (!item) return;
      
      refundItemsArray.push({
        itemIndex,
        quantity,
      });
      
      // Calculate refund amount
      totalRefundAmount += item.unitPrice * quantity;
      
      // INVENTORY LOGIC: Only restock if inspection result is "accepted"
      const itemInspectionStatus = inspectionResults?.[itemIndex];
      
      if (itemInspectionStatus === "accepted") {
        // ✅ RESTOCK: Item is in good condition
        inventoryRestorations.push({
          stockId: item.stockId,
          colorName: item.selectedColor || "",
          size: item.selectedSize || "",
          quantity,
          variantHint: item.id || "",
        });
        console.log(`✅ Restocking ${item.groupName} (accepted): +${quantity}`);
      } else if (itemInspectionStatus === "damaged") {
        // ❌ DO NOT RESTOCK: Item is damaged
        console.log(`❌ NOT restocking ${item.groupName} (damaged): loss of ${quantity} units`);
      } else {
        // No inspection results - default behavior (old logic for backward compatibility)
        inventoryRestorations.push({
          stockId: item.stockId,
          colorName: item.selectedColor || "",
          size: item.selectedSize || "",
          quantity,
          variantHint: item.id || "",
        });
      }
    });
    
    // Restore inventory for accepted items only
    if (inventoryRestorations.length > 0) {
      console.log(`Restoring ${inventoryRestorations.length} accepted items to inventory`);
      await StockService.restoreMultipleItems(inventoryRestorations);
    }
    
    // Create refund record
    const refundId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const refund = {
      refundId,
      status: "pending", // Will be "completed" after payment confirmation
      items: refundItemsArray,
      totalAmount: totalRefundAmount,
      reason,
      createdAt: Timestamp.now(),
      processedBy,
      inspectionResults, // Store inspection results in refund
    };
    
    // Update transaction
    const currentRefunds = transaction.refunds || [];
    await updateDoc(transactionRef, {
      refunds: [...currentRefunds, refund],
      paymentStatus: "pending_refund",
      // Note: orderStatus should be set separately by confirmReturnStatus
    });
    
    console.log(`Refund processed. Inspection-based restocking: ${inventoryRestorations.length} items restocked`);
  } catch (error) {
    console.error("Error processing refund:", error);
    throw new Error("Failed to process refund");
  }
}
```

### 4. Confirm Refund Payment (transactionService.ts)

```typescript
async confirmRefundPayment(
  transactionId: string,
  refundId: string,
  refundMethod: "cash" | "original_payment" | "bank_transfer",
  confirmedBy: string,
  refundNotes?: string,
  refundProofUrl?: string,
  refundStatus?: "refunded" | "partially_refunded",
): Promise<void> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  try {
    const transactionRef = doc(db, this.collectionName, transactionId);
    const transactionDoc = await getDoc(transactionRef);
    
    if (!transactionDoc.exists()) {
      throw new Error("Transaction not found");
    }

    const transaction = transactionDoc.data() as Transaction;
    const refunds = transaction.refunds || [];
    
    // Find the refund to confirm
    const refundIndex = refunds.findIndex(r => r.refundId === refundId);
    if (refundIndex === -1) {
      throw new Error("Refund not found");
    }

    // Update refund status
    const updatedRefund: any = {
      ...refunds[refundIndex],
      status: "completed",
      refundMethod,
      refundedAt: Timestamp.now(),
      refundedBy: confirmedBy,
    };
    
    if (refundNotes) {
      updatedRefund.refundNotes = refundNotes;
    }
    if (refundProofUrl) {
      updatedRefund.refundProofUrl = refundProofUrl;
    }
    
    refunds[refundIndex] = updatedRefund;

    // Determine new payment status
    let newPaymentStatus = transaction.status;
    
    if (refundStatus) {
      // Use explicitly provided status
      newPaymentStatus = refundStatus;
    } else {
      // Calculate based on total refunded
      const totalRefunded = refunds
        .filter(r => r.status === "completed")
        .reduce((sum, r) => sum + r.totalAmount, 0);
      
      const isFullyRefunded = totalRefunded >= transaction.total;
      newPaymentStatus = isFullyRefunded ? "refunded" : "partially_refunded";
    }

    // Update transaction
    await updateDoc(transactionRef, {
      refunds,
      status: newPaymentStatus,
      paymentStatus: newPaymentStatus,
    });

    // Sync to onlineOrders
    if (transaction.onlineOrderId) {
      const onlineOrderRef = doc(db, "onlineOrders", transaction.onlineOrderId);
      await updateDoc(onlineOrderRef, {
        paymentStatus: newPaymentStatus,
        lastUpdated: new Date().toISOString(),
      });
    }

    console.log(`Payment confirmed. Status: ${newPaymentStatus}`);
  } catch (error) {
    console.error("Error confirming refund payment:", error);
    throw new Error("Failed to confirm refund payment");
  }
}
```

### 5. Customer View - Inspection Results Display

```typescript
// In purchase details modal
{refundRequest && refundRequest.type === "return" && refundRequest.inspectionCompleted && (
  <div className="mt-3 p-2 bg-white/50 rounded border border-green-200">
    <p className="text-xs font-semibold text-gray-700 mb-1">Inspection Results:</p>
    <div className="space-y-1">
      {refundRequest.itemInspectionResults?.map((result: any, idx: number) => {
        const item = row.items?.[result.itemIndex];
        return (
          <div key={idx} className="flex items-center gap-2 text-xs">
            {result.status === "accepted" ? (
              <span className="text-green-600">✓ Accepted:</span>
            ) : (
              <span className="text-red-600">⚠ Damaged:</span>
            )}
            <span className="text-gray-700">{item?.groupName || "Item"}</span>
          </div>
        );
      })}
    </div>
  </div>
)}
```

### 6. Owner View - Inspection Modal UI

```typescript
<div className="space-y-3">
  {selectedRequest.items.map((item, index) => {
    const refundReq = (selectedRequest as any).refundRequest;
    const requestedItem = (refundReq?.items || []).find(
      (ri: any) => ri.id === item.id || ri.groupName === item.groupName
    );
    
    if (!requestedItem || requestedItem.quantity === 0) return null;
    
    return (
      <div key={index} className="bg-gradient-to-r from-gray-50 to-pink-50/30 rounded-xl p-4 border-2 border-gray-200">
        {/* Item Info */}
        <div className="flex items-start gap-3 mb-3">
          {item.image && (
            <div className="relative">
              <img
                src={item.image}
                alt={item.groupName}
                className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-md"
              />
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {requestedItem.quantity}
              </div>
            </div>
          )}
          <div className="flex-1">
            <h4 className="text-sm font-bold text-gray-900">{item.groupName}</h4>
            <div className="flex items-center gap-2 text-xs mt-1">
              {item.selectedColor && (
                <span className="px-2 py-0.5 bg-white rounded border border-gray-300">
                  {item.selectedColor}
                </span>
              )}
              {item.selectedSize && (
                <span className="px-2 py-0.5 bg-white rounded border border-gray-300">
                  Size: {item.selectedSize}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inspection Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setInspectionResults(prev => ({
              ...prev,
              [index]: "accepted"
            }))}
            className={`px-4 py-3 rounded-lg border-2 transition-all ${
              inspectionResults[index] === "accepted"
                ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-500 shadow-lg"
                : "bg-white border-gray-300 hover:border-green-400"
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle className={`w-5 h-5 ${
                inspectionResults[index] === "accepted" ? "text-green-600" : "text-gray-400"
              }`} />
              <span className={`font-bold text-sm ${
                inspectionResults[index] === "accepted" ? "text-green-800" : "text-gray-700"
              }`}>
                Accepted
              </span>
            </div>
            <p className="text-[10px] text-gray-600">Good condition · Will restock</p>
          </button>

          <button
            onClick={() => setInspectionResults(prev => ({
              ...prev,
              [index]: "damaged"
            }))}
            className={`px-4 py-3 rounded-lg border-2 transition-all ${
              inspectionResults[index] === "damaged"
                ? "bg-gradient-to-br from-red-50 to-rose-50 border-red-500 shadow-lg"
                : "bg-white border-gray-300 hover:border-red-400"
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertCircle className={`w-5 h-5 ${
                inspectionResults[index] === "damaged" ? "text-red-600" : "text-gray-400"
              }`} />
              <span className={`font-bold text-sm ${
                inspectionResults[index] === "damaged" ? "text-red-800" : "text-gray-700"
              }`}>
                Damaged
              </span>
            </div>
            <p className="text-[10px] text-gray-600">Cannot resell · No restock</p>
          </button>
        </div>
      </div>
    );
  })}
</div>
```

### 7. Database Query - Get Pending Refunds

```typescript
// In pending-refunds page
useEffect(() => {
  const transactionsRef = collection(db!, "transactions");
  
  const unsubscribe = onSnapshot(transactionsRef, (snapshot) => {
    const pending: Transaction[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data() as Transaction;
      
      // Check for pending refund payments (after inspection)
      const hasPendingRefund = data.refunds?.some(r => r.status === "pending");
      
      if (hasPendingRefund) {
        pending.push({
          ...data,
          id: doc.id,
        });
      }
    });
    
    setPendingRefunds(pending);
  });
  
  return () => unsubscribe();
}, []);
```

### 8. Validation Logic

```typescript
// Validate all items inspected before completing
const validateInspection = (
  requestedItems: any[],
  transactionItems: any[],
  inspectionResults: { [itemIndex: number]: "accepted" | "damaged" }
): boolean => {
  const missingInspection = requestedItems.some((reqItem) => {
    const itemIndex = transactionItems.findIndex(
      (item) => item.id === reqItem.id || item.groupName === reqItem.groupName
    );
    return itemIndex >= 0 && !inspectionResults[itemIndex];
  });
  
  return !missingInspection;
};

// Validate paid order before processing refund
const isPaidOrder = (transaction: Transaction): boolean => {
  const isDirectPayment = 
    transaction.paymentMethod === "cash" || 
    transaction.paymentMethod === "scan" || 
    transaction.paymentMethod === "wallet";
  
  const isCODDelivered = 
    transaction.paymentMethod === "cod" && 
    (transaction.deliveryStatus === "delivered" || 
     transaction.orderStatus === "delivered" ||
     transaction.orderStatus === "fully_returned" ||
     transaction.orderStatus === "partially_returned");
  
  const isReturnTypeRefund = 
    (transaction as any).refundRequest?.type === "return" && 
    (transaction as any).refundRequest?.returnReceived;
  
  return isDirectPayment || isCODDelivered || isReturnTypeRefund;
};
```

## Summary

These code examples demonstrate:

1. ✅ **State Management** - Tracking inspection results for each item
2. ✅ **Validation** - Ensuring all items are inspected before proceeding
3. ✅ **Database Updates** - Syncing across transactions and onlineOrders collections
4. ✅ **Inventory Logic** - Restocking only accepted items
5. ✅ **UI Components** - Interactive inspection interface
6. ✅ **Payment Confirmation** - Two-phase status update
7. ✅ **Error Handling** - Comprehensive validation and error messages
8. ✅ **Status Synchronization** - Keeping all views up to date

The implementation provides a complete, production-ready solution for handling damaged items during the return inspection process.
