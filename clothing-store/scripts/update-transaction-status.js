/**
 * Script to update transaction status
 * Run: node scripts/update-transaction-status.js <DOC_ID> <PAYMENT_STATUS> <ORDER_STATUS>
 * Example: node scripts/update-transaction-status.js TEST-ONL-1787767682722-4IS9MQ partially_refunded partially_returned
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Read .env.local file manually
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

let serviceAccountKey = null;
for (const line of lines) {
  if (line.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY=')) {
    serviceAccountKey = line.substring('FIREBASE_SERVICE_ACCOUNT_KEY='.length).trim();
    break;
  }
}

if (!serviceAccountKey) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
  process.exit(1);
}

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(serviceAccountKey);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function updateTransactionStatus(docId, paymentStatus, orderStatus) {
  console.log(`\n🔧 Updating transaction: ${docId}\n`);

  try {
    const transactionRef = db.collection('transactions').doc(docId);
    const doc = await transactionRef.get();

    if (!doc.exists) {
      console.error(`❌ Transaction ${docId} not found!`);
      return;
    }

    const data = doc.data();
    console.log('Current data:');
    console.log('  Payment Status:', data?.status);
    console.log('  Order Status:', data?.orderStatus || 'N/A');
    console.log('  Refunds:', data?.refunds?.length || 0);

    // Update status
    const updates = {};
    if (paymentStatus) {
      updates.status = paymentStatus;
    }
    if (orderStatus) {
      updates.orderStatus = orderStatus;
    }

    await transactionRef.update(updates);

    console.log('\n✅ Transaction updated successfully!');
    if (paymentStatus) console.log('  New Payment Status:', paymentStatus);
    if (orderStatus) console.log('  New Order Status:', orderStatus);
    
    console.log('\n📱 Refresh customer page: http://localhost:3001/account/purchases');
    console.log('   You should now see the updated statuses!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get arguments
const docId = process.argv[2];
const paymentStatus = process.argv[3];
const orderStatus = process.argv[4];

if (!docId) {
  console.error('❌ Please provide at least a document ID');
  console.log('Usage: node scripts/update-transaction-status.js <DOC_ID> [PAYMENT_STATUS] [ORDER_STATUS]');
  console.log('Example: node scripts/update-transaction-status.js TEST-ONL-1787767682722-4IS9MQ partially_refunded partially_returned');
  process.exit(1);
}

updateTransactionStatus(docId, paymentStatus, orderStatus)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
