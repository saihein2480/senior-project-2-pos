/**
 * Script to check a specific transaction
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

async function checkTransaction(docId) {
  console.log(`\n🔍 Checking transaction: ${docId}\n`);

  try {
    const transactionRef = db.collection('transactions').doc(docId);
    const doc = await transactionRef.get();

    if (!doc.exists) {
      console.error(`❌ Transaction ${docId} not found!`);
      return;
    }

    const data = doc.data();
    console.log('Transaction Data:');
    console.log('  Document ID:', doc.id);
    console.log('  Transaction ID:', data.transactionId);
    console.log('  Payment Status:', data.status);
    console.log('  Order Status:', data.orderStatus || 'N/A');
    console.log('  Total:', data.total);
    console.log('  Refunds:', data.refunds?.length || 0);
    
    if (data.refunds && data.refunds.length > 0) {
      console.log('\nRefund Details:');
      data.refunds.forEach((refund, i) => {
        console.log(`  Refund ${i + 1}:`);
        console.log(`    - Status: ${refund.status}`);
        console.log(`    - Amount: ${refund.totalAmount}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

const docId = process.argv[2] || 'TEST-ONL-1787767682722-4IS9MQ';

checkTransaction(docId)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
