/**
 * Script to create test notifications in Firestore
 * Run with: node scripts/create-test-notification.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('Make sure serviceAccountKey.json exists in the project root');
  process.exit(1);
}

const db = admin.firestore();

// Notification types and their default links
const notificationTypes = {
  online_order: {
    title: 'New Online Order',
    message: 'Order #TEST-001 has been placed by Test Customer',
    link: '/owner/sales/online-orders'
  },
  cancellation_request: {
    title: 'Order Cancellation Request',
    message: 'Customer requested to cancel order #TEST-002',
    link: '/owner/requests/cancellations'
  },
  refund_request: {
    title: 'Return Request',
    message: 'Customer requested a return for order #TEST-003',
    link: '/owner/requests/refunds'
  },
  low_stock: {
    title: 'Low Stock Alert',
    message: 'Test Product is running low (5 items left)',
    link: '/owner/inventory/stocks'
  },
  out_of_stock: {
    title: 'Out of Stock Alert',
    message: 'Test Product is now out of stock',
    link: '/owner/inventory/stocks'
  }
};

async function createTestNotification(type) {
  const notifData = notificationTypes[type];
  
  if (!notifData) {
    console.error(`❌ Invalid notification type: ${type}`);
    console.log('Valid types:', Object.keys(notificationTypes).join(', '));
    return;
  }

  try {
    const docRef = await db.collection('notifications').add({
      type: type,
      title: notifData.title,
      message: notifData.message,
      link: notifData.link,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        test: true
      }
    });

    console.log(`✅ Created ${type} notification with ID:`, docRef.id);
    console.log(`   Title: ${notifData.title}`);
    console.log(`   Link: ${notifData.link}`);
  } catch (error) {
    console.error('❌ Error creating notification:', error);
  }
}

async function createAllTestNotifications() {
  console.log('Creating test notifications...\n');
  
  for (const type of Object.keys(notificationTypes)) {
    await createTestNotification(type);
  }
  
  console.log('\n✅ All test notifications created!');
  console.log('Check your app to see them in:');
  console.log('  - TopNavBar bell icon dropdown');
  console.log('  - /owner/notifications page');
  console.log('  - Sidebar notifications badge');
}

// Run the script
const args = process.argv.slice(2);
const type = args[0];

if (type === 'all') {
  createAllTestNotifications().then(() => process.exit(0));
} else if (type) {
  createTestNotification(type).then(() => process.exit(0));
} else {
  console.log('Usage:');
  console.log('  node scripts/create-test-notification.js <type>');
  console.log('  node scripts/create-test-notification.js all');
  console.log('');
  console.log('Available types:');
  Object.keys(notificationTypes).forEach(t => console.log(`  - ${t}`));
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/create-test-notification.js online_order');
  console.log('  node scripts/create-test-notification.js all');
  process.exit(1);
}
