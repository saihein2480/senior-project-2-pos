# QR Code Cancellation System

## Overview
This document describes the complete QR code upload system for order cancellation refunds. When customers request cancellations for Scan payment orders, they must upload their payment QR code or account details to receive the refund.

## System Architecture

### 1. Customer Cancellation Request Flow (Scan Payments)

```
Customer Frontend (pos-clothing-store-web)
    ↓
CancelRequestModal
    ↓ (QR code upload required for Scan payments)
POST /api/transactions/request-cancel
    ↓ (stores qrCodeImage in cancellationRequest)
Firestore: transactions/{transactionId}
    ↓
POS Notification (badge counter updates)
```

### 2. Owner Review & Approval Flow

```
POS: Cancellation Requests Page
    ↓
View Details Modal (displays QR code)
    ↓
Approve Cancellation
    ↓
transactionService.cancelPaidTransaction()
    ↓
Creates cancellationRefund with status: "pending"
    ↓
Owner sees in "Pending Refund Payments"
    ↓
Confirm Payment (with refund method selection)
    ↓
Status: "completed"
```

## Implementation Details

### A. Customer Frontend Changes

#### 1. CancelRequestModal Component
**File:** `pos-clothing-store-web/src/app/account/purchases/page.tsx`

**Features:**
- Detects Scan payment orders (`paymentMethod === "scan"`)
- Shows QR code upload section with clear instructions
- Image validation (file type, size max 5MB)
- Converts image to base64 for storage
- Requires QR code for Scan payments, optional for Cash payments
- Shows refund information and important notices

**Key State:**
```typescript
const [qrCodeImage, setQrCodeImage] = useState<string>("");
const [uploading, setUploading] = useState(false);
```

**Validation:**
```typescript
// Require QR code for Scan payments
if (isScanPayment && !qrCodeImage) {
  alert("Please upload your payment QR code or account screenshot");
  return;
}
```

#### 2. API Request Handler
**Function:** `handleSubmitCancellation(reason: string, qrCodeImage?: string)`

**Request Payload:**
```typescript
{
  transactionId: string,
  customerUid: string,
  reason: string,
  qrCodeImage?: string  // Base64 encoded image
}
```

### B. Backend API Changes

#### File: `pos-clothing-store-web/src/app/api/transactions/request-cancel/route.ts`

**Enhancements:**
1. Accept `qrCodeImage` parameter from request body
2. Validate QR code is provided for Scan payments
3. Store QR code in `cancellationRequest.qrCodeImage` field

**Validation Logic:**
```typescript
const paymentMethod = (transaction.paymentMethod || "").toLowerCase();
if (paymentMethod === "scan" && !qrCodeImage) {
  return NextResponse.json(
    { error: "QR code image is required for Scan payment cancellations" },
    { status: 400 }
  );
}
```

**Data Structure:**
```typescript
cancellationRequest: {
  status: "pending",
  reason: string,
  requestedAt: string (ISO),
  requestedBy: string (customerUid),
  customerEmail: string,
  customerName: string,
  qrCodeImage?: string  // Base64 image data
}
```

### C. POS Display Changes

#### File: `pos-clothing-store/clothing-store/src/app/owner/requests/cancellations/page.tsx`

**View Details Modal Enhancement:**
- Added QR code display section
- Shows only for `paymentMethod === "scan"`
- Displays customer's uploaded QR code image
- Provides context about refund purpose

**Display Component:**
```typescript
{selectedRequest.paymentMethod === "scan" && 
 (selectedRequest as any).cancellationRequest?.qrCodeImage && (
  <div>
    <h3 className="text-sm font-semibold text-gray-900 mb-3">
      Customer Refund Information
    </h3>
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
      <p className="text-sm text-blue-900 mb-3 font-medium">
        💳 Customer Payment QR Code / Account Details
      </p>
      <p className="text-xs text-blue-800 mb-3">
        Use this QR code or account details to process the refund back to the customer.
      </p>
      <div className="bg-white rounded-lg p-3 border border-blue-200">
        <img
          src={(selectedRequest as any).cancellationRequest.qrCodeImage}
          alt="Customer Payment QR Code"
          className="w-full max-w-md mx-auto rounded-lg"
        />
      </div>
    </div>
  </div>
)}
```

