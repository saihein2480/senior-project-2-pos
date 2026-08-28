# Order Ref Column Update - Owner Online Orders Page

## Change Made

Updated the column name in the online orders table from "Order ID" to "Order Ref" for consistency.

### File Modified:
- `pos-clothing-store/clothing-store/src/app/owner/sales/online-orders/page.tsx`

## Summary

### Change:
- **Before**: "Order ID"
- **After**: "Order Ref"

### Location:
- Page: `http://localhost:3000/owner/sales/online-orders`
- Table header, first data column (after checkbox column)

## Column Structure (Updated)

```
┌───┬────────────┬──────────┬───────┬────────┬────────┬────────┬────────┬─────────┐
│ ☑ │ Order Ref  │ Customer │ Items │ Amount │ Payment│ Payment│ Order  │ Actions │
│   │            │          │       │        │ Method │ Status │ Status │         │
└───┴────────────┴──────────┴───────┴────────┴────────┴────────┴────────┴─────────┘
```

## Reasoning

### Terminology Consistency:
This change aligns with the terminology used in the customer purchases page where:
- **Customer View**: "Order ID" shows the transaction/order identifier
- **Customer View**: "Transaction ID" shows the transaction ID (conditionally for COD)
- **Owner View**: "Order Ref" shows the order reference

### Naming Convention:
- **Order Ref**: Reference number for the order (used by owner to identify orders)
- **Order ID**: Identifier for the customer's order (used by customer)
- **Transaction ID**: Internal transaction identifier

## Related Pages

### Customer Purchases Page (`/account/purchases`):
```
Columns:
1. Order ID          ← Customer's order identifier
2. Amount
3. Payment Method
4. Payment Status
5. Order Status
6. Date
7. Transaction ID    ← Internal transaction ID
8. Actions
```

### Owner Online Orders Page (`/owner/sales/online-orders`):
```
Columns:
1. ☑ (Checkbox)
2. Order Ref         ← Order reference (formerly "Order ID")
3. Customer
4. Items
5. Amount (THB + MMK)
6. Payment Method
7. Payment Status
8. Order Status
9. Actions
```

## Code Change

### Before:
```tsx
<th className="px-4 py-3 font-medium">Order ID</th>
```

### After:
```tsx
<th className="px-4 py-3 font-medium">Order Ref</th>
```

## Display Examples

### Owner View (Online Orders):
```
Order Ref           Customer        Items   Amount
TXN-0000000000065   John Doe        1 item  ฿ 278.20
                                            Ks 11,963
```

### Customer View (Purchases):
```
Order ID            Amount          Trans. ID
TXN-0000000000065   ฿ 278.20        TXN-0000000000065
                    Ks 11,963       (shown when paid)
```

## Benefits

### 1. Clear Distinction
- "Order Ref" clearly indicates this is a reference for the owner to track orders
- "Order ID" on customer side is the customer's order identifier
- "Transaction ID" is the internal transaction tracking

### 2. Professional Terminology
- "Ref" (Reference) is commonly used in business operations
- Aligns with typical order management terminology

### 3. Consistency
- Both customer and owner views now have distinct, clear column names
- Less confusion about what each column represents

## Testing Checklist

### Visual Verification:
- [ ] Go to `http://localhost:3000/owner/sales/online-orders`
- [ ] Check table header
- [ ] Column name shows "Order Ref" ✓
- [ ] Data still displays correctly ✓

### Functional Verification:
- [ ] Sorting by column still works ✓
- [ ] Search functionality works ✓
- [ ] Order details display correctly ✓
- [ ] NEW badge appears correctly ✓

## Summary

✅ **Changed**: "Order ID" → "Order Ref"  
✅ **Location**: Owner online orders page header  
✅ **Purpose**: Clearer terminology and consistency  
✅ **Impact**: Visual only, no functional changes  

**Status:** Complete ✅
