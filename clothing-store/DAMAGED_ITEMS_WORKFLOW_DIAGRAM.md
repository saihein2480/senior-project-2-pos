# Damaged Items Inspection - Visual Workflow

## Complete Return & Refund Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RETURN REQUEST WITH DAMAGED ITEMS WORKFLOW                │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: Customer Initiates Return Request
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Customer (Web App: /account/purchases)
│
├─ Views delivered order
├─ Clicks "Request Return"
├─ Selects items to return (1-3 items)
├─ Uploads payment QR code 📱 (required)
├─ Uploads item photos 📸 (1-5 photos, required)
├─ Enters return reason ✍️
└─ Clicks "Request Return"
    │
    ▼
📦 Database: transactions collection
    refundRequest: {
      type: "return",
      status: "pending",
      items: [selected items],
      qrCodeImage: "base64...",
      itemPhotos: ["base64...", "base64...", ...],
      reason: "Customer reason",
      requestedAt: timestamp
    }

════════════════════════════════════════════════════════════════════════════════

STEP 2: Owner Reviews & Approves Return
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 Owner (POS App: /owner/requests/refunds)
│
├─ Sees pending return request
├─ Reviews:
│  ├─ Requested items list
│  ├─ Customer photos 📸
│  └─ Return reason
├─ Decides: Approve or Reject
└─ Clicks "Approve"
    │
    ▼
📦 Database Update:
    refundRequest.status: "approved"
    refundRequest.approvedAt: timestamp
    │
    ▼
📧 Notification to Customer:
    "Return approved! Please visit store with items."

════════════════════════════════════════════════════════════════════════════════

STEP 3: Customer Brings Items to Store
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Customer (Physical Visit)
│
├─ Visits store
├─ Brings items for return
├─ Shows order confirmation
└─ Hands items to staff
    │
    ▼
👨‍💼 Owner receives items

════════════════════════════════════════════════════════════════════════════════

STEP 4: Owner Marks Items as Returned
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 Owner (POS App: /owner/requests/refunds)
│
├─ Clicks "Returned" button
│
▼
┌─────────────────────────────────────────┐
│  MODAL: Mark Items as Returned          │
├─────────────────────────────────────────┤
│ Customer Return                         │
│ Confirm customer brought items to store │
│                                         │
│ Items to Receive:                       │
│ ☐ W10783 × 1                           │
│ ☐ W10224 × 1                           │
│ ☐ W10225 × 1                           │
│                                         │
│ ⚠️ After marking, inspection required  │
│                                         │
│ Return Status: *                        │
│ ◉ Fully Returned                       │
│ ○ Partially Returned                   │
│                                         │
│ [Cancel] [Confirm Received ✓]          │
└─────────────────────────────────────────┘
    │
    └─ Owner selects: "Fully Returned"
    └─ Clicks "Confirm Received"
        │
        ▼
📦 Database Update (TWO collections):
    
    transactions:
      refundRequest.returnReceived: true
      refundRequest.returnReceivedAt: timestamp
      refundRequest.returnStatus: "fully_returned"
      orderStatus: "fully_returned" ← Customer sees this immediately
    
    onlineOrders:
      status: "fully_returned"
      orderStatus: "fully_returned"
      lastUpdated: timestamp
        │
        ▼
🔄 Auto-open Inspection Modal

════════════════════════════════════════════════════════════════════════════════

