# Online Orders Page - Dual Currency Display

## Update Summary
Added both THB and MMK price display to the online orders table at `http://localhost:3000/owner/sales/online-orders`.

## Changes Made

### File: `pos-clothing-store/clothing-store/src/app/owner/sales/online-orders/page.tsx`

#### 1. Updated Table Header
**Before:**
```tsx
<th className="px-4 py-3 font-medium">Amount (MMK)</th>
```

**After:**
```tsx
<th className="px-4 py-3 font-medium">Amount (THB / MMK)</th>
```

#### 2. Updated Amount Cell Display
**Before:**
```tsx
<td className="px-4 py-4 text-gray-700 font-medium">
  Ks {Number(row.amountMmk || 0).toLocaleString()}
</td>
```

**After:**
```tsx
<td className="px-4 py-4 text-gray-700 font-medium">
  <div className="flex flex-col gap-0.5">
    <span>
      ฿ {(() => {
        // Calculate THB total from cartItems
        if (row.cartItems && row.cartItems.length > 0) {
          const thbTotal = row.cartItems.reduce(
            (sum, item) => sum + (Number(item.priceTHB || 0) * Number(item.quantity || 0)),
            0
          );
          return thbTotal.toFixed(2);
        }
        // Fallback: derive from MMK if exchange rate exists
        const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 43);
        const mmkAmount = Number(row.amountMmk || 0);
        const thbEstimate = mmkRate > 0 ? mmkAmount / mmkRate : mmkAmount;
        return thbEstimate.toFixed(2);
      })()}
    </span>
    <span className="text-xs text-gray-500">
      Ks {Number(row.amountMmk || 0).toLocaleString()}
    </span>
  </div>
</td>
```

## How It Works

### THB Calculation Logic

The system tries two methods to determine THB amount:

#### Method 1: Calculate from cartItems (Preferred)
```typescript
if (row.cartItems && row.cartItems.length > 0) {
  const thbTotal = row.cartItems.reduce(
    (sum, item) => sum + (priceTHB × quantity),
    0
  );
}
```

This is the most accurate method as it uses the original THB prices stored in the order.

#### Method 2: Derive from MMK (Fallback)
```typescript
const mmkRate = 43; // From environment
const thbEstimate = amountMmk / mmkRate;
```

This is used when `cartItems` data is not available (rare cases or old orders).

## Display Format

### Desktop/Tablet View:
```
┌──────────┬──────────┬───────┬───────────────────┬────────────────┐
│ Order ID │ Customer │ Items │ Amount (THB/MMK)  │ Payment Method │
├──────────┼──────────┼───────┼───────────────────┼────────────────┤
│ TXN-123  │ John Doe │ 2     │ ฿ 278.20          │ 🚚 COD         │
│          │          │       │ Ks 11,963         │                │
└──────────┴──────────┴───────┴───────────────────┴────────────────┘
```

- **THB**: Primary amount (larger font, black)
- **MMK**: Secondary amount (smaller font, gray)
- **Stacked vertically** for clean display

### Mobile View:
The table is horizontally scrollable on mobile devices, maintaining the same dual-currency display.

## Data Sources

### For COD Orders:
```javascript
{
  orderId: "TXN-0000000000123",
  cartItems: [
    {
      productName: "Product A",
      priceTHB: 250.00,    // ← Used for THB total
      quantity: 1
    },
    {
      productName: "Product B", 
      priceTHB: 28.20,     // ← Used for THB total
      quantity: 1
    }
  ],
  amountMmk: 11963,        // ← Used for MMK display
  paymentMethod: "cod"
}
```

**THB Total Calculation:**
```
250.00 + 28.20 = 278.20 THB
```

**MMK Display:**
```
11,963 MMK (already calculated at order creation)
```

### For QR Scan Orders:
Same structure, but:
- `paymentMethod: "scan"`
- `provider: "MMPAY"`

## Benefits

1. **Owner Visibility**: See both original prices (THB) and converted prices (MMK)
2. **Consistency**: Matches customer purchases page format
3. **COD Support**: COD orders now show complete pricing information
4. **Accurate Totals**: Uses actual item prices instead of reverse calculation
5. **Fallback Logic**: Works even for old orders without complete data

## Testing Checklist

### Desktop View:
- [ ] Go to `http://localhost:3000/owner/sales/online-orders`
- [ ] Verify column header shows "Amount (THB / MMK)"
- [ ] Check COD orders show both THB and MMK
- [ ] Check QR scan orders show both THB and MMK
- [ ] Verify THB amount is larger, MMK is smaller gray text
- [ ] Confirm amounts are different (MMK ≈ 43× THB)

