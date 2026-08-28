# Perfect Process for Damaged Items During Return Inspection

## Overview
This document outlines the complete workflow for handling returned items that are found to be damaged during the inspection step. The system now provides proper handling for partial refunds when some items are damaged and cannot be restocked.

## Workflow Steps

### Step 1: Customer Requests Return (Customer Portal)
**Location:** `/account/purchases` (Customer)

**Actions:**
1. Customer selects "Request Return" for delivered order
2. Customer selects items and quantities to return
3. **Required uploads:**
   - Payment QR code/account screenshot (for refund transfer)
   - 1-5 clear photos of items to return
4. Customer provides return reason
5. System creates `refundRequest` with:
   - `type: "return"`
   - `status: "pending"`
   - `items: [array of selected items]`
   - `qrCodeImage: "base64 string"`
   - `itemPhotos: ["base64 string array"]`

### Step 2: Owner Approves Return Request (Owner Portal)
**Location:** `/owner/requests/refunds` (Owner)

**Actions:**
1. Owner reviews return request
2. Owner sees:
   - Requested items list
   - Item photos uploaded by customer
   - Return reason
3. Owner clicks "Approve" button
4. System updates `refundRequest.status: "approved"`
5. Customer notified: "Return approved! Please bring items to store"

**Customer View:**
- Purchase history shows "Return Approved" badge
- Instructions to visit store

### Step 3: Customer Brings Items to Store

**Physical Action:**
- Customer visits store with items
- Customer brings items in original packaging (if possible)
- Staff receives and counts items

### Step 4: Owner Marks Items as Returned (Owner Portal)
**Location:** `/owner/requests/refunds` (Owner)

**Actions:**
1. Owner clicks "Returned" button
2. **Modal opens: "Mark Items as Returned"**
   - Shows list of items to receive
   - **NEW: Return Status Selection**
     - ✅ **Fully Returned** - Customer returned all requested items
     - ✅ **Partially Returned** - Customer returned only some items
3. Owner selects appropriate status
4. Owner clicks "Confirm Received"
5. System updates:
   - `refundRequest.returnReceived: true`
   - `refundRequest.returnReceivedAt: timestamp`
   - `refundRequest.returnStatus: "fully_returned" | "partially_returned"`
   - `orderStatus: "fully_returned" | "partially_returned"` (immediately visible to customer)
6. System syncs to `onlineOrders` collection
7. **Inspection modal auto-opens**

### Step 5: Owner Inspects Items (Owner Portal)
**Location:** `/owner/requests/refunds` (Owner)

**Actions:**
1. **Inspection Modal displays:**
   - Each returned item with photo
   - Item details (name, color, size, quantity)
   - Customer's uploaded photos for reference
   
2. **For each item, owner selects:**
   - ✅ **Accepted** - Good condition, will be restocked
   - ❌ **Damaged** - Cannot be resold, will NOT be restocked

3. **Inspection Guide shown:**
   ```
   🔍 Inspection Guide
   
   Mark each item as "Accepted" (good condition, can restock) 
   or "Damaged" (cannot restock).
   
   💡 Note: Customer will receive full refund for both accepted 
   and damaged items. The only difference is inventory restocking.
   ```

4. Owner completes inspection for all items

5. Owner clicks "Complete Inspection"

6. **System processing:**
   ```typescript
   // Save inspection results
   refundRequest.inspectionCompleted = true
   refundRequest.itemInspectionResults = [
     { itemIndex: 0, status: "accepted", inspectedAt: timestamp },
     { itemIndex: 1, status: "damaged", inspectedAt: timestamp }
   ]
   
   // Update payment status
   paymentStatus = "pending_refund"
   
   // Update order status (already set in Step 4)
   orderStatus = "fully_returned" | "partially_returned"
   
   // Create pending refund with inspection results
   refunds = [{
     refundId: "unique-id",
     status: "pending",
     items: [
       { itemIndex: 0, quantity: 1 }, // accepted item
       { itemIndex: 1, quantity: 1 }  // damaged item
     ],
     totalAmount: calculated_amount,
     inspectionResults: {
       0: "accepted",  // Will restock
       1: "damaged"    // Will NOT restock
     },
     createdAt: timestamp
   }]
   ```

7. **System syncs to `onlineOrders` collection:**
   ```typescript
   onlineOrders.update({
     paymentStatus: "pending_refund",
     status: "fully_returned" | "partially_returned",
     lastUpdated: timestamp
   })
   ```

### Step 6: Inventory Handling (Automatic)

