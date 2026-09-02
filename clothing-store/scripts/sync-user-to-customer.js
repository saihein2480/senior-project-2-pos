/**
 * Script to manually sync a user to the customers collection
 * Use this if a user exists in the "users" collection but not in "customers"
 * 
 * Run with: node scripts/sync-user-to-customer.js <userEmail>
 * Example: node scripts/sync-user-to-customer.js john@example.com
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Error: Please provide a user email');
  console.log('\nUsage: node scripts/sync-user-to-customer.js <userEmail>');
  console.log('Example: node scripts/sync-user-to-customer.js john@example.com\n');
  process.exit(1);
}

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
  
  console.log('✅ Firebase Admin initialized successfully\n');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('\nMake sure:');
  console.log('1. .env.local file exists in the project root');
  console.log('2. FIREBASE_SERVICE_ACCOUNT_KEY contains valid JSON');
  process.exit(1);
}

const db = admin.firestore();

async function syncUserToCustomer(email) {
  try {
    console.log(`🔍 Looking for user with email: ${email}...\n`);
    
    // Find user by email
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      console.error(`❌ No user found with email: ${email}`);
      console.log('\nMake sure:');
      console.log('1. The email is correct');
      console.log('2. The user has registered on the storefront');
      console.log('3. You\'re connected to the correct Firebase project\n');
      return;
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const uid = userDoc.id;
    
    console.log('✅ Found user:');
    console.log(`   UID: ${uid}`);
    console.log(`   Name: ${userData.displayName || 'Not set'}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Role: ${userData.role || 'Not set'}`);
    console.log('');
    
    // Check if user is a customer
    if (userData.role !== 'customer') {
      console.warn(`⚠️  Warning: User role is "${userData.role}", not "customer"`);
      console.log('   This user may not be a storefront customer.');
      console.log('   Do you want to continue anyway? (Ctrl+C to cancel)\n');
      
      // Wait 3 seconds before continuing
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Check if customer document already exists
    const customerDocRef = db.collection('customers').doc(uid);
    const customerDoc = await customerDocRef.get();
    
    if (customerDoc.exists) {
      console.log('ℹ️  Customer document already exists. Updating...\n');
      
      const existingData = customerDoc.data();
      console.log('   Existing data:');
      console.log(`   - Total Spent: ${existingData.totalSpent || 0}`);
      console.log(`   - Total Purchases: ${existingData.totalPurchases || 0}`);
      console.log(`   - Customer Source: ${existingData.customerSource || 'not set'}`);
      console.log('');
    }
    
    // Create/update customer document
    const customerData = {
      uid: uid,
      email: userData.email || '',
      displayName: userData.displayName || 'Customer',
      phone: userData.phone || '',
      address: userData.address || '',
      customerType: userData.customerType || 'individual',
      customerSource: 'online',
      isOnline: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (!customerDoc.exists) {
      // Create new customer document
      customerData.totalPurchases = 0;
      customerData.totalSpent = 0;
      customerData.receivables = 0;
      customerData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      
      await customerDocRef.set(customerData);
      console.log('✅ Created new customer document!');
    } else {
      // Update existing customer document (preserve stats)
      await customerDocRef.update(customerData);
      console.log('✅ Updated customer document!');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Customer Document Summary:');
    console.log('='.repeat(60));
    
    const updatedDoc = await customerDocRef.get();
    const updatedData = updatedDoc.data();
    
    console.log(`UID: ${updatedData.uid}`);
    console.log(`Name: ${updatedData.displayName}`);
    console.log(`Email: ${updatedData.email}`);
    console.log(`Phone: ${updatedData.phone || 'Not set'}`);
    console.log(`Address: ${updatedData.address || 'Not set'}`);
    console.log(`Customer Type: ${updatedData.customerType}`);
    console.log(`Source: ${updatedData.customerSource}`);
    console.log(`Is Online: ${updatedData.isOnline}`);
    console.log(`Total Spent: ${updatedData.totalSpent || 0}`);
    console.log(`Total Purchases: ${updatedData.totalPurchases || 0}`);
    console.log('='.repeat(60));
    
    console.log('\n✅ Sync completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('1. Refresh the POS customer page (http://localhost:3000/owner/inventory/customers)');
    console.log('2. Filter by "Online Customers" to see this customer');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error syncing user:', error);
    throw error;
  }
}

// Run the sync
syncUserToCustomer(userEmail)
  .then(() => {
    console.log('Script completed. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
