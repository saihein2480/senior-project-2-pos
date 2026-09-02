/**
 * Script to mark existing customers as online customers
 * This updates all customers in the 'customers' collection that don't have
 * a customerSource field and marks them appropriately.
 * 
 * Run with: node scripts/mark-online-customers.js
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin from environment variable
try {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (!serviceAccountKey) {
    console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
    console.log('\nMake sure .env.local file exists and contains FIREBASE_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }
  
  const serviceAccount = JSON.parse(serviceAccountKey);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('\nMake sure:');
  console.log('1. .env.local file exists in the project root');
  console.log('2. FIREBASE_SERVICE_ACCOUNT_KEY contains valid JSON');
  process.exit(1);
}

const db = admin.firestore();

async function markOnlineCustomers() {
  try {
    console.log('\n📊 Fetching all customers...');
    
    const customersRef = db.collection('customers');
    const snapshot = await customersRef.get();
    
    if (snapshot.empty) {
      console.log('No customers found in the database.');
      return;
    }
    
    console.log(`Found ${snapshot.size} total customers\n`);
    
    let onlineCount = 0;
    let posCount = 0;
    let updatedCount = 0;
    let alreadyMarkedCount = 0;
    
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Check if already has customerSource
      if (data.customerSource) {
        alreadyMarkedCount++;
        if (data.customerSource === 'online') {
          onlineCount++;
        } else if (data.customerSource === 'pos') {
          posCount++;
        }
        continue;
      }
      
      // Check if this customer has a corresponding user document (indicates online registration)
      const userDoc = await db.collection('users').doc(doc.id).get();
      const isOnlineCustomer = userDoc.exists && userDoc.data()?.role === 'customer';
      
      // Update the customer document
      const updateData = {
        customerSource: isOnlineCustomer ? 'online' : 'pos',
        isOnline: isOnlineCustomer,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.update(doc.ref, updateData);
      batchCount++;
      updatedCount++;
      
      if (isOnlineCustomer) {
        onlineCount++;
        console.log(`✓ Marked as ONLINE: ${data.displayName || data.email} (${doc.id})`);
      } else {
        posCount++;
        console.log(`✓ Marked as POS: ${data.displayName || data.email} (${doc.id})`);
      }
      
      // Commit batch if it reaches the limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`\n💾 Committed batch of ${batchCount} updates\n`);
        batchCount = 0;
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n💾 Committed final batch of ${batchCount} updates\n`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total customers: ${snapshot.size}`);
    console.log(`Already marked: ${alreadyMarkedCount}`);
    console.log(`Newly updated: ${updatedCount}`);
    console.log(`Online customers: ${onlineCount}`);
    console.log(`POS customers: ${posCount}`);
    console.log('='.repeat(60));
    console.log('\n✅ Migration completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    throw error;
  }
}

// Run the migration
markOnlineCustomers()
  .then(() => {
    console.log('Script completed. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
