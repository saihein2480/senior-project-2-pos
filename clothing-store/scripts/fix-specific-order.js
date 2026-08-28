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
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixSpecificOrder() {
  try {
    const transactionId = 'TEST-ONL-1787802312603-4I23PQ';
    console.log(`Checking transaction: ${transactionId}`);
    
    const snapshot = await db.collection('transactions')
      .where('transactionId', '==', transactionId)
      .get();
    
    if (snapshot.empty) {
      console.log('Transaction not found');
      process.exit(1);
    }
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    console.log('\nCurrent data:');
    console.log('  Status:', data.status);
    console.log('  Order Status:', data.orderStatus);
    console.log('  Refunds:', data.refunds);
    console.log('  Refund Request:', data.refundRequest);
    
    // Update to partially_returned
    await doc.ref.update({
      orderStatus: 'partially_returned'
    });
    
    console.log('\n✅ Updated order status to: partially_returned');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixSpecificOrder();
