# Damaged Items Refund Rejection Workflow

## Overview
This document describes the complete workflow for handling damaged returned items with refund rejection, damage reason input, customer notifications, and status updates across all views.

## Key Changes

### 1. **Damage Reason Input in Inspection Modal**
- When owner marks an item as "Damaged", a **textarea appears** requiring a damage reason
- Validation ensures all damaged items have damage reasons before completing inspection
- Damage reasons are saved in `itemInspectionResults` array

### 2. **Status Changed: "no_refund_needed" → "refund_rejected"**
All instances of "no_refund_needed" status have been replaced with "refund_rejected" across:
- POS Owner dashboard
- Customer storefront
- Database records
- All views

### 3. **Customer Notifications**
When damaged items are found, the system automatically sends notifications to customers with:
- Notification type: `refund_rejected` or `partial_refund_with_damaged_items`
- Detailed damage reasons for each damaged item
- Explanation of refund policy
- Order reference and transaction details

### 4. **Status Updates Across All Views**
The "refund_rejected" status now appears in:
- **Customer Purchases Page** (`http://localhost:3001/account/purchases`)
- **Owner Online Orders** (`http://localhost:3000/owner/sales/online-orders`)
- **Owner Online Transactions** (`http://localhost:3000/owner/sales/online-transactions`)

## Complete Workflow

### **Scenario A: All Items Damaged (Full Rejection)**

```
┌──────────────────────────────────────────────┐
│ 1. Customer Returns Items                    │
│    Owner marks return as received            │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 2. Inspection Modal Opens                    │
│    • Owner inspects each item                │
│    • Clicks "Damaged" for all items          │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 3. Damage Reason Textareas Appear            │
│    ⚠️ Required for each damaged item         │
│    📝 Example: "Item has visible stains"     │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 4. Validation on "Complete Inspection"       │
│    ✅ All items inspected?                   │
│    ✅ All damaged items have reasons?        │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 5. Database Updates                          │
│    • paymentStatus = "refund_rejected"       │
│    • status = "refund_rejected"              │
│    • Save itemInspectionResults with reasons │
│    • Sync to onlineOrders collection         │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 6. Customer Notification Created             │
│    Collection: "notifications"               │
│    Type: "refund_rejected"                   │
│    Title: "Refund Request Rejected"          │
│    Message: Includes all damage reasons      │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 7. Status Visible Everywhere                 │
│    • Customer Purchases: "Refund Rejected"   │
│    • Owner Online Orders: "Refund Rejected"  │
│    • Owner Transactions: "Refund Rejected"   │
│    • Customer Notifications: New message     │
└──────────────────────────────────────────────┘
```

**Notification Message Example:**
```
Title: Refund Request Rejected - Items Damaged

Your refund request for order TXN-123 has been rejected because 
all returned items were found to be damaged and not in resellable 
condition.

Damage Details:
• W10783 (White T-Shirt): Item has visible stains on front
• W10224 (Blue Jeans): Torn fabric on left leg

As per our policy, damaged items are not eligible for refund. 
If you have any questions, please contact us.
```

---

### **Scenario B: Some Items Damaged (Partial Rejection)**

```
┌──────────────────────────────────────────────┐
│ 1. Customer Returns Items                    │
│    Owner marks return as received            │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 2. Inspection Modal Opens                    │
│    • Item 1: ✅ Accepted                     │
│    • Item 2: ❌ Damaged (requires reason)    │
│    • Item 3: ✅ Accepted                     │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 3. Complete Inspection                       │
│    • Filters: Only accepted items for refund │
│    • Damaged items excluded from refund      │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 4. Database Updates                          │
│    • paymentStatus = "pending_refund"        │
│    • Creates refund for accepted items only  │
│    • Saves inspection results with reasons   │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 5. Customer Notification Created             │
│    Type: "partial_refund_with_damaged_items" │
│    Explains: Which items accepted/rejected   │
│    Lists: Damage reasons for rejected items  │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│ 6. Appears in Pending Refund Payments        │
│    Owner can confirm payment for accepted    │
│    items only                                │
└──────────────────────────────────────────────┘
```

