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

async function fixRefundStatuses() {
  try {
    console.log('Fetching all transactions with refunds...');
    
    const snapshot = await db.collection('transactions').get();
    let updatedCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const refunds = data.refunds || [];
      const completedRefunds = refunds.filter(r => r.status === 'completed');
      
      if (completedRefunds.length === 0) {
        continue;
      }
      
      // Check if this is a return request
      const refundRequest = data.refundRequest;
      const isReturnType = refundRequest?.type === 'return';
      const wasDelivered = data.orderStatus === 'delivered' || data.orderStatus === 'delivering';
      
      // Calculate total refunded
      const totalRefunded = completedRefunds.reduce((sum, r) => sum + (r.amount || r.totalAmount || 0), 0);
      const orderTotal = data.total || 0;
      
      // Determine correct statuses
      let newStatus = data.status;
      let newOrderStatus = data.orderStatus;
      let needsUpdate = false;
      
      // Update payment status
      if (totalRefunded >= orderTotal && data.status !== 'refunded') {
        newStatus = 'refunded';
        needsUpdate = true;
      } else if (totalRefunded > 0 && totalRefunded < orderTotal && data.status !== 'partially_refunded') {
        newStatus = 'partially_refunded';
        needsUpdate = true;
      }
      
      // Update order status for returns
      if ((wasDelivered || isReturnType) && completedRefunds.length > 0) {
        if (newStatus === 'refunded' && data.orderStatus !== 'fully_returned') {
          newOrderStatus = 'fully_returned';
          needsUpdate = true;
        } else if (newStatus === 'partially_refunded' && data.orderStatus !== 'partially_returned') {
          newOrderStatus = 'partially_returned';
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        console.log(`\nUpdating transaction: ${doc.id}`);
        console.log(`  Order Ref: ${data.onlineOrderId}`);
        console.log(`  Old status: ${data.status} → New status: ${newStatus}`);
        console.log(`  Old orderStatus: ${data.orderStatus} → New orderStatus: ${newOrderStatus}`);
        
        await doc.ref.update({
          status: newStatus,
          orderStatus: newOrderStatus
        });
        
        updatedCount++;
      }
    }
    
    console.log(`\n✅ Updated ${updatedCount} transactions`);
    process.exit(0);
  } catch (error) {
    console.error('Error fixing refund statuses:', error);
    process.exit(1);
  }
}

fixRefundStatuses();
