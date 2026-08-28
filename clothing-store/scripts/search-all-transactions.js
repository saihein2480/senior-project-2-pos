/**
 * Script to search all transactions
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

async function searchAllTransactions() {
  console.log('\n🔍 Searching all transactions with refunds...\n');

  try {
    // Get ALL transactions
    const snapshot = await db.collection('transactions').get();
    
    console.log(`Total transactions: ${snapshot.size}\n`);
    
    const transactionsWithRefunds = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.refunds && data.refunds.length > 0) {
        transactionsWithRefunds.push({
          docId: doc.id,
          transactionId: data.transactionId,
          status: data.status,
          orderStatus: data.orderStatus,
          refundsCount: data.refunds.length,
          total: data.total,
          timestamp: data.timestamp
        });
      }
    });
    
    console.log(`Transactions with refunds: ${transactionsWithRefunds.length}\n`);
    
    if (transactionsWithRefunds.length > 0) {
      console.log('Recent transactions with refunds:');
      transactionsWithRefunds.slice(-10).forEach((txn, i) => {
        console.log(`\n${i + 1}. Document ID: ${txn.docId}`);
        console.log(`   Transaction ID: ${txn.transactionId || 'N/A'}`);
        console.log(`   Payment Status: ${txn.status}`);
        console.log(`   Order Status: ${txn.orderStatus || 'N/A'}`);
        console.log(`   Refunds: ${txn.refundsCount}`);
        console.log(`   Total: ${txn.total}`);
        console.log(`   Date: ${txn.timestamp || 'N/A'}`);
      });
      
      console.log(`\n\n📝 To fix a transaction with wrong status:`);
      console.log(`node scripts/update-transaction-status.js <DOC_ID> partially_refunded partially_returned`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

searchAllTransactions()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