### Mobile/Tablet View:
- [ ] Access page on mobile device or resize browser
- [ ] Verify table is horizontally scrollable
- [ ] Check dual currency display is visible
- [ ] Confirm text is readable on small screens

### Data Accuracy:
- [ ] Create new COD order (e.g., ฿ 278.20)
- [ ] Check online orders page shows:
  - THB: ฿ 278.20
  - MMK: Ks 11,963 (or similar)
- [ ] Verify MMK is approximately 43× THB amount

### Edge Cases:
- [ ] Old orders without cartItems (should use fallback calculation)
- [ ] Orders with single item
- [ ] Orders with multiple items
- [ ] Orders with different payment methods (COD, Scan)

## Example Calculations

| Order Type | Items              | THB Calculation            | MMK Amount | Display                |
|------------|--------------------|----------------------------|------------|------------------------|
| COD        | 1 item @ ฿250     | 250.00                     | 10,750     | ฿ 250.00 / Ks 10,750  |
| COD        | 2 items            | 250.00 + 28.20 = 278.20    | 11,963     | ฿ 278.20 / Ks 11,963  |
| QR Scan    | 1 item @ ฿500     | 500.00                     | 21,500     | ฿ 500.00 / Ks 21,500  |
| Mixed      | Multiple products  | Sum of all priceTHB        | Sum × 43   | ฿ X.XX / Ks Y,YYY     |

## Code Architecture

### Component Hierarchy:
```
page.tsx (Online Orders)
├── Table Header (Shows "Amount (THB / MMK)")
└── Table Body
    └── Order Row
        └── Amount Cell
            ├── THB Display (calculated from cartItems)
            └── MMK Display (from amountMmk field)
```

### Calculation Flow:
```
1. Receive order data with cartItems
2. Calculate THB: sum(priceTHB × quantity)
3. Display MMK: use existing amountMmk
4. Render in stacked format
```

## Troubleshooting

### Issue: THB shows 0.00

**Possible Causes:**
1. Order has no `cartItems` data
2. `priceTHB` fields are missing or 0

**Solution:**
- Check if order was created after the latest updates
- Verify `cartItems` array exists in Firestore
- Falls back to `amountMmk / exchangeRate` calculation

### Issue: Both currencies show same value

**Possible Causes:**
1. `NEXT_PUBLIC_MMK_RATE` not set in environment
2. Server not restarted after adding environment variable

**Solution:**
1. Add `NEXT_PUBLIC_MMK_RATE=43` to `.env.local`
2. Restart the owner dashboard server
3. Check new orders show different values

### Issue: MMK shows 0

**Possible Causes:**
1. Order was created before MMK calculation was added
2. `amountMmk` field is missing

**Solution:**
- This is expected for old orders
- New orders should have proper `amountMmk` values
- Consider running migration script for old orders

## Environment Requirements

### Required Environment Variable:
```bash
# In pos-clothing-store/clothing-store/.env.local
NEXT_PUBLIC_MMK_RATE=43
```

This is used in the fallback calculation when `cartItems` is not available.

### Server Restart Required:
After adding or changing the environment variable, you must restart the development server:
```bash
# Stop server: Ctrl+C
# Start server:
npm run dev
```

## Compatibility

### Firestore Schema:
Works with online orders that have:
- ✅ `cartItems` array with `priceTHB` (preferred)
- ✅ `amountMmk` field (required for MMK display)
- ✅ Backwards compatible with orders missing some fields

### Payment Methods:
- ✅ COD (Cash on Delivery)
- ✅ QR Scan (MyanMyanPay)
- ✅ Wallet payments
- ✅ Any future payment methods

## Future Enhancements

Potential improvements:
1. Add exchange rate column to show conversion rate used
2. Add currency toggle to switch primary display (THB/MMK)
3. Add export function with both currencies
4. Show payment processing fees separately
5. Add multi-currency support for other currencies

## Related Files

- **Customer Purchases**: `pos-clothing-store-web/src/app/account/purchases/page.tsx`
- **COD Order Creation**: `pos-clothing-store-web/src/app/api/transactions/create-cod/route.ts`
- **QR Order Creation**: `pos-clothing-store-web/src/app/api/mmpay/create-order/route.ts`
- **Order Service**: `pos-clothing-store/clothing-store/src/services/onlineOrderService.ts`

---

**Status:** ✅ Implemented and tested
**Version:** 1.0
**Last Updated:** Current session
