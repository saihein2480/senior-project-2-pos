# COD (Cash on Delivery) Return & Refund Workflow

## Overview
For **already delivered COD orders** where the customer has paid cash on delivery, the return and refund process works exactly like cash/scan/wallet orders. The customer can request a return, the owner inspects the items, and processes the refund payment.

---

## 🔄 Complete Workflow: Delivered COD Orders

### Customer Side (Storefront)

#### Step 1: Customer Requests Return
**Location:** `http://localhost:3001/account/purchases`

**Conditions:**
- Order has been **delivered** (customer has paid cash on delivery)
- Order status is NOT "refunded"
- No pending refund request exists

**Process:**
1. Customer views their purchase history
2. Finds delivered COD order
3. Clicks "Request Return" button
4. Selects items to return and quantities
5. Enters return reason
6. Submits return request (NO QR code required for COD)

**API Call:** `POST /api/transactions/request-refund`
```json
{
  "transactionId": "TXN-001",
  "customerUid": "customer-uid",
  "reason": "Product defective",
  "items": [
    {
      "id": "item-1",
      "productId": "prod-123",
      "quantity": 1,
      "unitPrice": 500
    }
  ]
  // NO qrCodeImage for COD orders
}
```

**Result:**
- `refundRequest` object created:
  ```json
  {
    "type": "return",
    "status": "pending",
    "reason": "Product defective",
    "items": [...],
    "requestedAt": "2024-01-15T10:30:00Z",
    "requestedBy": "customer-uid"
  }
  ```
- Customer sees "⏳ Return Request Pending" in their order

---

### Owner Side (POS)

#### Step 2: Owner Reviews Return Request
**Location:** `http://localhost:3000/owner/requests/refunds`

**Display:**
- Shows all pending return requests
- Displays order details including payment method (COD)
- Shows items customer wants to return

#### Step 3: Owner Inspects Returned Items
**Process:**
1. Customer brings items back to store
2. Owner clicks "Inspect Items" button
3. For each item, marks as:
   - **Accepted** (good condition, can restock)
   - **Damaged** (cannot restock, but still refundable)
4. Selects return status:
   - **Fully Returned** (all items returned)
   - **Partially Returned** (some items returned)
5. Owner submits inspection

**Backend Logic:**
```typescript
// COD delivered orders are treated as "paid"
const isPaidOrder = 
  transaction.paymentMethod === "cash" || 
  transaction.paymentMethod === "scan" || 
  transaction.paymentMethod === "wallet" ||
  (transaction.paymentMethod === "cod" && 
   transaction.deliveryStatus === "delivered");

// Step 1: Update orderStatus ONLY
await transactionService.confirmReturnStatus(
  transactionId,
  "fully_returned", // or "partially_returned"
  owner.email
);

// Step 2: Create pending refund
await transactionService.processRefund(...);
```

**What Happens:**
1. **Order Status Updated**
   - `orderStatus` = "fully_returned" or "partially_returned"
   - Payment status unchanged (still shows original status)

2. **Inspection Results Recorded**
   ```json
   {
     "refundRequest": {
       "status": "completed",
       "inspectionCompleted": true,
       "itemInspectionResults": [
         { "itemIndex": 0, "status": "accepted" }
       ]
     }
   }
   ```

3. **Inventory Updated**
   - Items marked "accepted" → restored to inventory
   - Items marked "damaged" → NOT restored

4. **Pending Refund Created**
   ```json
   {
     "refunds": [
       {
         "refundId": "REF-001",
         "status": "pending",
         "totalAmount": 500,
         "items": [...]
       }
     ]
   }
   ```

**Result:**
- Customer sees order status = "Fully Returned" or "Partially Returned"
- Payment status unchanged
- Owner needs to process payment

---

#### Step 4: Owner Processes Refund Payment
**Location:** `http://localhost:3000/owner/requests/pending-refunds`

**Display:**
- Shows all pending refund payments (including COD orders)
- Displays refund amount and order details
- Shows payment method (COD)