**For Accepted Items:**
```typescript
// Restock accepted items back to inventory
acceptedItems.forEach(item => {
  StockService.restoreMultipleItems([{
    stockId: item.stockId,
    colorName: item.selectedColor,
    size: item.selectedSize,
    quantity: item.quantity,
    variantHint: item.id
  }])
})
```

**For Damaged Items:**
```typescript
// Do NOT restock damaged items
// Log damaged items for records
damagedItems.forEach(item => {
  console.log(`Damaged item NOT restocked: ${item.groupName}`)
})
```

### Step 7: Owner Confirms Refund Payment (Owner Portal)
**Location:** `/owner/requests/pending-refunds` (Owner)

**Actions:**
1. System shows pending refund in "Pending Refund Payments" page
2. Owner reviews:
   - Refund amount (full amount regardless of damage)
   - Inspection results
   - Customer's payment QR code
3. Owner selects refund method:
   - 💵 Cash (customer picks up at store)
   - 📱 QR Scan (transfer to customer's account)
   - 🏦 Bank Transfer
4. **Owner selects refund status:**
   - ✅ **Fully Refunded** - Customer received complete refund
   - ✅ **Partially Refunded** - Customer received partial refund
5. Owner adds notes (optional)
6. Owner clicks "Confirm Payment"
7. System updates:
   - `refunds[0].status: "completed"`
   - `refunds[0].refundMethod: selected_method`
   - `refunds[0].refundedAt: timestamp`
   - `paymentStatus: "refunded" | "partially_refunded"`
   - `status: "refunded" | "partially_refunded"`

8. System syncs to `onlineOrders`:
   ```typescript
   onlineOrders.update({
     paymentStatus: "refunded" | "partially_refunded",
     lastUpdated: timestamp
   })
   ```

### Step 8: Customer Receives Refund

**For Cash Refunds:**
- Customer visits store
- Owner gives cash refund
- Customer receives receipt

**For QR Scan / Bank Transfer:**
- Owner transfers money to customer's account
- Customer receives notification
- Money appears in account within 3-5 business days

## Key Features of Damaged Item Handling

### 1. Full Refund Regardless of Condition
```
✅ PRINCIPLE: Customer always gets full refund
❌ EXCEPTION: None - all items refunded at full price

Rationale:
- Customer satisfaction is priority
- Damage may not be customer's fault
- Simplifies refund process
- Reduces disputes
```

### 2. Inventory Differentiation
```
✅ Accepted Items → Restock to inventory
❌ Damaged Items → Do NOT restock

Benefits:
- Accurate inventory count
- Prevents selling damaged items
- Proper stock tracking
- Loss tracking for analytics
```

### 3. Transparent Inspection Process
```
📊 Inspection Results Visible To:
- Owner (full details)
- Customer (summary in purchase history)

Information Shown:
- Which items were accepted
- Which items were damaged
- Refund still processed for all items
```

### 4. Status Synchronization
```
Collections Updated:
├─ transactions
│  ├─ refundRequest
│  ├─ refunds[]
│  ├─ orderStatus
│  ├─ paymentStatus
│  └─ status
└─ onlineOrders
   ├─ status
   ├─ orderStatus
   ├─ paymentStatus
   └─ lastUpdated

Pages That Show Updated Status:
├─ Customer: /account/purchases
├─ Owner: /owner/sales/online-orders
├─ Owner: /owner/sales/online-transactions
└─ Owner: /owner/requests/refunds
```

## Payment Status vs Order Status

### Order Status (Physical Fulfillment)
```
"delivered"            → Order was delivered to customer
"fully_returned"       → Customer returned all items
"partially_returned"   → Customer returned some items
```

### Payment Status (Financial Status)
```
"paid"               → Customer paid for order
"pending_refund"     → Refund approved, awaiting payment
"refunded"           → Full refund completed
"partially_refunded" → Partial refund completed
```

### Two-Step Update Process
```
STEP 1: Inspection Complete
├─ orderStatus: "fully_returned" | "partially_returned"
└─ paymentStatus: "pending_refund"

STEP 2: Payment Confirmed
├─ orderStatus: UNCHANGED
└─ paymentStatus: "refunded" | "partially_refunded"
```

## Database Schema

### Transaction Document
```typescript
{
  transactionId: "TEST-ONL-178789",
  orderStatus: "fully_returned", // Step 4 & 5
  paymentStatus: "pending_refund", // Step 5
  status: "refunded", // Step 7
  
  refundRequest: {
    type: "return",
    status: "completed", // After Step 5
    reason: "Customer reason",
    items: [
      { id: "W10783", quantity: 1, groupName: "W10783" }
    ],
    qrCodeImage: "data:image/jpeg;base64,...",
    itemPhotos: ["data:image/jpeg;base64,..."],
    requestedAt: "2026-08-27T10:00:00.000Z",
    approvedAt: "2026-08-27T11:00:00.000Z",
    returnReceived: true,
    returnReceivedAt: "2026-08-27T12:00:00.000Z",
    returnStatus: "fully_returned",
    inspectionCompleted: true,
    inspectedAt: "2026-08-27T12:30:00.000Z",
    itemInspectionResults: [
      { itemIndex: 0, status: "accepted", inspectedAt: "..." },
      { itemIndex: 1, status: "damaged", inspectedAt: "..." }
    ]
  },
  
  refunds: [{
    refundId: "ref-12345",
    status: "completed",
    items: [
      { itemIndex: 0, quantity: 1 },
      { itemIndex: 1, quantity: 1 }
    ],
    totalAmount: 350.00,
    inspectionResults: {
      0: "accepted",  // Will restock
      1: "damaged"    // Will NOT restock
    },
    refundMethod: "original_payment",
    refundedAt: "2026-08-27T13:00:00.000Z",
    refundedBy: "owner@example.com",
    createdAt: "2026-08-27T12:30:00.000Z"
  }]
}
```

### Online Orders Document
```typescript
{
  orderId: "ORD-178789",
  status: "fully_returned", // Synced from transaction
  orderStatus: "fully_returned", // Synced from transaction
  paymentStatus: "refunded", // Synced from transaction
  lastUpdated: "2026-08-27T13:00:00.000Z"
}
```

## UI/UX Flow

### Customer View Progress
```
Purchase History:
┌─────────────────────────────────────┐
│ Order #TEST-ONL-178789              │
│ Status: Fully Returned              │
│ Payment: Fully Refunded             │
│                                     │
│ Return Journey:                     │
│ ✅ Request Approved                 │
│ ✅ Items Returned to Store          │
│ ✅ Items Inspected                  │
│ ✅ Refund Processed                 │
│                                     │
│ Inspection Results:                 │
│ ✓ Accepted: W10783                  │
│ ⚠ Damaged: W10224                   │
│                                     │
│ Refund Details:                     │
│ Method: QR Scan                     │
│ Amount: THB 700.00                  │
│ Status: Fully Refunded              │
└─────────────────────────────────────┘
```

### Owner View - Refunds Page
```
Refund Requests:
┌─────────────────────────────────────────────┐
│ TEST-ONL-178789 [Return Request]           │
│ Status: Approved · Awaiting Inspection     │
│                                             │
│ Requested Items:                            │
│ • W10783 - Qty: 1                          │
│ • W10224 - Qty: 1                          │
│                                             │
│ 📸 Item Photos (3):                        │
│ [Photo 1] [Photo 2] [Photo 3]              │
│                                             │
│ Actions:                                    │
│ [Details] [Returned] [Inspect] [Reject]    │
└─────────────────────────────────────────────┘
```

### Owner View - Inspection Modal
```
Inspect Returned Items:
┌─────────────────────────────────────────────┐
│ 🔍 Inspection Guide                         │
│ Mark as Accepted (good condition) or        │
│ Damaged (cannot restock). Full refund       │
│ given for all items.                        │
│                                             │
│ ─────────────────────────────────────────  │
│                                             │
│ W10783 - Ironside Gray, S                  │
│ [Image] Qty: 1                              │
│                                             │
│ [✓ Accepted] [  Damaged  ]                 │
│ Good condition · Will restock               │
│                                             │
│ ─────────────────────────────────────────  │
│                                             │
│ W10224 - Friar Gray, Free                  │
│ [Image] Qty: 1                              │
│                                             │
│ [  Accepted  ] [✓ Damaged]                 │
│ Cannot resell · No restock                  │
│                                             │
│ ─────────────────────────────────────────  │
│                                             │
│ 💡 Customer receives full refund for both  │
│                                             │
│ [Cancel] [Complete Inspection]              │
└─────────────────────────────────────────────┘
```

## Business Rules

### 1. Refund Amount Calculation
```typescript
// Always refund full amount for returned items
const refundAmount = returnedItems.reduce((sum, item) => {
  return sum + (item.unitPrice * item.quantity);
}, 0);

// Damaged status does NOT affect refund amount
// Customer gets full refund regardless
```

### 2. Inventory Restocking Logic
```typescript
returnedItems.forEach((item, index) => {
  const inspectionStatus = inspectionResults[index];
  
  if (inspectionStatus === "accepted") {
    // Restock to inventory
    StockService.restoreMultipleItems([{
      stockId: item.stockId,
      colorName: item.selectedColor,
      size: item.selectedSize,
      quantity: item.quantity,
      variantHint: item.id
    }]);
  } else if (inspectionStatus === "damaged") {
    // Do NOT restock
    // Log for loss tracking
    console.log(`Damaged item not restocked: ${item.groupName}`);
  }
});
```

### 3. Status Priority
```
Order Status Changes:
pending → packaging → delivering → delivered → fully_returned

Payment Status Changes:
pending → paid → pending_refund → refunded

Both are independent and tracked separately!
```

## Error Handling

### Common Issues and Solutions

#### Issue 1: Inspection Results Not Saved
**Symptom:** Inspection modal closes but results not saved
**Cause:** Missing validation check
**Solution:** 
```typescript
// Validate all items have inspection results
const missingInspection = requestedItems.some((reqItem) => {
  const itemIndex = transaction.items.findIndex(
    (item) => item.id === reqItem.id
  );
  return itemIndex >= 0 && !inspectionResults[itemIndex];
});

if (missingInspection) {
  toast.error("Please inspect all returned items");
  return;
}
```

#### Issue 2: Inventory Not Restocking
**Symptom:** Accepted items not added back to stock
**Cause:** Inspection results not passed to processRefund
**Solution:**
```typescript
await transactionService.processRefund(
  transactionId,
  refundItems,
  transaction,
  reason,
  confirmedBy,
  undefined, // refundMethod
  inspectionResultsForRefund // ✅ Pass inspection results
);
```

#### Issue 3: Payment Status Not Syncing
**Symptom:** Customer sees wrong payment status
**Cause:** onlineOrders collection not updated
**Solution:**
```typescript
// Always sync to onlineOrders after transaction update
if (transaction.onlineOrderId) {
  const onlineOrderRef = doc(db, "onlineOrders", transaction.onlineOrderId);
  await updateDoc(onlineOrderRef, {
    paymentStatus: newPaymentStatus,
    lastUpdated: new Date().toISOString(),
  });
}
```

## Testing Checklist

### Scenario 1: All Items Accepted
- [ ] Customer requests return of 2 items
- [ ] Owner approves and marks as received
- [ ] Owner inspects: both marked "Accepted"
- [ ] ✅ Both items restocked to inventory
- [ ] ✅ Payment status: "pending_refund"
- [ ] Owner confirms payment
- [ ] ✅ Payment status: "refunded"
- [ ] ✅ Customer receives full refund

### Scenario 2: All Items Damaged
- [ ] Customer requests return of 2 items
- [ ] Owner approves and marks as received
- [ ] Owner inspects: both marked "Damaged"
- [ ] ❌ NO items restocked to inventory
- [ ] ✅ Payment status: "pending_refund"
- [ ] Owner confirms payment
- [ ] ✅ Payment status: "refunded"
- [ ] ✅ Customer receives full refund

### Scenario 3: Mixed (Some Accepted, Some Damaged)
- [ ] Customer requests return of 3 items
- [ ] Owner approves and marks as received
- [ ] Owner inspects: 2 "Accepted", 1 "Damaged"
- [ ] ✅ Only 2 items restocked (accepted ones)
- [ ] ❌ 1 item NOT restocked (damaged)
- [ ] ✅ Payment status: "pending_refund"
- [ ] Owner confirms payment
- [ ] ✅ Payment status: "refunded"
- [ ] ✅ Customer receives full refund for all 3 items

### Scenario 4: Partial Return with Damage
- [ ] Customer requests return of 2 out of 4 items
- [ ] Owner marks as "Partially Returned"
- [ ] Owner inspects: 1 "Accepted", 1 "Damaged"
- [ ] ✅ Order status: "partially_returned"
- [ ] ✅ Only 1 item restocked (accepted)
- [ ] ❌ 1 item NOT restocked (damaged)
- [ ] ✅ Customer receives refund for returned items only
- [ ] ✅ Payment status: "partially_refunded"

## Summary

This enhanced process provides:

1. ✅ **Clear Workflow** - 8 well-defined steps from request to refund
2. ✅ **Fair Refunds** - Full refund regardless of item condition
3. ✅ **Accurate Inventory** - Only restock acceptable items
4. ✅ **Transparency** - Customer sees inspection results
5. ✅ **Status Sync** - All views show correct status
6. ✅ **Loss Tracking** - Damaged items logged for analytics
7. ✅ **User-Friendly UI** - Clear modals and status indicators
8. ✅ **Error Prevention** - Validation at each step
9. ✅ **Flexible Options** - Partial returns, mixed conditions
10. ✅ **Complete Audit Trail** - Full history of return process
