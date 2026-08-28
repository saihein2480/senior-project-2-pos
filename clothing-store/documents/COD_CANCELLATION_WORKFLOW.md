# COD (Cash on Delivery) Cancellation Workflow

## Overview
For undelivered COD orders, the cancellation process is simple: when a customer requests cancellation and the store approves it, the order is cancelled with **NO refund** required (since the customer hasn't paid yet).

---

## 🔄 Complete Workflow

### Customer Side (Storefront)

#### Step 1: Customer Requests Cancellation
**Location:** `http://localhost:3001/account/purchases`

**Conditions:**
- Order has **NOT** been delivered yet
- Order status is NOT already "cancelled" or "refunded"
- No pending cancellation request exists

**Process:**
1. Customer views their purchase history
2. Clicks "Request Cancellation" button on a COD order
3. Enters cancellation reason
4. Submits cancellation request

**API Call:** `POST /api/transactions/request-cancel`
```json
{
  "transactionId": "TXN-001",
  "customerUid": "customer-uid",
  "reason": "Changed my mind"
}
```

**Result:**
- `cancellationRequest` object created in transaction document:
  ```json
  {
    "status": "pending",
    "reason": "Changed my mind",
    "requestedAt": "2024-01-15T10:30:00Z",
    "requestedBy": "customer-uid",
    "customerEmail": "customer@example.com",
    "customerName": "John Doe"
  }
  ```
- Customer sees "⏳ Cancellation Request Pending" in their order details

---

### Owner Side (POS)

#### Step 2: Owner Reviews Request
**Location:** `http://localhost:3000/owner/requests/cancellations`

**Display:**
- Shows all pending cancellation requests
- Displays order details, customer info, and cancellation reason
- Shows payment method (COD)

#### Step 3: Owner Approves Cancellation
**Process:**
1. Owner clicks "Approve" button
2. System confirms:
   ```
   Approve cancellation for Transaction TXN-001?
   
   This will:
   - Cancel the order
   - Restore inventory
   - Update customer notification
   ```
3. Owner confirms

**Backend Logic:**
```typescript
// For COD orders (isPaidOrder = false)
await transactionService.cancelTransaction(
  transaction.id,
  transaction,
  cancellationRequest.reason,
  owner.email
);
```

**What Happens:**
1. **Inventory Restored**
   - All items returned to stock
   - Quantities added back to inventory

2. **Transaction Updated**
   ```json
   {
     "status": "cancelled",
     "orderStatus": "cancelled",
     "cancelledAt": "2024-01-15T11:00:00Z",
     "cancelReason": "Changed my mind",
     "cancelledBy": "owner@store.com"
   }
   ```

3. **Cancellation Request Updated**
   ```json
   {
     "cancellationRequest": {
       "status": "approved",
       "approvedAt": "2024-01-15T11:00:00Z",
       "approvedBy": "owner@store.com",
       ...
     }
   }
   ```

4. **NO Refund Created**
   - Since customer hasn't paid yet, no refund is needed
   - No `cancellationRefund` object is created
   - No pending refund payment appears

**Result:**
- Order status changes to "Cancelled"
- Customer sees "✅ Cancellation Approved" in their order
- Order disappears from active orders
- Inventory is restored

---

## ⚠️ Important: COD vs Paid Orders

### COD Orders (Cash on Delivery)
- **Payment Method:** `cod`
- **Paid Yet?** ❌ No
- **Cancellation:** ✅ Simple - just cancel and restore inventory
- **Refund Needed?** ❌ No
- **Workflow:** Request → Approve → Cancelled (Done!)

### Paid Orders (Cash/Scan/Wallet)
- **Payment Method:** `cash`, `scan`, or `wallet`
- **Paid Yet?** ✅ Yes
- **Cancellation:** ✅ Cancel + create refund
- **Refund Needed?** ✅ Yes
- **Workflow:** Request → Approve → Create Pending Refund → Owner Processes Payment → Refunded

---

## 📊 Status Changes

### For COD Orders:

| Stage | Payment Status | Order Status | Refund Status |
|-------|----------------|--------------|---------------|
| Initial Order | `pending` | `pending` | N/A |
| Request Cancellation | `pending` | `pending` | N/A |
| Owner Approves | `cancelled` | `cancelled` | N/A (No refund) |

---

## 🔍 Code Implementation

### 1. Cancellation Request API
**File:** `pos-clothing-store-web/src/app/api/transactions/request-cancel/route.ts`

**Key Validation:**
```typescript
// Check if transaction is cancellable
if (status === "cancelled" || status === "refunded") {
  return error("Already cancelled or refunded");
}

// Can't cancel if already delivered
if (transaction.deliveryStatus === "delivered") {
  return error("Cannot cancel delivered orders");
}

// COD orders don't require QR code
if ((paymentMethod === "scan" || paymentMethod === "wallet") && !qrCodeImage) {
  return error("QR code required for Scan/Wallet payments");
}
```

### 2. Owner Approval Handler
**File:** `pos-clothing-store/clothing-store/src/app/owner/requests/cancellations/page.tsx`

**Key Logic:**
```typescript
const handleApprove = async (transaction: Transaction) => {
  // Check if paid order
  const isPaidOrder = 
    transaction.paymentMethod === "cash" || 
    transaction.paymentMethod === "scan" || 
    transaction.paymentMethod === "wallet";
  
  if (isPaidOrder) {
    // Paid orders: Cancel + Create Refund
    await transactionService.cancelPaidTransaction(...);
  } else {
    // COD orders: Just Cancel (NO Refund)
    await transactionService.cancelTransaction(...);
  }
  
  // Mark request as approved
  await updateDoc(doc(db, "transactions", transaction.id), {
    "cancellationRequest.status": "approved",
    "cancellationRequest.approvedAt": new Date().toISOString(),
    "cancellationRequest.approvedBy": user.email,
  });
};
```

### 3. Transaction Service
**File:** `pos-clothing-store/clothing-store/src/services/transactionService.ts`

**cancelTransaction() for COD:**
```typescript
async cancelTransaction(
  transactionId: string,
  transaction: Transaction,
  reason?: string,
  cancelledBy?: string,
): Promise<void> {
  // 1. Restore inventory
  await StockService.restoreMultipleItems(inventoryRestorations);
  
  // 2. Update transaction
  await updateDoc(transactionRef, {
    status: "cancelled",
    orderStatus: "cancelled",  // Added for consistency
    cancelledAt: Timestamp.now(),
    cancelReason: reason,
    cancelledBy: cancelledBy,
  });
  
  // NO refund creation!
}
```

**cancelPaidTransaction() for Cash/Scan/Wallet:**
```typescript
async cancelPaidTransaction(
  transactionId: string,
  transaction: Transaction,
  reason?: string,
  cancelledBy?: string,
  refundMethod?: string,
): Promise<void> {
  // 1. Restore inventory
  await StockService.restoreMultipleItems(inventoryRestorations);
  
  // 2. Calculate refund amount
  const refundAmount = transaction.total - totalAlreadyRefunded;
  
  // 3. Create cancellation refund
  await updateDoc(transactionRef, {
    status: "cancelled",
    cancellationRefund: {
      amount: refundAmount,
      status: "pending",
      requestedAt: Timestamp.now(),
      ...
    }
  });
  
  // Refund payment confirmation needed!
}
```

---

## 🎯 User Experience

### Customer View (Storefront)

**Before Approval:**
```
Order Status: Pending
Payment Status: Pending
⏳ Cancellation Request Pending
Please wait for store approval
```

**After Approval:**
```
Order Status: Cancelled
Payment Status: Cancelled
✅ Cancellation Approved
Your order has been cancelled
```

### Owner View (POS)

**Cancellation Requests Page:**
```
╔════════════════════════════════════════╗
║ Cancellation Requests                  ║
║                                        ║
║ TXN-001                                ║
║ Customer: John Doe                     ║
║ Payment: COD                           ║
║ Total: THB 500.00                      ║
║ Reason: Changed my mind                ║
║                                        ║
║ [✅ Approve]  [❌ Reject]              ║
╚════════════════════════════════════════╝
```

**After Approval:**
```
✅ Cancellation approved successfully!
Inventory has been restored
Customer has been notified
```

---

## ✅ Testing Checklist

### Test Case 1: COD Order Cancellation
- [ ] Create a COD order from storefront
- [ ] Request cancellation before delivery
- [ ] Verify request appears in POS cancellation requests
- [ ] Approve cancellation in POS
- [ ] Verify order status = "cancelled"
- [ ] Verify orderStatus = "cancelled"
- [ ] Verify NO refund is created
- [ ] Verify inventory is restored
- [ ] Verify customer sees cancellation approved

### Test Case 2: Cannot Cancel After Delivery
- [ ] Create a COD order
- [ ] Mark as delivered
- [ ] Try to request cancellation
- [ ] Verify error: "Cannot cancel delivered orders"

### Test Case 3: Duplicate Cancellation Request
- [ ] Create a COD order
- [ ] Request cancellation
- [ ] Try to request cancellation again
- [ ] Verify error: "Cancellation request already pending"

---

## 🔄 Comparison: COD vs Paid Order Cancellation

```
┌─────────────────────────────────────────────────────┐
│                 COD ORDER CANCELLATION               │
├─────────────────────────────────────────────────────┤
│ 1. Customer requests cancellation                   │
│    └─> No QR code needed                           │
│                                                      │
│ 2. Owner approves                                   │
│    ├─> Restore inventory                           │
│    ├─> Set status = "cancelled"                    │
│    ├─> Set orderStatus = "cancelled"               │
│    └─> NO refund created                           │
│                                                      │
│ 3. ✅ DONE - Order cancelled                        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              PAID ORDER CANCELLATION                 │
├─────────────────────────────────────────────────────┤
│ 1. Customer requests cancellation                   │
│    └─> QR code required for Scan/Wallet           │
│                                                      │
│ 2. Owner approves                                   │
│    ├─> Restore inventory                           │
│    ├─> Set status = "cancelled"                    │
│    ├─> Create cancellationRefund (pending)         │
│    └─> Owner needs to process refund payment       │
│                                                      │
│ 3. Owner processes refund payment                   │
│    └─> At /owner/requests/pending-refunds          │
│                                                      │
│ 4. Owner confirms payment given to customer         │
│    ├─> Update cancellationRefund.status =          │
│    │   "completed"                                  │
│    └─> ✅ DONE - Order cancelled + refunded        │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Summary

### COD Order Cancellation is Simple:
1. ✅ Customer requests → Owner approves
2. ✅ Inventory restored
3. ✅ Order status = Cancelled
4. ✅ No refund needed
5. ✅ Done!

### Key Differences from Paid Orders:
- ❌ No refund payment step
- ❌ No pending-refunds page involvement
- ❌ No QR code requirement
- ✅ Simple 2-step process
- ✅ Instant completion

### Why No Refund?
Because COD means **Cash on Delivery** - the customer hasn't paid yet! They will only pay when the order is delivered. If cancelled before delivery, there's nothing to refund.
