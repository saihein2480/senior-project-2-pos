# Payment System Implementation - Complete Guide

## Overview
This document describes the comprehensive payment system implemented for both POS and customer storefront, supporting Cash, COD (Cash on Delivery), and Scan/QR payment methods with full cancellation, refund, and delivery tracking functionality.

## Payment Methods

### 1. Cash Payment (POS Only)
- **Status**: Completed immediately
- **Features**:
  - Amount validation (must be >= total)
  - Automatic change calculation
  - Multi-currency support (THB/MMK)
  - Instant receipt printing
- **Workflow**: Select Cash → Enter amount → Print receipt → Transaction completed

### 2. COD (Cash on Delivery)
- **Available**: POS and Web Storefront
- **Status**: Pending initially
- **Features**:
  - Customer address validation required
  - Delivery status tracking
  - Can be approved, cancelled, or refunded
  - Inventory deducted immediately
- **Workflow**:
  - **POS**: Select COD → Create order → Pending status → Track delivery → Mark delivered → Complete
  - **Web**: Select COD → Enter details → Submit → View in purchases

### 3. Scan/QR Payment
- **Available**: POS and Web Storefront
- **Status**: Pending initially (POS), Completed after payment (Web)
- **Features**:
  - QR code generation (Web via MyanMyanPay)
  - Payment status polling (Web)
  - Delivery tracking support
  - Can be approved or cancelled
- **Workflow**:
  - **POS**: Select Scan → Create pending order → Approve after payment → Track delivery
  - **Web**: Select QR → Scan code → Auto-complete → View in purchases

## Transaction Status System

### Status Types
1. **pending**: Order created, awaiting confirmation (COD, Scan from POS)
2. **completed**: Payment received and confirmed
3. **cancelled**: Order cancelled, inventory restored
4. **refunded**: Full refund processed, inventory restored
5. **partially_refunded**: Partial refund processed

### Status Transitions
```
pending → completed (approve order)
pending → cancelled (reject/cancel order)
completed → partially_refunded (refund some items)
completed/partially_refunded → refunded (refund all remaining)
any → cancelled (cancel with inventory restoration)
```

## Delivery Tracking System

### Delivery Status Types
1. **pending**: Order received, not yet confirmed
2. **confirmed**: Order confirmed, preparing for shipment
3. **shipped**: Order in transit
4. **delivered**: Order delivered, transaction auto-completed
5. **cancelled**: Delivery cancelled

### Delivery Workflow
```
COD/Scan Order → pending → confirmed → shipped → delivered (auto-complete)
                    ↓
                cancelled (any time before delivered)
```

### Features
- Progressive workflow (must confirm before shipping, ship before delivering)
- Automatic transaction completion when marked as delivered
- Timestamp and user tracking for each status change
- Only visible for COD and Scan payment methods
- Available in transactions page dropdown menu

## Order Cancellation

### Features
- Available for all transaction statuses except already-cancelled
- Automatic inventory restoration
- Tracks cancellation reason and who cancelled
- Bulk cancellation support for owner accounts
- Calculates refunds for already-refunded items before restoring inventory

### Process
1. Select transaction(s) in transactions page
2. Choose "Cancel Checkout" from dropdown
3. Confirm cancellation
4. System restores inventory for non-refunded items
5. Status updated to "cancelled"

## Refund System

### Features
- Item-by-item quantity selection
- Partial and full refund support
- Proportional cart discount calculation
- Automatic inventory restoration
- Refund history tracking with timestamps
- Prevents over-refunding (validates against available quantity)

### Refund Calculation
```
Items Subtotal: Sum of (unit price × refund quantity)
Cart Discount Adjustment: Proportional to refunded amount
Tax: NOT refunded (paid to government)
Total Refund: Items Subtotal - Cart Discount
```

### Process
1. Open transaction in transactions page
2. Select "Refund Quantity" from dropdown
3. Enter refund quantity for each item
4. Review refund calculation breakdown
5. Confirm refund
6. System processes refund and restores inventory

## Web Storefront Checkout

### Payment Method Selection
- QR Code Payment (MyanMyanPay gateway)
- Cash on Delivery (Direct transaction creation)

### Requirements
- User must be logged in
- Profile must be complete (name, phone, address)
- Cart must have items or direct product purchase

### COD Checkout Process
1. Select items and go to checkout
2. Choose "Cash on Delivery" payment method
3. System validates profile completeness
4. Creates transaction with status="pending" and deliveryStatus="pending"
5. Redirects to purchases page
6. Order appears in POS transactions for processing

### Scan/QR Checkout Process
1. Select items and go to checkout
2. Choose "QR Code Payment" method
3. System generates QR code via MyanMyanPay
4. Customer scans and pays
5. System polls for payment confirmation
6. Auto-redirects to purchases on success