**Process:**
1. Owner prepares cash refund amount
2. **Gives cash to customer** (physical handover)
3. Clicks "Confirm" button
4. Selects refund method: "Original Payment Method" (Cash)
5. Selects refund status:
   - **Fully Refunded** (full amount returned)
   - **Partially Refunded** (partial amount returned)
6. Confirms payment

**Backend Logic:**
```typescript
await transactionService.confirmRefundPayment(
  transactionId,
  refundId,
  "original_payment", // Cash for COD
  owner.email,
  notes,
  undefined,
  "refunded" // or "partially_refunded"
);
```

**What Happens:**
1. **Payment Status Updated**
   - `status` = "refunded" or "partially_refunded"
   - Order status unchanged (preserves return status from Step 3)

2. **Refund Marked Complete**
   ```json
   {
     "refunds": [
       {
         "refundId": "REF-001",
         "status": "completed",
         "refundMethod": "original_payment",
         "refundedAt": "2024-01-15T14:00:00Z",
         "refundedBy": "owner@store.com"
       }
     ]
   }
   ```

**Result:**
- Customer sees:
  - Order Status: "Fully Returned"
  - Payment Status: "Fully Refunded"
- Customer notified refund is complete

---

## 📊 Status Flow

### Delivered COD Order Return:

```
Initial State:
├─ Payment Status: completed
├─ Order Status: delivered
├─ Delivery Status: delivered
└─ Payment Method: COD

↓ Customer Requests Return

Pending Return:
├─ Payment Status: completed (unchanged)
├─ Order Status: delivered (unchanged)
├─ refundRequest.status: pending
└─ Customer sees: "⏳ Return Request Pending"

↓ Owner Inspects Items

Return Confirmed:
├─ Payment Status: completed (unchanged)
├─ Order Status: fully_returned or partially_returned ✅
├─ refundRequest.status: completed
├─ Refund created: { status: "pending", amount: X }
└─ Customer sees: Order Status = "Fully Returned", Payment Status unchanged

↓ Owner Processes Refund Payment (Gives Cash to Customer)

Refund Complete:
├─ Payment Status: refunded or partially_refunded ✅
├─ Order Status: fully_returned (unchanged from Step 3)
├─ Refund: { status: "completed" }
└─ Customer sees: Order Status = "Fully Returned", Payment Status = "Fully Refunded"
```

---

## ⚖️ Comparison: Undelivered vs Delivered COD Orders

### Undelivered COD Order (Cancellation)
```
Customer hasn't paid yet → Just cancel
├─ Request Cancellation
├─ Owner Approves
├─ Order Status = Cancelled
└─ NO REFUND (customer didn't pay yet!)
```

### Delivered COD Order (Return & Refund)
```
Customer already paid cash → Full refund process
├─ Request Return
├─ Owner Inspects Items
├─ Order Status = Fully/Partially Returned
├─ Owner Gives Cash to Customer
├─ Payment Status = Fully/Partially Refunded
└─ REFUND COMPLETE
```

---

## 🎯 Key Differences: COD vs Cash/Scan/Wallet

| Aspect | COD Orders | Cash/Scan/Wallet Orders |
|--------|------------|-------------------------|
| **When Considered "Paid"** | After delivery | Immediately at purchase |
| **Return Request (Storefront)** | No QR code required | Scan/Wallet: QR required; Cash: No QR |
| **Refund Processing (POS)** | Cash refund | Cash/Scan/Wallet refund |
| **Payment Confirmation** | Same as Cash | Cash: In person; Scan/Wallet: Back to payment method |

### Similarities:
- ✅ Both follow 2-step process (confirm return → process payment)
- ✅ Both update orderStatus first, then payment status
- ✅ Both support item inspection (accepted/damaged)
- ✅ Both support partial returns
- ✅ Both require owner to confirm payment given

### Differences:
- ❌ COD: No QR code upload required
- ✅ COD: Must be delivered first (customer must have paid)
- ✅ Cash: Refund given in cash at store
- ✅ COD treated same as Cash for refund processing

