/**
 * Script to find a transaction by transaction ID
 * Run: node scripts/find-transaction.js TEST-ONL-178776768272-4IS9MQ
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

async function findTransaction(transactionId) {
  console.log(`\n🔍 Searching for transaction: ${transactionId}\n`);

  try {
    // Search by transactionId field
    const snapshot = await db.collection('transactions')
      .where('transactionId', '==', transactionId)
      .get();

    if (snapshot.empty) {
      console.log('❌ No transaction found with transactionId:', transactionId);
      console.log('\nTrying to search in all transactions...');
      
      // Get all transactions and search
      const allSnapshot = await db.collection('transactions').limit(50).get();
      console.log(`\nFound ${allSnapshot.size} transactions. Recent ones:`);
      
      allSnapshot.docs.slice(0, 10).forEach(doc => {
        const data = doc.data();
        console.log(`\n  Document ID: ${doc.id}`);
        console.log(`  Transaction ID: ${data.transactionId || 'N/A'}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Order Status: ${data.orderStatus || 'N/A'}`);
      });
      
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('✅ Found transaction!');
      console.log(`\n  Document ID: ${doc.id}`);
      console.log(`  Transaction ID: ${data.transactionId}`);
      console.log(`  Payment Status: ${data.status}`);
      console.log(`  Order Status: ${data.orderStatus || 'N/A'}`);
      console.log(`  Refunds: ${data.refunds?.length || 0}`);
      
      console.log(`\n📝 To fix this transaction, run:`);
      console.log(`node scripts/fix-transaction-simple.js ${doc.id}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get transaction ID from command line argument
const transactionId = process.argv[2];

if (!transactionId) {
  console.error('❌ Please provide a transaction ID');
  console.log('Usage: node scripts/find-transaction.js <TRANSACTION_ID>');
  console.log('Example: node scripts/find-transaction.js TEST-ONL-178776768272-4IS9MQ');
  process.exit(1);
}

findTransaction(transactionId)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
