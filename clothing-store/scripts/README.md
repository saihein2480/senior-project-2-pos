# Migration Scripts

This directory contains one-time migration scripts to update existing data in the database.

## Available Migrations

### Refund Status Migration (`migrate-refund-status.ts`)

Updates payment status and order status for existing transactions with completed refunds.

**What it does:**
- Finds all transactions with completed refunds
- Updates payment status to "refunded" or "partially_refunded" based on refund amount
- Updates order status to "returned" for delivered orders with full refunds
- Updates order status to "cancelled" for cancellation refunds

**When to run:**
Run this script ONCE after implementing the refund status updates to migrate existing data.

**How to run:**

1. Make sure you have all dependencies installed:
   ```bash
   npm install
   ```

2. Make sure your `.env.local` file has the correct Firebase credentials:
   ```
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   ```

3. Run the migration script:
   ```bash
   npx ts-node scripts/migrate-refund-status.ts
   ```

4. Check the console output to see:
   - Total transactions processed
   - Number of transactions updated
   - Details of each update

**Example Output:**
```
🔄 Starting refund status migration...

✅ Updated transaction TXN-12345:
   Payment Status: paid → refunded
   Order Status: delivered → returned

✅ Updated transaction TXN-67890:
   Payment Status: paid → partially_refunded
   Order Status: delivered → delivered

============================================================
📊 Migration Summary:
============================================================
Total transactions processed: 50
Transactions updated: 12
Transactions skipped: 38
============================================================

✨ Migration completed successfully!
```

**Important Notes:**
- This script is idempotent - it's safe to run multiple times
- It will only update transactions that need updating
- No data is deleted, only statuses are updated
- Always backup your database before running migrations

## Troubleshooting

### Error: "Cannot find module 'dotenv'"
Install missing dependencies:
```bash
npm install dotenv
```

### Error: "Firebase Admin not initialized"
Check that your `.env.local` file exists and has the correct `FIREBASE_SERVICE_ACCOUNT_KEY`.

### Error: "Permission denied"
Make sure your Firebase service account has write permissions to the `transactions` collection.

## Creating New Migrations

When creating a new migration script:

1. Create a new file in this directory: `migrate-[feature-name].ts`
2. Use the `migrate-refund-status.ts` as a template
3. Add documentation to this README
4. Test thoroughly on a development database first
5. Always include:
   - Clear console output showing progress
   - Summary statistics
   - Error handling
   - Idempotent logic (safe to run multiple times)