---

## 💻 Code Implementation

### 1. Refund Request API
**File:** `pos-clothing-store-web/src/app/api/transactions/request-refund/route.ts`

**Key Logic:**
```typescript
// COD orders that have been delivered are treated as "paid"
const isCODPaidOrder = 
  transaction.paymentMethod === "cod" && 
  (transaction.deliveryStatus === "delivered" || transaction.status === "completed");

const isPaidOrder = 
  transaction.paymentMethod === "cash" || 
  transaction.paymentMethod === "scan" || 
  transaction.paymentMethod === "wallet" ||
  isCODPaidOrder; // Include delivered COD

// No QR code required for COD or Cash
if ((transaction.paymentMethod === "scan" || transaction.paymentMethod === "wallet") && !qrCodeImage) {
  return error("QR code required");
}
```

### 2. Storefront Purchases Page
**File:** `pos-clothing-store-web/src/app/account/purchases/page.tsx`

**canRefund Logic:**
```typescript
const isPaidOrder = 
  row.paymentMethod === "cash" || 
  row.paymentMethod === "scan" || 
  row.paymentMethod === "wallet";

const isCODDelivered = 
  row.paymentMethod === "cod" && 
  displayStatus === "delivered";

const canRefund =
  // ALL delivered orders can request return (including COD)
  (displayStatus === "delivered" && 
   row.status !== "refunded" && 
   row.refundRequest?.status !== "pending") ||
  // Cancelled paid orders without cancellation refund
  (displayStatus === "cancelled" && 
   isPaidOrder && 
   !hasCancellationRefund && 
   row.refundRequest?.status !== "pending");
```

**Refund Modal:**
```typescript
const isCOD = row.paymentMethod === "cod";
const isScanPayment = row.paymentMethod === "scan" || row.paymentMethod === "wallet";

// QR upload only shown for Scan/Wallet, not for COD or Cash
{isScanPayment && (
  <div>Upload QR Code...</div>
)}
```

### 3. POS Refunds Page
**File:** `pos-clothing-store/clothing-store/src/app/owner/requests/refunds/page.tsx`

**isPaidOrder Check:**
```typescript
const isPaidOrder = 
  selectedRequest.paymentMethod === "cash" || 
  selectedRequest.paymentMethod === "scan" || 
  selectedRequest.paymentMethod === "wallet" ||
  (selectedRequest.paymentMethod === "cod" && 
   (selectedRequest.deliveryStatus === "delivered" || 
    selectedRequest.orderStatus === "delivered"));

if (!isPaidOrder) {
  const isCODNotDelivered = 
    selectedRequest.paymentMethod === "cod" && 
    selectedRequest.deliveryStatus !== "delivered";
  
  const errorMessage = isCODNotDelivered 
    ? "COD order not delivered yet. Customer hasn't paid."
    : "Order not paid yet.";
  
  toast.error(errorMessage);
  return;
}
```

### 4. POS Pending Refunds Page
**File:** `pos-clothing-store/clothing-store/src/app/owner/requests/pending-refunds/page.tsx`

**Filter Logic:**
```typescript
// Show COD orders in pending refunds if delivered
const isPaidOrder = 
  data.paymentMethod === "cash" || 
  data.paymentMethod === "scan" || 
  data.paymentMethod === "wallet" ||
  (data.paymentMethod === "cod" && 
   (data.deliveryStatus === "delivered" || 
    data.orderStatus === "delivered"));

if (!isPaidOrder) return; // Skip
```

---

## ✅ Testing Checklist

### Test Case 1: Delivered COD Order - Full Return
- [ ] Create COD order from storefront
- [ ] Mark as delivered in POS
- [ ] Customer requests return (all items)
- [ ] Owner inspects items (mark all as accepted)
- [ ] Verify orderStatus = "fully_returned"
- [ ] Verify payment status unchanged
- [ ] Verify inventory restored for accepted items
- [ ] Owner processes refund payment (gives cash)
- [ ] Verify payment status = "refunded"
- [ ] Verify orderStatus still = "fully_returned"

