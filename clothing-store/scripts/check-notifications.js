// Script to check notifications in the database
// Run with: node scripts/check-notifications.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Get service account path from environment or use default
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || 
  path.join(__dirname, '../serviceAccountKey.json');

console.log('Using service account:', serviceAccountPath);

// Initialize Firebase Admin
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function checkNotifications() {
  console.log('Checking notifications collection...\n');
  
  try {
    const notificationsRef = db.collection('notifications');
    const snapshot = await notificationsRef.get();
    
    console.log(`Total notifications: ${snapshot.size}\n`);
    
    if (snapshot.empty) {
      console.log('No notifications found in database.');
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('─────────────────────────────────────────');
      console.log(`Document ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`Title: ${data.title}`);
      console.log(`User ID: ${data.userId}`);
      console.log(`Order ID: ${data.orderId}`);
      console.log(`Transaction ID: ${data.transactionId}`);
      console.log(`Created At: ${data.createdAt?.toDate()}`);
      console.log(`Read: ${data.read}`);
      console.log(`Message:\n${data.message}`);
      console.log('─────────────────────────────────────────\n');
    });
    
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
}

checkNotifications()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
