/**
 * Script to check customers in Firebase database
 * This helps diagnose why online customers aren't showing up
 * 
 * Run with: node scripts/check-customers.js
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
  console.log(`📦 Project ID: ${serviceAccount.project_id}\n`);
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('\nMake sure:');
  console.log('1. .env.local file exists in the project root');
  console.log('2. FIREBASE_SERVICE_ACCOUNT_KEY contains valid JSON');
  process.exit(1);
}

const db = admin.firestore();

async function checkCustomers() {
  try {
    console.log('🔍 Checking Firebase Collections...\n');
    
    // Check customers collection
    console.log('📊 CUSTOMERS Collection:');
    console.log('='.repeat(60));
    const customersSnapshot = await db.collection('customers').get();
    
    if (customersSnapshot.empty) {
      console.log('❌ No documents found in "customers" collection\n');
    } else {
      console.log(`✅ Found ${customersSnapshot.size} customer(s)\n`);
      
      let onlineCount = 0;
      let posCount = 0;
      let unmarkedCount = 0;
      
      customersSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const source = data.customerSource || 'unmarked';
        
        if (source === 'online') onlineCount++;
        else if (source === 'pos') posCount++;
        else unmarkedCount++;
        
        console.log(`${index + 1}. ${data.displayName || data.email || 'No name'}`);
        console.log(`   UID: ${doc.id}`);
        console.log(`   Email: ${data.email}`);
        console.log(`   Source: ${source}`);
        console.log(`   Type: ${data.customerType || 'not set'}`);
        console.log(`   Created: ${data.createdAt?.toDate?.() || data.createdAt || 'unknown'}`);
        console.log('');
      });
      
      console.log('Summary:');
      console.log(`- Online customers: ${onlineCount}`);
      console.log(`- POS customers: ${posCount}`);
      console.log(`- Unmarked customers: ${unmarkedCount}`);
      console.log('');
    }
    
    // Check users collection
    console.log('='.repeat(60));
    console.log('📊 USERS Collection (for comparison):');
    console.log('='.repeat(60));
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No documents found in "users" collection\n');
    } else {
      console.log(`✅ Found ${usersSnapshot.size} user(s)\n`);
      
      let customerRoleCount = 0;
      
      usersSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        
        if (data.role === 'customer') {
          customerRoleCount++;
          console.log(`${index + 1}. ${data.displayName || data.email || 'No name'}`);
          console.log(`   UID: ${doc.id}`);
          console.log(`   Email: ${data.email}`);
          console.log(`   Role: ${data.role}`);
          console.log(`   Has matching customer doc: ${customersSnapshot.docs.some(c => c.id === doc.id) ? '✅ Yes' : '❌ No'}`);
          console.log('');
        }
      });
      
      console.log(`Summary:`);
      console.log(`- Users with "customer" role: ${customerRoleCount}`);
      console.log('');
    }
    
    // Check transactions
    console.log('='.repeat(60));
    console.log('📊 TRANSACTIONS Collection (online orders):');
    console.log('='.repeat(60));
    const transactionsSnapshot = await db.collection('transactions')
      .where('source', '==', 'online')
      .limit(10)
      .get();
    
    if (transactionsSnapshot.empty) {
      console.log('❌ No online transactions found\n');
    } else {
      console.log(`✅ Found ${transactionsSnapshot.size} online transaction(s) (showing first 10)\n`);
      
      transactionsSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`${index + 1}. Transaction ID: ${data.transactionId || doc.id}`);
        console.log(`   Customer: ${data.customer?.displayName || data.customer?.email || 'Unknown'}`);
        console.log(`   Customer UID: ${data.customerUid || data.customer?.uid || 'Not set'}`);
        console.log(`   Total: ${data.total || 0}`);
        console.log(`   Status: ${data.status || 'unknown'}`);
        console.log('');
      });
    }
    
    console.log('='.repeat(60));
    console.log('\n💡 Recommendations:');
    console.log('');
    
    if (unmarkedCount > 0) {
      console.log(`⚠️  You have ${unmarkedCount} unmarked customer(s).`);
      console.log('   Run: node scripts/mark-online-customers.js');
      console.log('');
    }
    
    if (customerRoleCount > customersSnapshot.size) {
      console.log(`⚠️  You have ${customerRoleCount - customersSnapshot.size} user(s) without customer documents.`);
      console.log('   These are online users who haven\'t been synced to the customers collection.');
      console.log('   They will be synced automatically when they place their first order.');
      console.log('');
    }
    
    if (customersSnapshot.size === 0 && usersSnapshot.size === 0) {
      console.log('ℹ️  No customers or users found in the database.');
      console.log('   1. Register a customer account on the storefront (http://localhost:3001)');
      console.log('   2. Place a test order');
      console.log('   3. Run this script again to verify');
      console.log('');
    }
    
    console.log('✅ Database check complete!\n');
    
  } catch (error) {
    console.error('\n❌ Error checking database:', error);
    throw error;
  }
}

// Run the check
checkCustomers()
  .then(() => {
    console.log('Script completed. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