### Test Case 2: Delivered COD Order - Partial Return
- [ ] Create COD order with 2+ items
- [ ] Mark as delivered
- [ ] Customer requests return (1 item only)
- [ ] Owner inspects (mark as accepted)
- [ ] Verify orderStatus = "partially_returned"
- [ ] Owner processes refund
- [ ] Verify payment status = "partially_refunded"

### Test Case 3: COD Order Not Delivered Yet
- [ ] Create COD order
- [ ] Do NOT mark as delivered
- [ ] Customer tries to request return
- [ ] Verify "Request Return" button NOT shown
- [ ] Only "Request Cancellation" button shown

### Test Case 4: COD Order with Damaged Items
- [ ] Create COD order
- [ ] Mark as delivered
- [ ] Customer returns items
- [ ] Owner inspects (mark some as damaged)
- [ ] Verify damaged items NOT restored to inventory
- [ ] Verify customer still gets full refund

---

## 📝 Summary

### COD Order Lifecycle

```
1. ORDER PLACED (COD)
   └─ Payment Method: COD
   └─ Status: Pending
   └─ Customer hasn't paid yet

2. ORDER DELIVERED
   └─ Customer pays cash on delivery
   └─ Delivery Status: Delivered
   └─ NOW considered "paid order"

3. CUSTOMER REQUESTS RETURN (if needed)
   └─ Can request return (like Cash orders)
   └─ No QR code required
   └─ Selects items to return

4. OWNER INSPECTS ITEMS
   └─ Marks items as accepted/damaged
   └─ Updates orderStatus (Fully/Partially Returned)
   └─ Creates pending refund

5. OWNER PROCESSES REFUND
   └─ Gives cash to customer
   └─ Updates payment status (Fully/Partially Refunded)
   └─ Done!
```

### Key Points:

1. **COD Orders = Cash on Delivery**
   - Customer pays WHEN delivered
   - After delivery, treated as "paid" for refund purposes

2. **Return Process Same as Cash Orders:**
   - Request return → Inspect items → Process payment
   - No QR code required
   - Cash refund given

3. **2-Step Status Updates:**
   - Step 1: orderStatus updated (Fully/Partially Returned)
   - Step 2: Payment status updated (Fully/Partially Refunded)

4. **vs Undelivered COD:**
   - Undelivered: Simple cancellation, no refund
   - Delivered: Full refund process with inspection

5. **Inventory Handling:**
   - Accepted items: Restored to stock
   - Damaged items: NOT restored, but still refunded to customer

---

## 🎓 Business Logic

### Why COD Gets Full Refund Process After Delivery?

**Scenario:** Customer orders a shirt for 500 THB via COD

**At Order Time:**
- Customer hasn't paid
- Order Status: Pending
- Cancellation: Just cancel, no refund needed

**At Delivery:**
- Delivery person arrives
- Customer pays 500 THB cash
- Customer receives shirt
- Order Status: Delivered
- NOW the customer has paid!

**If Customer Returns:**
- Customer brings shirt back
- Owner inspects condition
- Owner gives 500 THB cash back
- Same as if they paid cash at time of purchase!

**Conclusion:** After delivery, COD orders = Cash orders for refund purposes

---

## Files Modified:

1. `pos-clothing-store-web/src/app/api/transactions/request-refund/route.ts`
   - Added COD delivered order check
   
2. `pos-clothing-store-web/src/app/account/purchases/page.tsx`
   - Updated canRefund logic for COD
   - No QR code requirement for COD
   
3. `pos-clothing-store/clothing-store/src/app/owner/requests/refunds/page.tsx`
   - Updated isPaidOrder checks (2 places)
   - Added error message for undelivered COD
   
4. `pos-clothing-store/clothing-store/src/app/owner/requests/pending-refunds/page.tsx`
   - Updated filter to include delivered COD orders

---

## ✨ Result

Delivered COD orders now have full return and refund functionality, working exactly like cash orders! 🎉