**Notification Message Example:**
```
Title: Partial Refund - Some Items Damaged

Your return for order TXN-123 has been inspected.

✅ Accepted Items: 2 item(s) - Refund will be processed
❌ Damaged Items: 1 item(s) - Not eligible for refund

Damage Details:
• W10224 (Blue Jeans): Torn fabric on left leg

Only accepted items will be refunded. If you have any questions, 
please contact us.
```

---

## Technical Implementation Details

### Files Modified

1. **`pos-clothing-store/clothing-store/src/app/owner/requests/refunds/page.tsx`**
   - Added `damageReasons` state: `{ [itemIndex: number]: string }`
   - Added textarea input that appears when item marked as "Damaged"
   - Added validation to ensure damage reasons are provided
   - Updated `itemInspectionResults` to include `damageReason` field
   - Changed status from "no_refund_needed" to "refund_rejected"
   - Added notification creation logic for both scenarios
   - Syncs status to `onlineOrders` collection

2. **`pos-clothing-store-web/src/app/account/purchases/page.tsx`**
   - Updated `getNormalizedPaymentStatus()` to return "refund_rejected"
   - Changed label from "No Refund (All Damaged)" to "Refund Rejected"
   - Updated badge color to red: `bg-red-100 text-red-700 border-red-200`

3. **`pos-clothing-store/clothing-store/src/app/owner/sales/online-orders/page.tsx`**
   - Added "refund_rejected" to `PaymentWorkflowStatus` type
   - Updated `getPaymentStatusLabel()` to return "Refund Rejected"
   - Updated `getNormalizedPaymentStatus()` to handle "refund_rejected"

4. **`pos-clothing-store/clothing-store/src/app/owner/sales/online-transactions/page.tsx`**
   - Added conditional styling for "refund_rejected" status
   - Badge color: `bg-red-100 text-red-800`
   - Label: "Refund Rejected"

### Database Schema Updates

**`transactions` collection:**
```typescript
{
  paymentStatus: "refund_rejected",
  status: "refund_rejected",
  refundRequest: {
    status: "completed_no_refund",
    inspectionCompleted: true,
    itemInspectionResults: [
      {
        itemIndex: 0,
        status: "damaged",
        damageReason: "Item has visible stains on front", // NEW FIELD
        inspectedAt: "2026-08-27T10:30:00.000Z"
      }
    ],
    inspectedBy: "owner@store.com",
    inspectedAt: "2026-08-27T10:30:00.000Z"
  }
}
```

**`onlineOrders` collection:**
```typescript
{
  paymentStatus: "refund_rejected", // Synced from transactions
  lastUpdated: "2026-08-27T10:30:00.000Z"
}
```

**`notifications` collection (NEW):**
```typescript
{
  userId: "customer_uid",
  type: "refund_rejected", // or "partial_refund_with_damaged_items"
  title: "Refund Request Rejected - Items Damaged",
  message: "Your refund request for order TXN-123...\n\nDamage Details:\n• Item: Reason",
  orderId: "TXN-123",
  onlineOrderId: "order_id",
  transactionId: "transaction_id",
  branchId: "branch_id",
  read: false,
  createdAt: serverTimestamp()
}
```

---

## Validation Rules

### Complete Inspection Button Validation:
1. ✅ **All items must be inspected** (either "accepted" or "damaged")
2. ✅ **All damaged items must have damage reason** (non-empty string)
3. ❌ Cannot proceed if validation fails

### Damage Reason Requirements:
- **Minimum:** Non-empty string (after trim)
- **Purpose:** Explain to customer why item is damaged
- **Visibility:** Sent to customer in notification
- **Best Practice:** Be specific (e.g., "Item has stains" not just "Damaged")

---