## POS Transaction Management

### Transactions Page Features
- **Filters**:
  - Search by transaction ID or customer name
  - Status filter (all, completed, pending, cancelled, refunded, partially_refunded)
  - Payment method filter (all, cash, scan, cod)
  - Wholesale amount filter
  - Branch filter
  - Date range filter (today, 7d, 30d, 90d, all, custom)

- **Columns**:
  - Checkbox (for bulk operations - owner only)
  - Transaction ID
  - Customer name
  - Items count
  - Total (with refund breakdown)
  - Original total price
  - Discount amount
  - Wholesale amount
  - Profit calculation
  - Tax
  - Branch
  - Selling currency
  - Payment method
  - Transaction status
  - Delivery status (COD/Scan only)
  - Date/Time
  - Actions dropdown

- **Actions Dropdown**:
  - View Details (all transactions)
  - Approve (pending COD/Scan)
  - Refund Quantity (completed/partially refunded)
  - Cancel Checkout (not cancelled)
  - Confirm Order (pending delivery)
  - Mark as Shipped (confirmed delivery)
  - Mark as Delivered (shipped delivery)

- **Bulk Operations** (Owner only):
  - Approve multiple pending orders
  - Cancel multiple orders
  - Delete multiple transactions

### Statistics Cards
- Total Transactions count
- Completed count
- Pending/COD count
- Cancelled/Refunded count

## API Endpoints

### COD Order Creation
**Endpoint**: `/api/transactions/create-cod`
**Method**: POST
**Body**:
```json
{
  "customer": {
    "uid": "string",
    "email": "string",
    "displayName": "string",
    "phone": "string",
    "address": "string"
  },
  "items": [
    {
      "productId": "string",
      "productName": "string",
      "variantId": "string",
      "color": "string",
      "size": "string",
      "image": "string",
      "quantity": number,
      "unitPriceTHB": number,
      "discountedPriceTHB": number
    }
  ],
  "totalTHB": number,
  "discountTHB": number
}
```

**Response**:
```json
{
  "success": true,
  "transactionId": "TXN-0000000000001",
  "firestoreId": "string",
  "message": "COD order created successfully"
}
```

## Database Schema

### Transaction Document
```typescript
{
  transactionId: string;              // Sequential ID: TXN-0000000000001
  customer: {
    email: string;
    displayName: string;
    phone?: string;
    address?: string;
    customerType?: string;
  };
  items: Array<{
    id: string;
    productId: string;
    stockId: string;
    groupName: string;
    selectedColor: string;
    selectedSize: string;
    colorCode: string;
    image: string;
    unitPrice: number;
    originalPrice: number;
    discountedPrice?: number;
    quantity: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountPaid: number;
  change: number;
  paymentMethod: "cash" | "scan" | "cod";
  status: "completed" | "pending" | "cancelled" | "refunded" | "partially_refunded";
  timestamp: string;
  createdAt: Timestamp;
  branchName: string;
  sellingCurrency: "THB" | "MMK";
  exchangeRate: number;
  sellingTotal: number;
  
  // Refund tracking
  refunds?: Array<{
    refundId: string;
    items: Array<{
      itemId: string;
      itemIndex: number;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
    }>;
    totalAmount: number;
    itemsSubtotal: number;
    cartDiscountRefund: number;
    taxRefund: number;
    reason?: string;
    processedBy?: string;
    createdAt: Timestamp;
    status: "pending" | "completed" | "failed";
  }>;
  
  // Cancellation tracking
  cancelledAt?: Timestamp;
  cancelReason?: string;
  cancelledBy?: string;
  
  // Approval tracking
  approvedAt?: Timestamp;
  approvedBy?: string;
  rejectedAt?: Timestamp;
  rejectReason?: string;
  rejectedBy?: string;
  
  // Delivery tracking (COD/Scan orders)
  deliveryStatus?: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  deliveryStatusUpdatedAt?: Timestamp;
  deliveryStatusUpdatedBy?: string;
  orderSource?: "pos" | "web_storefront";
  customerUid?: string;
  
  // Discount breakdown
  discountBreakdown?: {
    wholesaleSavings: number;
    groupPercentSavings: number;
    groupFixedTotal: number;
    variantPercentSavings: number;
    variantFixedTotal: number;
    cartDiscount: number;
    cartDiscountPercent: number;
  };
}
```

## Role-Based Access Control

### Owner
- Full access to all features
- Can view all transactions
- Can perform bulk operations
- Can delete transactions
- Can approve, cancel, refund orders
- Can update delivery status
- Can switch role views

### Manager
- View transactions
- Approve pending orders
- Cancel orders
- Process refunds
- Update delivery status
- Cannot delete transactions
- Cannot perform bulk operations

