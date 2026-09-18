# Notification System Usage Guide

This guide explains how to create notifications in your POS system that will appear in the top nav bar dropdown and the notifications page.

## Overview

The notification system consists of:
1. **TopNavBar Dropdown** - Quick preview of latest 5 notifications
2. **Notifications Page** (`/owner/notifications`) - Full list of all notifications
3. **Sidebar Badge** - Unread count indicator
4. **NotificationService** - Helper service to create notifications

---

## Creating Notifications

### Using the NotificationService (Recommended)

The `NotificationService` provides convenient methods for common notification types:

```typescript
import { NotificationService } from "@/services/notificationService";

// 1. New Online Order
await NotificationService.notifyNewOrder(
  "ORD-12345",           // orderId
  "John Doe"             // customerName
);

// 2. Cancellation Request
await NotificationService.notifyCancellationRequest(
  "TXN-67890",          // transactionId
  "ORD-12345"           // orderId
);

// 3. Return/Refund Request
await NotificationService.notifyRefundRequest(
  "TXN-67890",          // transactionId
  "ORD-12345"           // orderId
);

// 4. Low Stock Alert
await NotificationService.notifyLowStock(
  "Nike Air Max",       // productName
  5                     // stockLevel
);

// 5. Out of Stock Alert
await NotificationService.notifyOutOfStock(
  "Adidas Ultraboost"   // productName
);
```

### Custom Notifications

For custom notification types, use the `create` method:

```typescript
await NotificationService.create({
  type: "online_order",           // or other types
  title: "Custom Title",
  message: "Your custom message here",
  link: "/owner/some-page",       // Optional: where to navigate on click
  metadata: {                     // Optional: additional data
    orderId: "123",
    customField: "value"
  }
});
```

---

## Notification Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `online_order` | 🛒 Shopping Cart | Blue | New online orders |
| `cancellation_request` | ❌ X Circle | Orange | Order cancellations |
| `refund_request` | 🔄 Rotate | Purple | Return requests |
| `low_stock` | ⚠️ Alert | Yellow | Stock running low |
| `out_of_stock` | 📦 Package | Red | Stock depleted |

---

## Where to Add Notifications

### 1. Online Orders Page

When a new online order is created:

```typescript
// In: src/app/owner/sales/online-orders/page.tsx
// Or wherever online orders are processed

import { NotificationService } from "@/services/notificationService";

// After order is created
await NotificationService.notifyNewOrder(
  order.id,
  order.customerName
);
```

### 2. Cancellation Requests

When a customer requests cancellation:

```typescript
// In: src/app/owner/requests/cancellations/page.tsx
// Or in your cancellation handler

await NotificationService.notifyCancellationRequest(
  transaction.id,
  transaction.orderId
);
```

### 3. Return Requests

When a customer requests a return:

```typescript
// In: src/app/owner/requests/refunds/page.tsx
// Or in your refund handler

await NotificationService.notifyRefundRequest(
  transaction.id,
  transaction.orderId
);
```

### 4. Stock Management

When updating stock levels:

```typescript
// In: src/app/owner/inventory/stocks/page.tsx
// Or in your stock update handler

// After updating stock
if (newStockLevel === 0) {
  await NotificationService.notifyOutOfStock(productName);
} else if (newStockLevel <= 10 && oldStockLevel > 10) {
  // Only notify when crossing the threshold
  await NotificationService.notifyLowStock(productName, newStockLevel);
}
```

---

## Example: Complete Integration

Here's a complete example of integrating notifications when an online order is placed:

```typescript
// In your online order creation function

async function createOnlineOrder(orderData: OrderData) {
  try {
    // 1. Create the order in database
    const order = await createOrder(orderData);
    
    // 2. Create notification
    await NotificationService.notifyNewOrder(
      order.id,
      orderData.customerName
    );
    
    // 3. Show success message
    toast.success("Order created successfully!");
    
    return order;
  } catch (error) {
    console.error("Error creating order:", error);
    toast.error("Failed to create order");
    return null;
  }
}
```

---

## Notification Features

### Users Can:
- ✅ Click notification to navigate to related page
- ✅ Mark individual notifications as read
- ✅ Mark all notifications as read
- ✅ Delete individual notifications
- ✅ Clear all read notifications
- ✅ Filter by "All" or "Unread"
- ✅ See real-time updates (new notifications appear automatically)

### Real-Time Updates:
The system uses Firebase Firestore real-time listeners:
- New notifications appear immediately
- Unread count updates automatically
- No page refresh needed

---

## Database Structure

Notifications are stored in Firestore:

**Collection:** `notifications`

**Document Structure:**
```typescript
{
  id: string;                    // Auto-generated
  type: NotificationType;        // Type of notification
  title: string;                 // Notification title
  message: string;               // Notification message
  link?: string;                 // Optional: URL to navigate to
  metadata?: {                   // Optional: additional data
    orderId?: string;
    transactionId?: string;
    productName?: string;
    stockLevel?: number;
  };
  read: boolean;                 // Read status
  createdAt: Timestamp;          // Creation timestamp
}
```

---

## Best Practices

1. **Be Specific**: Use descriptive titles and messages
   ```typescript
   // ❌ Bad
   title: "New Order"
   
   // ✅ Good
   title: "New Online Order"
   message: "Order #12345 has been placed by John Doe"
   ```

2. **Always Include Links**: Help users navigate to relevant pages
   ```typescript
   link: "/owner/sales/online-orders"
   ```

3. **Add Metadata**: Include IDs for future reference
   ```typescript
   metadata: {
     orderId: order.id,
     transactionId: transaction.id
   }
   ```

4. **Avoid Spam**: Don't create duplicate notifications
   ```typescript
   // Check if notification already exists before creating
   ```

5. **Use Appropriate Types**: Choose the correct notification type for better organization

---

## Troubleshooting

### Notifications Not Appearing?

1. Check if Firestore is initialized:
   ```typescript
   console.log("DB initialized:", !!db);
   ```

2. Check browser console for errors

3. Verify notification was created:
   ```typescript
   const notifId = await NotificationService.notifyNewOrder(...);
   console.log("Created notification:", notifId);
   ```

4. Check Firebase Console → Firestore → `notifications` collection

### Notifications Not Clickable?

Make sure you're providing a valid `link`:
```typescript
link: "/owner/sales/online-orders"  // Must start with /
```

---

## Future Enhancements

Potential additions:
- Email notifications
- Push notifications (browser)
- SMS notifications
- User notification preferences
- Notification categories/filters
- Mark notifications as important/starred
- Notification sound alerts

---

## Support

For issues or questions about the notification system, check:
1. This documentation
2. Component source code in `src/components/ui/TopNavBar.tsx`
3. Service code in `src/services/notificationService.ts`
4. Page code in `src/app/owner/notifications/page.tsx`