STEP 5: Owner Inspects Items (Critical Step!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 Owner (POS App: Inspection Modal)
│
▼
┌──────────────────────────────────────────────────────────────┐
│  🔍 INSPECTION MODAL: Inspect Returned Items                 │
├──────────────────────────────────────────────────────────────┤
│ 🔍 Inspection Guide                                          │
│ Mark as Accepted (good condition, will restock) or           │
│ Damaged (cannot restock). Customer gets full refund for all. │
│                                                              │
│ ──────────────────────────────────────────────────────────  │
│                                                              │
│ Item 1: W10783 - Ironside Gray, S                           │
│ [📷 Image] Qty: 1                                           │
│ Price: ฿350.00                                               │
│                                                              │
│ Inspection:                                                  │
│ ┌─────────────────┐  ┌─────────────────┐                   │
│ │ ✓ Accepted      │  │   Damaged       │                   │
│ │ Good condition  │  │   Cannot resell │                   │
│ │ Will restock    │  │   No restock    │                   │
│ └─────────────────┘  └─────────────────┘                   │
│                                                              │
│ ──────────────────────────────────────────────────────────  │
│                                                              │
│ Item 2: W10224 - Friar Gray, Free                           │
│ [📷 Image] Qty: 1                                           │
│ Price: ฿320.00                                               │
│                                                              │
│ Inspection:                                                  │
│ ┌─────────────────┐  ┌─────────────────┐                   │
│ │   Accepted      │  │ ✓ Damaged       │                   │
│ │ Good condition  │  │   Cannot resell │                   │
│ │ Will restock    │  │   No restock    │                   │
│ └─────────────────┘  └─────────────────┘                   │
│                                                              │
│ ──────────────────────────────────────────────────────────  │
│                                                              │
│ Item 3: W10225 - Blue Sky, M                                │
│ [📷 Image] Qty: 1                                           │
│ Price: ฿400.00                                               │
│                                                              │
│ Inspection:                                                  │
│ ┌─────────────────┐  ┌─────────────────┐                   │
│ │ ✓ Accepted      │  │   Damaged       │                   │
│ │ Good condition  │  │   Cannot resell │                   │
│ │ Will restock    │  │   No restock    │                   │
│ └─────────────────┘  └─────────────────┘                   │
│                                                              │
│ ──────────────────────────────────────────────────────────  │
│                                                              │
│ 💡 Customer receives full refund: ฿1,070.00                 │
│                                                              │
│ [Cancel] [Complete Inspection ✓]                            │
└──────────────────────────────────────────────────────────────┘
    │
    └─ Owner inspects all items:
       ├─ Item 1 (W10783): ✓ Accepted
       ├─ Item 2 (W10224): ✗ Damaged  
       └─ Item 3 (W10225): ✓ Accepted
    │
    └─ Clicks "Complete Inspection"
        │
        ▼
📦 Database Update (MULTIPLE operations):

    1️⃣ Save Inspection Results:
       refundRequest.inspectionCompleted: true
       refundRequest.itemInspectionResults: [
         { itemIndex: 0, status: "accepted", inspectedAt: "..." },
         { itemIndex: 1, status: "damaged", inspectedAt: "..." },
         { itemIndex: 2, status: "accepted", inspectedAt: "..." }
       ]
       refundRequest.status: "completed"
    
    2️⃣ Update Payment Status:
       paymentStatus: "pending_refund" ← Shows in all views
       status: "pending_refund"
    
    3️⃣ Create Pending Refund:
       refunds: [{
         refundId: "ref-12345",
         status: "pending", ← Awaiting payment confirmation
         items: [
           { itemIndex: 0, quantity: 1 },
           { itemIndex: 1, quantity: 1 },
           { itemIndex: 2, quantity: 1 }
         ],
         totalAmount: 1070.00, ← Full amount!
         inspectionResults: {
           0: "accepted",  ← Will restock
           1: "damaged",   ← Will NOT restock
           2: "accepted"   ← Will restock
         },
         createdAt: timestamp
       }]
    
    4️⃣ Sync to onlineOrders:
       paymentStatus: "pending_refund"
       lastUpdated: timestamp
        │
        ▼
🔄 Inventory Processing (Automatic):

    ╔═══════════════════════════════════════════════════╗
    ║         INVENTORY RESTOCKING LOGIC                ║
    ╠═══════════════════════════════════════════════════╣
    ║                                                   ║
    ║ FOR EACH ITEM IN RETURN:                         ║
    ║                                                   ║
    ║ IF inspection[item] === "accepted":              ║
    ║   ├─ ✅ RESTOCK TO INVENTORY                     ║
    ║   ├─ Add back to stock                           ║
    ║   └─ Update quantity                             ║
    ║                                                   ║
    ║ IF inspection[item] === "damaged":               ║
    ║   ├─ ❌ DO NOT RESTOCK                           ║
    ║   ├─ Log as damaged                              ║
    ║   └─ Track loss                                  ║
    ║                                                   ║
    ║ REFUND AMOUNT:                                   ║
    ║   ├─ ✅ Full refund for ALL items                ║
    ║   └─ Damage status does NOT affect refund       ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
    
    Result for our example:
    ✅ W10783 (accepted) → +1 to stock
    ❌ W10224 (damaged)  → NOT added to stock
    ✅ W10225 (accepted) → +1 to stock
    
    Customer refund: ฿1,070.00 (full amount for all 3 items!)

════════════════════════════════════════════════════════════════════════════════

STEP 6: Customer Sees Updated Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Customer (Web App: /account/purchases)
│
▼
┌──────────────────────────────────────────┐
│  Purchase History                        │
├──────────────────────────────────────────┤
│ Order: TEST-ONL-178789                   │
│                                          │
│ Order Status:    [Fully Returned]       │
│ Payment Status:  [Pending Refund]       │
│                                          │
│ Return Journey:                          │
│ ✅ Request Approved                      │
│ ✅ Items Returned to Store               │
│ ✅ Items Inspected                       │
│ ⏳ Processing Refund Payment             │
│                                          │
│ Inspection Results:                      │
│ ✓ Accepted: W10783, W10225              │
│ ⚠ Damaged: W10224                        │
│                                          │
│ 💡 Refund will be processed soon        │
└──────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════

STEP 7: Owner Confirms Refund Payment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 Owner (POS App: /owner/requests/pending-refunds)
│
├─ Sees pending refund in list
├─ Reviews refund details:
│  ├─ Refund amount: ฿1,070.00
│  ├─ Customer's QR code 📱
│  └─ Inspection results
│
▼
┌──────────────────────────────────────────┐
│  MODAL: Confirm Refund Payment           │
├──────────────────────────────────────────┤
│ Refund ID: ref-12345                     │
│                                          │
│ ⚠️ Confirm only after giving money       │
│                                          │
│ Refund Amount: ฿1,070.00                 │
│                                          │
│ Inspection Summary:                      │
│ ✓ Accepted items: 2 (restocked)         │
│ ⚠ Damaged items: 1 (not restocked)      │
│                                          │
│ Refund Method: *                         │
│ ◉ Cash                                   │
│ ○ Original Payment (QR Scan)            │
│ ○ Bank Transfer                          │
│                                          │
│ Refund Status: *                         │
│ ◉ Fully Refunded                         │
│ ○ Partially Refunded                     │
│                                          │
│ Notes: (optional)                        │
│ ┌────────────────────────────────┐      │
│ │ Refunded via QR scan to        │      │
│ │ customer's account             │      │
│ └────────────────────────────────┘      │
│                                          │
│ [Cancel] [Confirm Payment ✓]            │
└──────────────────────────────────────────┘
    │
    └─ Owner selects:
       ├─ Method: "Original Payment (QR Scan)"
       ├─ Status: "Fully Refunded"
       └─ Adds notes
    │
    └─ Clicks "Confirm Payment"
        │
        ▼
📦 Database Update (TWO collections):
    
    transactions:
      refunds[0].status: "completed"
      refunds[0].refundMethod: "original_payment"
      refunds[0].refundedAt: timestamp
      refunds[0].refundedBy: "owner@example.com"
      refunds[0].refundNotes: "Refunded via QR..."
      paymentStatus: "refunded" ← Final payment status
      status: "refunded"
    
    onlineOrders:
      paymentStatus: "refunded"
      lastUpdated: timestamp

════════════════════════════════════════════════════════════════════════════════

STEP 8: Customer Receives Refund
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Customer (Web App: /account/purchases)
│
▼
┌──────────────────────────────────────────────────────┐
│  Purchase History - Order Details                    │
├──────────────────────────────────────────────────────┤
│ Order: TEST-ONL-178789                               │
│                                                      │
│ Order Status:    [Fully Returned] ✅                 │
│ Payment Status:  [Fully Refunded] ✅                 │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ 💰 REFUND DETAILS                                   │
│                                                      │
│ Refund Amount:                                       │
│ ┌────────────────────────────────────────────┐     │
│ │  THB 1,070.00  (Full refund)               │     │
│ │  Ks 46,010     (MMK equivalent)            │     │
│ └────────────────────────────────────────────┘     │
│                                                      │
│ Method:          📱 QR Scan                         │
│ Confirmed:       Aug 27, 2026 1:00 PM              │
│ Processed by:    Owner                              │
│                                                      │
│ Note: Refunded via QR scan to customer's account    │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ 🔍 INSPECTION RESULTS                               │
│                                                      │
│ ✓ Accepted (2 items - restocked):                   │
│   • W10783 - Ironside Gray, S                       │
│   • W10225 - Blue Sky, M                            │
│                                                      │
│ ⚠ Damaged (1 item - not restocked):                 │
│   • W10224 - Friar Gray, Free                       │
│                                                      │
│ 💡 You received full refund for all items           │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ RETURN JOURNEY COMPLETE ✅                           │
│ ✅ Request Approved                                  │
│ ✅ Items Returned to Store                           │
│ ✅ Items Inspected                                   │
│ ✅ Refund Processed                                  │
│                                                      │
│ [Close]                                              │
└──────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════

💰 MONEY FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For QR Scan Payment:
┌─────────────┐                              ┌──────────────┐
│  Customer   │ ─────── 3-5 days ────────▶  │   Refund     │
│  Account    │       (automatic)            │   ฿1,070.00  │
└─────────────┘                              └──────────────┘

For Cash Payment:
┌─────────────┐                              ┌──────────────┐
│  Customer   │ ◀────── Visit store ─────────│     Cash     │
│             │      (bring receipt)         │   ฿1,070.00  │
└─────────────┘                              └──────────────┘

════════════════════════════════════════════════════════════════════════════════

📊 FINAL STATUS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ORDER STATUS vs PAYMENT STATUS                               │
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────┐        │
│  │   ORDER STATUS       │    │   PAYMENT STATUS     │        │
│  │   (Fulfillment)      │    │   (Money)            │        │
│  ├──────────────────────┤    ├──────────────────────┤        │
│  │                      │    │                      │        │
│  │  Delivered  ───────▶ │    │  Paid                │        │
│  │  Fully Returned      │    │  Pending Refund      │        │
│  │                      │    │  Refunded ✅         │        │
│  │                      │    │                      │        │
│  └──────────────────────┘    └──────────────────────┘        │
│                                                                │
│  INVENTORY IMPACT:                                            │
│  ✅ 2 items restocked (accepted)                              │
│  ❌ 1 item NOT restocked (damaged)                            │
│  Net change: +2 items                                         │
│                                                                │
│  CUSTOMER SATISFACTION:                                       │
│  ✅ Full refund received                                      │
│  ✅ Transparent process                                       │
│  ✅ Fair treatment                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Key Principles

### 1. Customer Always Wins
```
💡 Philosophy: Customer receives FULL refund regardless of damage
✅ Builds trust and loyalty
✅ Simplifies refund process
✅ Reduces disputes
```

### 2. Inventory Accuracy
```
📦 Logic: Only restock items that can be resold
✅ Accepted items → Back to stock
❌ Damaged items → Loss tracking
✅ Accurate inventory count
```

### 3. Two-Phase Status Update
```
Phase 1: Order Status (Step 4 & 5)
├─ Customer sees: "Fully Returned"
└─ Payment status: "Pending Refund"

Phase 2: Payment Status (Step 7)
├─ Customer sees: "Fully Refunded"
└─ Order status: Unchanged
```

### 4. Complete Transparency
```
👤 Customer sees:
├─ Inspection results
├─ Which items accepted/damaged
├─ Refund amount breakdown
└─ Payment method and timing

👨‍💼 Owner tracks:
├─ Full return history
├─ Inventory changes
├─ Loss from damaged items
└─ Customer satisfaction metrics
```

## Success Metrics

```
╔══════════════════════════════════════════════════════════╗
║                   PROCESS OUTCOMES                        ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  ✅ Customer Satisfaction: HIGH                          ║
║     • Full refund for all items                          ║
║     • Transparent process                                ║
║     • Clear communication                                ║
║                                                          ║
║  ✅ Inventory Accuracy: HIGH                             ║
║     • Only good items restocked                          ║
║     • Damaged items tracked                              ║
║     • Loss properly recorded                             ║
║                                                          ║
║  ✅ Business Intelligence: COMPLETE                      ║
║     • Return reasons tracked                             ║
║     • Damage rates analyzed                              ║
║     • Quality issues identified                          ║
║                                                          ║
║  ✅ Financial Clarity: CLEAR                             ║
║     • Refund amounts accurate                            ║
║     • Loss tracking for accounting                       ║
║     • Payment methods documented                         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```