### Staff
- Basic POS operations
- View limited transaction data
- Cannot approve/cancel/refund
- Cannot update delivery status
- Cannot access bulk operations

## Multi-Currency Support

### Currencies
- **THB** (Thai Baht) - Default/Base currency
- **MMK** (Myanmar Kyat) - Secondary currency

### Features
- Real-time currency conversion
- Exchange rate tracking per transaction
- Dual currency display in receipts
- Currency selector in POS
- Stored exchange rate for historical accuracy

### Calculation
```
Selling Total = Base Total × Exchange Rate
Example: 1000 THB × 50 MMK/THB = 50,000 MMK
```

## Receipt System

### Features
- Multiple paper sizes supported (44mm to 210mm)
- Business logo display
- Customer information
- Itemized list with colors and sizes
- Subtotal, discount, tax breakdown
- Payment method and currency
- Change calculation (cash only)
- Custom footer message and image
- Auto-print option

### Receipt Content
- Business name and logo
- Branch name
- Transaction ID
- Date and time
- Cashier role
- Customer name (if available)
- Item details (name, color, size, quantity, price)
- Subtotal, discount, tax, total
- Payment method
- Amount paid and change (cash)
- Selling currency details (if different)
- Footer message and image

## Testing Checklist

### POS System
- [ ] Cash payment with change calculation
- [ ] COD order creation and approval
- [ ] Scan order creation and approval
- [ ] Order cancellation with inventory restoration
- [ ] Full refund processing
- [ ] Partial refund processing
- [ ] Receipt printing for all payment methods
- [ ] Multi-currency transactions
- [ ] Bulk approve/cancel/delete operations

### Web Storefront
- [ ] COD checkout with profile validation
- [ ] QR/Scan payment with MyanMyanPay
- [ ] Cart checkout vs direct product checkout
- [ ] Order visibility in purchases page
- [ ] Profile completion flow

### Delivery Tracking
- [ ] Confirm pending orders
- [ ] Mark orders as shipped
- [ ] Mark orders as delivered (auto-complete)
- [ ] Delivery status display in transactions
- [ ] Progressive workflow enforcement

### Transaction Management
- [ ] View transaction details
- [ ] Filter by status, payment method, date
- [ ] Search by transaction ID or customer
- [ ] Export to CSV
- [ ] Pagination and sorting

### Edge Cases
- [ ] Refund with cart discount calculation
- [ ] Cancel already partially refunded order
- [ ] Concurrent refund attempts
- [ ] Insufficient inventory restoration
- [ ] Network failures during checkout
- [ ] Payment gateway timeouts

## Security Considerations

1. **Firebase Admin SDK**: Used for server-side operations
2. **Transaction Atomicity**: Counter increments use Firebase transactions
3. **Inventory Validation**: Checked before checkout and refund
4. **Role Verification**: All operations check user permissions
5. **Input Sanitization**: All user inputs validated and sanitized
6. **Refund Validation**: Prevents over-refunding with quantity checks

## Performance Optimizations

1. **Pagination**: Transaction list paginated (10, 25, 50, 100 per page)
2. **Indexing**: Firestore indexes on status, paymentMethod, createdAt
3. **Lazy Loading**: Images and large data loaded on demand
4. **Caching**: Settings cached in context providers
5. **Debouncing**: Search and filter inputs debounced
6. **Batch Operations**: Bulk operations processed efficiently

## Future Enhancements

1. **Email Notifications**: Send order confirmations and updates
2. **SMS Notifications**: Delivery status updates via SMS
3. **Customer Portal**: Allow customers to track orders
4. **Delivery Integration**: Integrate with shipping providers
5. **Payment Gateway**: Add more payment providers
6. **Analytics Dashboard**: Advanced reporting and insights
7. **Invoice Generation**: PDF invoice creation
8. **Barcode Scanning**: Scan product barcodes at checkout

## Support and Maintenance

### Common Issues

**Issue**: Transaction not appearing in list
**Solution**: Check date range filter, refresh page, verify Firebase connection

**Issue**: Refund calculation incorrect
**Solution**: Verify cart discount is properly proportioned, check tax settings

**Issue**: Delivery status not updating
**Solution**: Check user permissions, verify transaction is COD/Scan type

**Issue**: Receipt not printing
**Solution**: Enable popups in browser, check printer settings, verify receipt size

### Logs and Debugging

All operations log to console with prefixes:
- `TransactionService:` - Backend operations
- `PaymentClearanceModal:` - POS payment flow
- `COD transaction created:` - Web storefront COD orders

## Conclusion

This comprehensive payment system provides a robust, scalable solution for managing all aspects of transactions in both POS and web storefront environments. The system handles multiple payment methods, delivery tracking, refunds, and cancellations with full inventory management integration.

For additional assistance or feature requests, refer to the codebase documentation or contact the development team.