## Complete User Journey

### Customer Side

#### Step 1: Request Cancellation (Scan Payment)
1. Customer navigates to "My Purchases"
2. Finds order with `paymentMethod: "scan"`
3. Clicks "Request Cancellation"
4. **CancelRequestModal opens:**
   - Shows refund information
   - Shows QR code upload section with instructions
   - Customer uploads payment QR code screenshot
   - Image preview displayed
   - Customer enters optional reason
5. Clicks "Request Cancellation & Refund"
6. System validates:
   - QR code image is provided
   - Image format is valid
   - Image size is under 5MB
7. Request sent to API with base64 image data
8. Success: Shows confirmation message
9. Order shows "Cancellation Pending" badge

#### Step 2: Monitor Status
1. Customer can view order details
2. See cancellation request status:
   - ⏳ Pending: Waiting for owner approval
   - ✅ Approved: Cancellation approved, refund payment pending
   - ❌ Rejected: Request denied with reason
3. If approved, shows refund payment status:
   - 💰 Payment Pending: Store will process refund
   - ✅ Completed: Refund payment confirmed

### Owner Side (POS)

#### Step 1: Review Request
1. Badge notification on "Cancellation Requests" menu
2. Navigate to "Cancellation Requests" page
3. See list of pending requests with:
   - Transaction ID
   - Customer name
   - Request date
   - Total amount
   - Cancellation reason

#### Step 2: View Details
1. Click "View Details" button
2. Modal displays:
   - Transaction information
   - Payment method (Cash/Scan/COD)
   - **For Scan payments: Customer's QR code image**
   - Order items
   - Totals

#### Step 3: Approve Cancellation
1. Review QR code image for Scan payments
2. Click "Approve" button
3. System shows confirmation dialog:
   - For Scan/Cash: "Will create cancellation refund"
   - For COD: "Will cancel order, no refund needed"
4. Confirm approval
5. System:
   - Cancels order
   - Restores inventory
   - Creates `cancellationRefund` with status "pending" (for paid orders)
   - Updates cancellation request status to "approved"

#### Step 4: Process Refund Payment
1. Navigate to "Pending Refund Payments"
2. Find cancellation refund entry
3. See QR code image in refund details
4. Process payment using customer's QR code
5. Click "Confirm Payment"
6. Select refund method:
   - 💳 Original Payment (Scan)
   - 💵 Cash
   - 🏦 Bank Transfer
7. Add optional notes
8. Confirm
9. Status updated to "completed"
10. Customer notified

## Data Model

### Transaction Document Structure
```typescript
{
  id: string,
  transactionId: string,
  paymentMethod: "cash" | "scan" | "cod",
  total: number,
  status: string,
  items: [...],
  
  // Cancellation request
  cancellationRequest?: {
    status: "pending" | "approved" | "rejected",
    reason: string,
    requestedAt: string,
    requestedBy: string,
    customerEmail: string,
    customerName: string,
    qrCodeImage?: string,  // Base64 image for Scan payments
    approvedAt?: string,
    approvedBy?: string,
    rejectedAt?: string,
    rejectionReason?: string,
    rejectedBy?: string
  },
  
  // Cancellation refund (created on approval for paid orders)
  cancellationRefund?: {
    amount: number,
    status: "pending" | "completed",
    method?: "cash" | "original_payment" | "bank_transfer",
    confirmedAt?: Timestamp,
    confirmedBy?: string,
    notes?: string
  },
  
  cancelledAt?: Timestamp,
  cancelReason?: string,
  cancelledBy?: string
}
```

## UI/UX Guidelines

### Customer Modal Design
- **Blue color scheme** for Scan payment sections
- **Amber color scheme** for warning/important notices
- **Clear visual hierarchy:**
  1. QR code upload (most important for Scan)
  2. Refund information
  3. Reason input
  4. Action buttons

