# Online Customer Management

This document explains how to view and manage online customers in the POS system.

## Overview

The POS system now supports viewing customers from both:
- **POS**: Customers added manually through the POS system
- **Online**: Customers who registered through the e-commerce storefront

## Features

### Customer Page Enhancements

Navigate to: `http://localhost:3000/owner/inventory/customers`

**New Features:**
1. **Customer Source Filter**: Toggle between viewing:
   - All Customers
   - 🌐 Online Customers (from e-commerce site)
   - 🏪 POS Customers (manually added)

2. **Statistics Dashboard**: Six cards showing:
   - Total Customers
   - Online Customers count
   - POS Customers count
   - Retailer count
   - Wholesaler count
   - Total Receivables

3. **Customer Information**: All customers display:
   - Profile picture
   - Name and email
   - Contact info (phone, address)
   - Purchase history (Total Spent, Total Purchases)
   - Registration date
   - Customer type badge (online customers are marked as "individual" by default)

## Setup Instructions

### 1. Run the Migration Script (One-time)

If you have existing customers in your database, run this script to mark them as online or POS customers:

```bash
cd "d:\Projects\Senior Project 2\Senior-Project-2-POS-CS\pos-clothing-store\clothing-store"
node scripts/mark-online-customers.js
```

**What it does:**
- Scans all customers in the `customers` collection
- Checks if they have a corresponding `users` document (indicates online registration)
- Adds `customerSource` field: "online" or "pos"
- Adds `isOnline` boolean field
- Updates the database

**Output:**
```
📊 Fetching all customers...
Found 50 total customers

✓ Marked as ONLINE: John Doe (abc123...)
✓ Marked as POS: Jane Smith (def456...)

====================================================
📈 SUMMARY
====================================================
Total customers: 50
Already marked: 0
Newly updated: 50
Online customers: 25
POS customers: 25
====================================================
```

### 2. Automatic Syncing (Already Configured)

**For New Online Customers:**
- When a customer registers on the storefront, they're automatically:
  - Added to the `users` collection with role: "customer"
  - Added to the `customers` collection with `customerSource: "online"` and `isOnline: true`

**When Orders Are Placed:**
- COD orders: Customer is synced to POS immediately when order is created
- Online payment orders: Customer is synced when payment webhook is received
- Customer stats are updated: `totalPurchases` and `totalSpent`

**For New POS Customers:**
- Manually created customers automatically get:
  - `customerSource: "pos"`
  - `isOnline: false`

## Technical Details

### Database Schema

**customers collection:**
```typescript
{
  uid: string,
  email: string,
  displayName: string,
  phone: string,
  address: string,
  customerType: "individual" | "retailer" | "wholesaler" | "distributor" | "other",
  customerSource: "online" | "pos",  // NEW FIELD
  isOnline: boolean,                  // NEW FIELD
  totalPurchases: number,
  totalSpent: number,
  receivables: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Modified Files

**Storefront (pos-clothing-store-web):**
1. `src/contexts/CustomerAuthContext.tsx` - Marks new registrations as online customers
2. `src/app/api/transactions/create-cod/route.ts` - Syncs customers when COD orders are placed
3. `src/app/api/mmpay/webhook/route.ts` - Updates customer stats when payments complete
4. `src/lib/updateCustomerStats.ts` - Helper functions for customer sync and stats

**POS System (clothing-store):**
1. `src/types/customer.ts` - Added new fields to Customer type
2. `src/services/customerService.ts` - Added source filtering logic
3. `src/app/api/customers/route.ts` - Added customerSource query parameter
4. `src/app/owner/inventory/customers/page.tsx` - Added UI filters and statistics

### API Endpoints

**Get Customers with Filter:**
```
GET /api/customers?customerSource=online
GET /api/customers?customerSource=pos
GET /api/customers?customerSource=all
```

**Get Customer Statistics:**
```
GET /api/customers/stats
```

Returns:
```json
{
  "success": true,
  "data": {
    "totalCustomers": 50,
    "onlineCustomers": 25,
    "posCustomers": 25,
    "retailerCustomers": 10,
    "wholesalerCustomers": 5,
    "totalReceivables": 150000
  }
}
```

## Troubleshooting

### Step 1: Check if customers exist in Firebase

Run the diagnostic script to see what's in your database:

```bash
cd "d:\Projects\Senior Project 2\Senior-Project-2-POS-CS\pos-clothing-store\clothing-store"
node scripts/check-customers.js
```

This will show you:
- How many customers exist in the `customers` collection
- How many users exist in the `users` collection
- Which customers are marked as online vs POS
- Any mismatches between users and customers

### Step 2: Verify you have online customers

If you don't have any customers yet:

1. **Register a customer on the storefront:**
   - Go to: `http://localhost:3001/auth/register`
   - Create an account with email and password
   - Or use Google Sign-In

2. **Place a test order** (this will sync the customer):
   - Browse products
   - Add items to cart
   - Proceed to checkout
   - Complete payment (use test payment or COD)

3. **Run the check script again:**
   ```bash
   node scripts/check-customers.js
   ```

### Step 3: Manual sync if needed

If a user exists but doesn't appear in the customers collection:

```bash
node scripts/sync-user-to-customer.js user@example.com
```

Replace `user@example.com` with the actual email address.

### Step 4: Run migration for existing customers

If you have existing customers without the `customerSource` field:

```bash
node scripts/mark-online-customers.js
```

### Online customers not showing up

1. **Check if migration was run:**
   ```bash
   node scripts/mark-online-customers.js
   ```

2. **Verify Firebase collections:**
   - Check if customer exists in `users` collection
   - Check if customer exists in `customers` collection
   - Verify `customerSource` and `isOnline` fields exist

3. **Check browser console:**
   - Open Developer Tools (F12)
   - Look for any API errors when loading the customers page

4. **Check Firebase connection:**
   - Verify both POS and storefront use the same Firebase project
   - Check `.env.local` files have matching `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

### Customer stats not updating

1. **Check webhook configuration:**
   - Ensure MyanMyanPay webhook is configured correctly
   - Check webhook logs in Firebase Functions

2. **Manual sync:**
   - Customer stats are updated only when orders are paid/completed
   - COD orders don't update stats until delivered and marked as completed

### Filter not working

1. **Clear browser cache:**
   ```
   Ctrl + Shift + R (hard reload)
   ```

2. **Check API response:**
   - Open Network tab in Developer Tools
   - Look at `/api/customers` request
   - Verify `customerSource` parameter is being sent

### Common Issues

**Issue**: "No customers found" even though customers exist in Firebase
- **Solution**: Check that both applications connect to the same Firebase project
- Verify `NEXT_PUBLIC_FIREBASE_PROJECT_ID` matches in both `.env.local` files

**Issue**: Online customers show up but with no purchase history
- **Solution**: Customer stats are only updated when orders are completed/paid
- For COD orders, they need to be marked as delivered
- For online payments, webhook needs to process successfully

**Issue**: Customer appears as "POS" instead of "Online"
- **Solution**: Run the migration script or manually sync the customer
- Check if `customerSource` field exists and is set to "online"

## Future Enhancements

- [ ] Add export functionality for online customers
- [ ] Add email marketing integration for online customers
- [ ] Add customer segmentation based on purchase behavior
- [ ] Add customer lifetime value (CLV) calculation
- [ ] Add customer purchase history timeline view
