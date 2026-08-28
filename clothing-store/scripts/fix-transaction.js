/**
 * Quick script to fix transaction status
 * Run: node scripts/fix-transaction.js TEST-ONL-178776768272-4IS9MQ
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function fixTransaction(transactionId) {
  console.log(`\n🔧 Fixing transaction: ${transactionId}\n`);

  try {
    const transactionRef = db.collection('transactions').doc(transactionId);
    const doc = await transactionRef.get();

    if (!doc.exists) {
      console.error(`❌ Transaction ${transactionId} not found!`);
      return;
    }

    const data = doc.data();
    console.log('Current data:');
    console.log('  Payment Status:', data?.status);
    console.log('  Order Status:', data?.orderStatus);
    console.log('  Refunds:', data?.refunds?.length || 0);

    // Update to partially refunded status
    await transactionRef.update({
      status: 'partially_refunded',
      orderStatus: 'partially_returned',
    });

    console.log('\n✅ Transaction updated successfully!');
    console.log('  New Payment Status: partially_refunded');
    console.log('  New Order Status: partially_returned');
    
    console.log('\n📱 Refresh customer page: http://localhost:3001/account/purchases');
    console.log('   You should now see:');
    console.log('   - Payment Status: 🟠 Partially Refunded');
    console.log('   - Order Status: 🟪 Partially Returned');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get transaction ID from command line argument
const transactionId = process.argv[2];

if (!transactionId) {
  console.error('❌ Please provide a transaction ID');
  console.log('Usage: node scripts/fix-transaction.js <TRANSACTION_ID>');
  console.log('Example: node scripts/fix-transaction.js TEST-ONL-178776768272-4IS9MQ');
  process.exit(1);
}

fixTransaction(transactionId)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
