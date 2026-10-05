# How IDs Are Generated

**App:** POS = `pos-clothing-store/clothing-store/src/`, Web = `pos-clothing-store-web/src/` (customer storefront). File paths below are relative to those folders.

**Auto-ID** = Firestore's random 20-character document ID (`addDoc`, `.add()`, `.doc()`).

## Sales and receipts

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| In-store receipt number | `TXN-0000000000042` | POS | `TXN-` + 13-digit counter from `counters/transactionCounter`, increased in the same transaction that saves the sale and takes stock. Sequential, never duplicated. | `services/transactionService.ts:376` (`formatReceiptNumber`), used at `:477` |
| In-store sale document ID | `8fK2pQx1LmZ7aB3cD9eF` | POS | Firestore auto-ID | `services/transactionService.ts:426` |
| COD receipt number | `TXN-0000000000043` | Web | Same shared counter, in the same transaction that takes stock and writes the order | `lib/onlineStockService.ts:718` (`formatTransactionNumber`), `:746` (`createCodOrderWithStock`) |
| COD sale document ID | `Zq81LmA0bC7dE2fG4hJk` | Web | Firestore auto-ID | `lib/onlineStockService.ts:750` |
| QR (online payment) sale | `TXN-ONL-1790263939253-QY5O0V` | Web | `TXN-` + the online order ID. Used as both document ID and `transactionId`. One sale per order. | `lib/mmpayPaidOrder.ts:47` (`transactionDocIdFor`) |
| Sandbox payment reference | `TEST-ONL-1790263939253-QY5O0V` | Web | `TEST-` + order ID. Stored only in `paymentMeta.transactionRefId`. | `app/api/mmpay/test-complete/route.ts:116` |
| Refund | `REF-1718203345123-3f9a1c0b2` | POS | `REF-` + time (ms) + 9 characters of a secure random UUID | `server/orders/transactionActions.ts:55` (`newRefundId`) |
| Unused checkout ID (never saved) | `TXN-1718203345123-487` | POS | `TXN-` + time + random 0–999. Only logged to the console. | `components/ui/ShoppingCartModal.tsx:2258` |

## Online orders

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| Online QR order | `ONL-1790263939253-QY5O0V` | Web | `ONL-` + time (ms) + 6 random characters (`Math.random`) | `app/api/mmpay/create-order/route.ts:299` |
| COD order | `COD-1790263939253-AB12CD` | Web | `COD-` + time (ms) + 6 random characters (`Math.random`) | `app/api/transactions/create-cod/route.ts:86` |
| COD sale line item | `<productId>_<variantId>_M` | Web | product + variant + size | `app/api/transactions/create-cod/route.ts:104` |

## Products and barcodes

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| Stock / product | `8fK2pQx1LmZ7aB3cD9eF` | POS | Firestore auto-ID (one document per shop) | `services/stockService.ts:89`, `server/stocksAdmin.ts:190` |
| Colour variant / wholesale tier | `1718203345123k3j9x2abq` | POS | time (ms) + up to 9 random characters | `lib/stockIds.ts:9` (`generateId`) |
| Barcode (shared generator) | `8851001451236` | POS | EAN-13: `885` (country) + `1001` (shop) + last 5 digits of time + check digit | `lib/stockIds.ts:13` (`generateEAN13`) |
| Barcode ("Generate" button) | `8851001451236` | POS | Copy of the same EAN-13 logic | `app/owner/inventory/stocks/new-stock/page.tsx:529`, `app/owner/inventory/stocks/edit/[id]/page.tsx:623` |
| Barcode (auto-filled on save) | `8851001123017` | POS | EAN-13 with product code from 3 time digits + variant index | `new-stock/page.tsx:724`, `edit/[id]/page.tsx:819` |
| Barcode (InventoryService) | `004827361950` | POS | 12 random digits, no check digit | `services/InventoryService.ts:237` (also sets barcode = variant ID at `:84`) |
| Till stand-in variant ID | `cv1-8fK2pQx1LmZ7aB3cD9eF` | POS | `cv` + position + stock ID, only for variants saved without an ID | `app/owner/home/page.tsx:280`, `:430` |