### POS Display Design
- **Consistent with refund QR code display**
- **Blue border** around QR code section
- **Helpful context text** explaining purpose
- **Large, clear image display**
- **Centered, responsive layout**

## Error Handling

### Customer Side
1. **Missing QR code (Scan payment):**
   - Alert: "Please upload your payment QR code or account screenshot"
   
2. **Invalid file type:**
   - Alert: "Please upload an image file"
   
3. **File too large:**
   - Alert: "Image size must be less than 5MB"
   
4. **Upload failure:**
   - Alert: "Failed to upload image"
   
5. **API error:**
   - Alert: Specific error message from API

### Backend API
1. **Missing QR code for Scan payment:**
   - Status 400: "QR code image is required for Scan payment cancellations"
   
2. **Transaction not found:**
   - Status 404: "Transaction not found"
   
3. **Unauthorized:**
   - Status 403: "Transaction does not belong to this customer"
   
4. **Already cancelled:**
   - Status 400: "Transaction is already cancelled or refunded"
   
5. **Pending request exists:**
   - Status 400: "A cancellation request is already pending"

### POS Side
1. **Approval failure:**
   - Toast error: "Failed to approve cancellation"
   - Keep request in list for retry
   
2. **Rejection failure:**
   - Toast error: "Failed to reject cancellation"
   - Keep request in list for retry

## Testing Checklist

### Customer Flow
- [ ] Upload QR code for Scan payment cancellation
- [ ] Validation: Require QR code for Scan payments
- [ ] Validation: File type check
- [ ] Validation: File size check
- [ ] Image preview displays correctly
- [ ] Can remove and re-upload image
- [ ] Success message after submission
- [ ] Badge shows "Cancellation Pending"
- [ ] Status updates in purchase details

### POS Flow
- [ ] Badge notification appears
- [ ] Request appears in list
- [ ] View Details shows transaction info
- [ ] QR code displays for Scan payments
- [ ] QR code does NOT display for Cash/COD
- [ ] Approve creates cancellation refund
- [ ] Refund appears in "Pending Refund Payments"
- [ ] QR code visible in refund payment details
- [ ] Can confirm payment with method selection
- [ ] Status updates to "completed"

### Edge Cases
- [ ] Cash payment cancellation (no QR code required)
- [ ] COD cancellation (no refund needed)
- [ ] Multiple cancellation attempts (should block)
- [ ] Very large images (should reject > 5MB)
- [ ] Network failure during upload
- [ ] Concurrent approval attempts

## Security Considerations

1. **Image Storage:**
   - Base64 encoding for simplicity
   - Stored directly in Firestore document
   - No external image hosting required
   - Document size limits apply (1MB max per document)

2. **Access Control:**
   - Customers can only cancel their own orders
   - Owner authentication required for approval
   - Customer UID verification in API

3. **Data Validation:**
   - File type validation (images only)
   - File size validation (5MB max)
   - Payment method verification
   - Transaction ownership verification

## Future Enhancements

1. **Image Optimization:**
   - Compress images before upload
   - Resize to standard dimensions
   - Convert to optimized format (WebP)

2. **External Storage:**
   - Use Cloudflare R2 or Cloudinary
   - Store URL instead of base64
   - Better for large images

3. **OCR Processing:**
   - Auto-extract account details from QR code
   - Validate QR code format
   - Pre-fill payment information

4. **Multi-image Support:**
   - Allow multiple payment proof images
   - Gallery view in POS

5. **Notification Enhancements:**
   - Email notification with QR code
   - Real-time updates
   - Mobile push notifications

## Related Documentation

- [CANCELLATION_REFUND_FLOW.md](./CANCELLATION_REFUND_FLOW.md) - Complete cancellation workflow
- [QR_CODE_REFUND_SYSTEM.md](./QR_CODE_REFUND_SYSTEM.md) - Partial refund QR system
- [COMPLETE_REFUND_NOTIFICATION_FLOW.md](./COMPLETE_REFUND_NOTIFICATION_FLOW.md) - Notification system

## Support

For issues or questions:
1. Check error messages in browser console
2. Verify Firebase configuration
3. Check Firestore document structure
4. Review API logs
5. Test image upload separately