## Status Flow Diagram

```
Customer Returns → Mark Received → Inspect Items
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                  All Damaged                     Has Accepted
                        │                               │
                        ▼                               ▼
              "refund_rejected"               "pending_refund"
                        │                               │
                        ▼                               ▼
           Customer Notification              Pending Refund Payments
           (All items damaged)                (Accepted items only)
                        │                               │
                        ▼                               ▼
              Case Closed                       Owner Confirms Payment
              No refund                                 │
                                                        ▼
                                           "refunded" or "partially_refunded"
```

---

## Where Customer Sees Status

### 1. **Purchases Page** (`/account/purchases`)
- Payment Status badge: **"Refund Rejected"** (Red)
- Order details show inspection results (if available)

### 2. **Notifications Page** (`/account/notifications`)
- New notification with title: "Refund Request Rejected - Items Damaged"
- Full message with damage reasons for each item
- Notification type badge
- Timestamp

---

## Where Owner Sees Status

### 1. **Online Orders** (`/owner/sales/online-orders`)
- Payment Status column shows: **"Refund Rejected"**
- Can filter by payment status

### 2. **Online Transactions** (`/owner/sales/online-transactions`)
- Payment Status badge: **"Refund Rejected"** (Red badge)
- Can filter by status

### 3. **Refund Requests** (`/owner/requests/refunds`)
- After inspection completion, transaction moves out of this page
- No longer shows in pending refunds (case closed)

---

## Customer Experience Flow

```
1. Customer logs in to storefront
   ↓
2. Goes to "My Purchases" page
   ↓
3. Sees order with status: "Refund Rejected"
   ↓
4. Clicks notification icon (bell)
   ↓
5. Sees new notification:
   "Refund Request Rejected - Items Damaged"
   ↓
6. Reads detailed damage reasons for each item
   ↓
7. Understands why refund was rejected
```

---

## Testing Checklist

### Inspection Flow:
- [ ] Mark item as "Damaged" → Damage reason textarea appears
- [ ] Leave damage reason empty → Validation prevents completion
- [ ] Fill damage reason → Validation passes
- [ ] Complete inspection → Status updates to "refund_rejected"

### Database Updates:
- [ ] `transactions.paymentStatus` = "refund_rejected"
- [ ] `transactions.refundRequest.itemInspectionResults` contains `damageReason`
- [ ] `onlineOrders.paymentStatus` = "refund_rejected"
- [ ] `notifications` collection has new notification

### Customer Views:
- [ ] Purchases page shows "Refund Rejected" badge (red)
- [ ] Notifications page shows new notification
- [ ] Notification message includes damage reasons
- [ ] Notification timestamp is correct

### Owner Views:
- [ ] Online Orders shows "Refund Rejected" in Payment Status
- [ ] Online Transactions shows "Refund Rejected" badge (red)
- [ ] Can filter by "refund_rejected" status
- [ ] Transaction no longer appears in Refund Requests

### Partial Refund Case:
- [ ] Some items damaged, some accepted
- [ ] Notification explains which items accepted/rejected
- [ ] Only accepted items create pending refund
- [ ] Damage reasons included in notification

---

## Important Notes

1. **Damage reasons are customer-facing**: Write clear, professional explanations
2. **Notifications are permanent**: Customer can view history
3. **Status is final**: Once "refund_rejected", cannot be changed back
4. **No inventory restock**: Damaged items are not returned to stock
5. **No refund created**: For all-damaged cases, no pending refund entry

---

## Future Enhancements (Optional)

1. **Photo evidence**: Allow owner to upload damage photos
2. **Damage categories**: Dropdown with common damage types
3. **Dispute system**: Allow customer to dispute rejection
4. **Analytics**: Track damage patterns by product/customer
5. **Damage cost tracking**: Calculate loss from damaged items

---

## Support Contact

If you have questions about this workflow, contact the development team.

**Last Updated:** August 27, 2026
**Version:** 1.0