## Customers and loyalty

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| Storefront customer | `aB3dE5fG7hJ9kL1mN3pQ5rS7tU9` | Web | Firebase Auth uid (sign-up / Google sign-in), also used as `customers/{uid}` | `contexts/CustomerAuthContext.tsx` (`upsertCustomerDocuments`) |
| POS-created customer | `8fK2pQx1LmZ7aB3cD9eF` | POS | Firestore auto-ID | `services/customerService.ts:303`, `server/customersAdmin.ts` |
| Member ID | `AB3DE5FG7HJ9` | Web | First 12 characters of the customer ID, upper-cased | `app/api/loyalty/join/route.ts:66` |
| Member ID | `8FK2PQX1LMZ7` | POS | Same rule (fallback when no `memberId` is stored) | `services/customerService.ts:193` |
| Points history entry | `points_1718203345123_k3j9x2a` | Web | `points_` + time (ms) + 7 random characters | `lib/loyaltyService.ts:320`, `:489` |
| Points history entry | `points_1718203345123_k3j9x2a` | POS | Same format | `services/loyaltyService.ts:275` |
| Coupon ID | `coupon_1718203345123_q8w2e1r` | Web | `coupon_` + time (ms) + 7 random characters | `lib/loyaltyService.ts:402` |
| Coupon ID | `coupon_1718203345123_q8w2e1r` | POS | Same format | `services/loyaltyService.ts:188` |
| Coupon code | `LOYALK3F9QZ` | Web | `LOYAL` + up to 6 random characters (`Math.random`), no uniqueness check | `lib/loyaltyService.ts:384` (`generateCouponCode`) |
| Coupon code | `LOYALK3F9QZ` | POS | Same format | `services/loyaltyService.ts:169` (`generateCouponCode`) |
| Reward package | `pkg_1718203345123_ab12c` | POS | `pkg_` + time (ms) + 5 random characters (server fallback: `pkg_` + time + index) | `app/owner/settings/page.tsx:410`, `app/api/settings/route.ts:127` |

## Staff, shops and other records

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| Staff account | `Xy7Kq2Lm9Np4Rs6Tu8Vw0Za1Bc3` | POS | Firebase Auth uid (`auth.createUser`), saved as `users/{uid}` | `server/staffAdmin.ts:82` |
| Shop / branch | `Hs3Jk5Lm7Np9Qr1St3Uv` | POS | Firestore auto-ID | `services/shopService.ts:72`, `server/shopsAdmin.ts:96` |
| Expense category, spending menu, expense | `Ex4Fg6Hj8Kl0Mn2Pq4Rs` | POS | Firestore auto-ID | `services/expenseService.ts:34`, `:93`, `:191`; `server/expensesAdmin.ts:47` |
| Online promotion | `Pr5Mo7Ti9On1Ab3Cd5Ef` | POS | Firestore auto-ID | `services/onlinePromotionService.ts:113` |
| Notification | `No6Ti8Fy0Ab2Cd4Ef6Gh` | POS | Firestore auto-ID | `services/notificationService.ts:37`, `server/orders/context.ts:293` |
| Notification | `No6Ti8Fy0Ab2Cd4Ef6Gh` | Web | Firestore auto-ID | `app/api/transactions/create-cod/route.ts:236`, `lib/notifications/orderPaid.ts:107`, `lib/notifications/dispatch.ts:183` |
| Activity log entry | `Au7Di9Tl1Og3Ab5Cd7Ef` | POS | Firestore auto-ID | `server/auditLog.ts` (around 121–160) |
| Activity log, sale entry | `sale_8fK2pQx1LmZ7aB3cD9eF` | POS | `sale_` + sale document ID (written once per sale) | `app/api/activity/route.ts:188` |
| Cart line (till) | `<stockId>-<variantId>-M-1718203345123` | POS | stock + colour + size + time (ms) | `contexts/CartContext.tsx:519` |
| Saved cart line (storefront) | `<productId>:<variantId>:M` | Web | product + variant + size | `lib/telegram/cart-service.ts:48`, `app/product/[id]/page.tsx:955` |
| Business settings | `business_settings/main` | Both | Fixed document name | `services/settingsService.ts:12` |
| Product categories | `settings/categories` | POS | Fixed document name | `services/categoryService.ts:13` |

## Tokens and codes

| ID | Example | App | How it's made | File |
|---|---|---|---|---|
| Telegram link token (from bot) | `9f86d081884c7d65…` (64 hex chars) | Web | `crypto.randomBytes(32)`, expires in 15 minutes | `lib/telegram/auth-service.ts:17` |
| Telegram link token (from website) | `q3Z8xL0vT2mN7bR4…` (32 chars) | Web | `crypto.randomBytes(24)` as base64url, expires in 15 minutes | `lib/telegram/auth-service.ts:98` |
| Email verification code | `482917` | Web | 6 digits from `crypto.randomInt`, only a hash is stored, 15-minute expiry | `lib/email/verification-service.ts:46` |
