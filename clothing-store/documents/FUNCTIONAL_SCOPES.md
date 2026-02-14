Functional Scopes

Owner
- Manage products: create, read, update, delete product records and images.
- Manage inventory: add stock, adjust quantities, set reorder thresholds, and view low-stock alerts.
- Manage shops/branches: create and configure branches, set branch-specific prices/stock.
- Manage staff: create, edit, disable/enable staff accounts and assign roles.
- Manage customers: view and edit customer profiles and purchase history.
- Sales & transactions: view all transactions, issue refunds, reconcile sales, and export reports.
- Carts & orders: view customer carts, migrate carts, and manage orders.
- Expenses: create and track expenses and link them to branches or transactions.
- Barcode & printing: configure barcode formats, print labels, and manage barcode settings.
- System settings: change tax, currency, payment methods, integrations (R2, Firebase), and global settings.

Manager
- Manage products and inventory: create and edit products, adjust stock, and view inventory reports.
- Customer management: view and edit customer data and order history.
- Sales & transactions: view transactions, generate reports, and assist with refunds (subject to policies).
- Expenses: view and create expense records and run expense reports.
- Branch management: manage branch-specific inventory and reports.
- Barcode & system config: access barcode settings and many system configurations.
- Restrictions: cannot create/modify/delete staff accounts or change owner-level settings.

Staff (Cashier)
- POS operations: process sales, accept payments, and print/issue receipts.
- Refunds: process refunds according to allowed workflows and permissions.
- Customer lookup: search and update customer details during checkout.
- Basic inventory actions: view product availability and perform simple stock adjustments (depending on policy).
- Access limited settings: adjust only cashier-relevant preferences (e.g., receipt settings, current branch selection).
- Restrictions: no access to staff management, global system settings, or owner-only reports.

Customer
- Browse products: view product listings, descriptions, images, and availability by branch.
- Cart & checkout: add/remove items in cart, checkout, and view order history.
- Shop info: view shop locations, opening hours, and terms & conditions.
- Account: manage personal profile and view past orders.

Notes
- Roles in code: `owner`, `manager`, `staff`, `customer` (see `src/types/auth.ts`).
- Access control is enforced across the app (ProtectedRoute, Sidebar role filters, server APIs).
