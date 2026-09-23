import { UserRole } from "@/types/auth";

/**
 * Role-Based Access Control (RBAC) Configuration
 * ==============================================
 *
 * SINGLE SOURCE OF TRUTH for every role-gated decision in the POS.
 *
 * This file is a direct, line-by-line translation of
 *   documents/ROLE_BASED_ACCESS_CONTROL.md  (Document Version 3.0)
 *
 * Two tables live here:
 *   1. routePermissions  - which roles may OPEN which page
 *   2. PERMISSION_MATRIX - which roles may PERFORM which action
 *
 * Rules for maintaining this file:
 *   - Every row of the documented matrix must map to exactly one flag here.
 *   - Never gate UI on a raw role string (`user.role === "owner"`). Add a flag
 *     and read it through `usePermissions()`, so the doc stays the only place
 *     roles are decided.
 *   - New page? Add it to `routePermissions`. Access now FAILS CLOSED, so an
 *     unlisted /owner route is denied to everyone rather than open to everyone.
 */

/** The three POS roles. "customer" is a storefront role with no POS access. */
export const POS_ROLES: UserRole[] = ["owner", "manager", "staff"];

const OWNER_ONLY: UserRole[] = ["owner"];
const MANAGEMENT: UserRole[] = ["owner", "manager"];
const ALL_STAFF: UserRole[] = ["owner", "manager", "staff"];

/* ================================================================== *
 * 1. ROUTE PERMISSIONS - who can open which page
 * ================================================================== */

export interface RoutePermission {
  path: string;
  allowedRoles: UserRole[];
  description: string;
}

/**
 * Every POS page. Matched by longest path prefix, so a dynamic child route
 * such as /owner/inventory/stocks/edit/abc123 inherits its parent entry.
 */
export const routePermissions: RoutePermission[] = [
  // ---- Home ----------------------------------------------------------
  { path: "/owner/home", allowedRoles: ALL_STAFF, description: "POS System Home" },

  // ---- Dashboard & Analytics ----------------------------------------
  { path: "/owner/dashboard", allowedRoles: MANAGEMENT, description: "Business Dashboard with Analytics" },

  // ---- Walk-in Sales -------------------------------------------------
  { path: "/owner/sales/transactions", allowedRoles: ALL_STAFF, description: "View and manage transactions" },
  { path: "/owner/sales/reports", allowedRoles: MANAGEMENT, description: "Sales reports and analytics" },
  { path: "/owner/sales/payments", allowedRoles: ALL_STAFF, description: "Process and view payments" },

  // ---- Online Sales --------------------------------------------------
  { path: "/owner/sales/online-orders", allowedRoles: MANAGEMENT, description: "Manage online orders" },
  { path: "/owner/sales/online-transactions", allowedRoles: MANAGEMENT, description: "View online transactions" },
  { path: "/owner/requests/cancellations", allowedRoles: MANAGEMENT, description: "Order cancellation requests" },
  { path: "/owner/requests/refunds", allowedRoles: MANAGEMENT, description: "Return requests" },
  { path: "/owner/requests/pending-refunds", allowedRoles: MANAGEMENT, description: "Refund payment processing" },
  { path: "/owner/requests/refund-report", allowedRoles: MANAGEMENT, description: "Online refund report" },

  // ---- Inventory -----------------------------------------------------
  // More specific paths first is not required (longest prefix wins), but it
  // keeps this table readable.
  { path: "/owner/inventory/stocks/new-stock", allowedRoles: MANAGEMENT, description: "Add new product" },
  { path: "/owner/inventory/stocks/edit", allowedRoles: MANAGEMENT, description: "Edit product" },
  { path: "/owner/inventory/stocks", allowedRoles: MANAGEMENT, description: "Manage product inventory" },
  { path: "/owner/inventory/customers", allowedRoles: ALL_STAFF, description: "Manage customer information" },

  // ---- Promotion & Membership ---------------------------------------
  { path: "/owner/membership", allowedRoles: MANAGEMENT, description: "Membership & loyalty management" },
  { path: "/owner/online-promotions", allowedRoles: MANAGEMENT, description: "Online promotions & coupons" },

  // ---- Expenses ------------------------------------------------------
  { path: "/owner/expenses", allowedRoles: MANAGEMENT, description: "Track and manage expenses" },

  // ---- Barcode -------------------------------------------------------
  { path: "/owner/barcode/label-print", allowedRoles: MANAGEMENT, description: "Print product labels" },
  { path: "/owner/barcode/print-settings", allowedRoles: MANAGEMENT, description: "Configure barcode printing" },

  // ---- Shops / Branches ----------------------------------------------
  { path: "/owner/shops/manage", allowedRoles: OWNER_ONLY, description: "Manage shop branches" },
  { path: "/owner/shops/reports", allowedRoles: OWNER_ONLY, description: "Shop performance reports" },

  // ---- Staff Management ----------------------------------------------
  { path: "/owner/staff", allowedRoles: OWNER_ONLY, description: "Manage staff accounts" },

  // ---- Shared --------------------------------------------------------
  { path: "/owner/notifications", allowedRoles: ALL_STAFF, description: "Notifications" },
  { path: "/owner/settings", allowedRoles: ALL_STAFF, description: "System settings (role-dependent view)" },
];

/* ================================================================== *
 * 2. FEATURE PERMISSIONS - who can perform which action
 * ================================================================== */

export interface FeaturePermissions {
  // --- Dashboard & Analytics ---
  canViewDashboard: boolean;
  canViewReports: boolean;
  canViewFullFinancials: boolean;
  canViewProfitLoss: boolean;
  canExportReports: boolean;

  // --- Sales & Transactions ---
  canProcessSales: boolean;
  canViewAllTransactions: boolean;
  canRefundTransactions: boolean;
  canCancelTransactions: boolean;
  canDeleteTransactions: boolean;
  canBulkDeleteTransactions: boolean;
  canViewFullPaymentDetails: boolean;
  canUpdateDeliveryStatus: boolean;
  canExportTransactions: boolean;

  // --- Inventory ---
  canViewStockList: boolean;
  canAddProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canManageStock: boolean;
  canViewStockValue: boolean;
  canManagePricing: boolean;
  canManageWholesalePricing: boolean;
  canExportStockData: boolean;

  // --- Customers ---
  canViewCustomers: boolean;
  canAddCustomers: boolean;
  canEditCustomers: boolean;
  canDeleteCustomers: boolean;
  canViewCustomerHistory: boolean;
  canViewLoyaltyPoints: boolean;
  canAdjustLoyaltyPoints: boolean;
  canIssueCoupons: boolean;
  canViewFullCustomerAnalytics: boolean;

  // --- Online Orders (E-commerce) ---
  canViewOnlineOrders: boolean;
  canManageOnlineOrders: boolean;
  canUpdateOrderStatus: boolean;
  canHandleCancellations: boolean;
  canProcessOnlineRefunds: boolean;
  canViewOnlineTransactions: boolean;
  canManageReturnRequests: boolean;
  canApprovePayments: boolean;
  canViewRefundReports: boolean;

  // --- Payments & Financial ---
  canViewOwnPayments: boolean;
  canViewAllPayments: boolean;
  canReconcilePayments: boolean;
  canExportPaymentData: boolean;
  canViewFinancialReports: boolean;

  // --- Expenses ---
  canViewExpenses: boolean;
  canAddExpenses: boolean;
  canEditExpenses: boolean;
  canDeleteExpenses: boolean;
  canBulkDeleteExpenses: boolean;
  canManageExpenseCategories: boolean;
  canUploadReceipts: boolean;
  canViewTotalExpenses: boolean;
  canExportExpenseData: boolean;

  // --- Branch / Shop ---
  canViewShops: boolean;
  canManageShops: boolean;
  canViewShopReports: boolean;
  canCompareShops: boolean;

  // --- Staff ---
  canViewStaffMenu: boolean;
  canViewStaffList: boolean;
  canAddStaff: boolean;
  canEditStaff: boolean;
  canDeleteStaff: boolean;
  canChangeStaffRoles: boolean;
  canViewStaffCredentials: boolean;
  canResetPasswords: boolean;

  // --- Settings ---
  canAccessSettings: boolean;
  canEditBusinessSettings: boolean;
  canSelectBranch: boolean;
  canEditTaxRate: boolean;
  canEditCurrencySettings: boolean;
  canEditPrintSettings: boolean;
  canManageLoyaltyProgram: boolean;
  canEditStoreInformation: boolean;
  canEditInvoiceSettings: boolean;
  canConfigureOwnerLayout: boolean;

  // --- Promotions & Membership ---
  canViewPromotionsMenu: boolean;
  canManageMembership: boolean;
  canViewCustomerPoints: boolean;
  canRedeemCouponsAdmin: boolean;
  canViewPointsHistory: boolean;
  canManageOnlinePromotions: boolean;
  canCreatePromotions: boolean;
  canEditPromotions: boolean;
  canDeletePromotions: boolean;
}

/**
 * The documented permission matrix, as data.
 *
 * Each entry lists the roles that are granted the action. Any role not listed
 * is denied. The trailing comment cites the row of the documentation it
 * implements, so a reviewer can diff the two side by side.
 */
export const PERMISSION_MATRIX: Record<keyof FeaturePermissions, UserRole[]> = {
  // --- Dashboard & Analytics ---
  canViewDashboard: MANAGEMENT, //              View Business Dashboard
  canViewReports: MANAGEMENT, //                View Sales Reports
  canViewFullFinancials: MANAGEMENT, //         View Financial Analytics
  canViewProfitLoss: MANAGEMENT, //             View Profit/Loss Data
  canExportReports: MANAGEMENT, //              Export Reports

  // --- Sales & Transactions ---
  canProcessSales: ALL_STAFF, //                Process Sales (POS)
  canViewAllTransactions: ALL_STAFF, //         View Transactions
  canRefundTransactions: MANAGEMENT, //         Refund Transactions
  canCancelTransactions: MANAGEMENT, //         Cancel Transactions
  canDeleteTransactions: OWNER_ONLY, //         Delete Transactions
  canBulkDeleteTransactions: OWNER_ONLY, //     Bulk Delete
  canViewFullPaymentDetails: MANAGEMENT, //     View Payment Details (staff = limited)
  canUpdateDeliveryStatus: MANAGEMENT, //       Update Delivery Status (staff = view only)
  canExportTransactions: MANAGEMENT, //         Export Transactions

  // --- Inventory ---
  canViewStockList: MANAGEMENT, //              View Stock List
  canAddProducts: MANAGEMENT, //                Add New Products
  canEditProducts: MANAGEMENT, //               Edit Product Details
  canDeleteProducts: OWNER_ONLY, //             Delete Products
  canManageStock: MANAGEMENT, //                Manage Stock Levels
  canViewStockValue: MANAGEMENT, //             View Stock Value
  canManagePricing: MANAGEMENT, //              Price Management
  canManageWholesalePricing: MANAGEMENT, //     Wholesale Pricing
  canExportStockData: MANAGEMENT, //            Export (inventory)

  // --- Customers ---
  canViewCustomers: ALL_STAFF, //               View Customer List
  canAddCustomers: ALL_STAFF, //                Add New Customers
  canEditCustomers: ALL_STAFF, //               Edit Customer Info
  canDeleteCustomers: OWNER_ONLY, //            Delete Customers
  canViewCustomerHistory: ALL_STAFF, //         View Purchase History (staff = basic)
  canViewLoyaltyPoints: ALL_STAFF, //           View Loyalty Points
  canAdjustLoyaltyPoints: MANAGEMENT, //        Adjust Loyalty Points
  canIssueCoupons: MANAGEMENT, //               Issue Coupons
  canViewFullCustomerAnalytics: MANAGEMENT, //  Customer Analytics (staff = limited)

  // --- Online Orders (E-commerce) ---
  canViewOnlineOrders: MANAGEMENT, //           View Online Orders
  canManageOnlineOrders: MANAGEMENT, //         Process Orders
  canUpdateOrderStatus: MANAGEMENT, //          Update Order Status
  canHandleCancellations: MANAGEMENT, //        Handle Cancellations
  canProcessOnlineRefunds: MANAGEMENT, //       Process Refunds
  canViewOnlineTransactions: MANAGEMENT, //     View Online Transactions
  canManageReturnRequests: MANAGEMENT, //       Manage Return Requests
  canApprovePayments: MANAGEMENT, //            Issue Refund Payments
  canViewRefundReports: MANAGEMENT, //          View Refund Reports

  // --- Payments & Financial ---
  canViewOwnPayments: ALL_STAFF, //             View Payments (staff = own only)
  canViewAllPayments: MANAGEMENT, //            View Payments (all)
  canReconcilePayments: MANAGEMENT, //          Payment Reconciliation
  canExportPaymentData: MANAGEMENT, //          Export Payment Data
  canViewFinancialReports: MANAGEMENT, //       Financial Reports

  // --- Expenses ---
  canViewExpenses: MANAGEMENT, //               View Expenses
  canAddExpenses: MANAGEMENT, //                Add New Expense
  canEditExpenses: MANAGEMENT, //               Edit Expense
  canDeleteExpenses: OWNER_ONLY, //             Delete Expense
  canBulkDeleteExpenses: OWNER_ONLY, //         Bulk Delete
  canManageExpenseCategories: MANAGEMENT, //    Manage Categories
  canUploadReceipts: MANAGEMENT, //             Upload Receipts
  canViewTotalExpenses: MANAGEMENT, //          View Total Expenses
  canExportExpenseData: MANAGEMENT, //          Export Data

  // --- Branch / Shop ---
  canViewShops: OWNER_ONLY, //                  View Shops List
  canManageShops: OWNER_ONLY, //                Add/Edit/Delete Shop
  canViewShopReports: OWNER_ONLY, //            View Shop Reports
  canCompareShops: OWNER_ONLY, //               Compare Shops

  // --- Staff ---
  canViewStaffMenu: OWNER_ONLY, //              View Staff Menu
  canViewStaffList: OWNER_ONLY, //              View Staff List
  canAddStaff: OWNER_ONLY, //                   Add New Staff / Add New Manager
  canEditStaff: OWNER_ONLY, //                  Edit Staff Details
  canDeleteStaff: OWNER_ONLY, //                Delete/Remove Staff
  canChangeStaffRoles: OWNER_ONLY, //           Change Staff Role
  canViewStaffCredentials: OWNER_ONLY, //       View Staff Credentials
  canResetPasswords: OWNER_ONLY, //             Reset Passwords

  // --- Settings ---
  canAccessSettings: ALL_STAFF, //              Access Settings Page
  canEditBusinessSettings: MANAGEMENT, //       Business Information
  canSelectBranch: ALL_STAFF, //                Branch Selection
  canEditTaxRate: MANAGEMENT, //                Tax Rate (staff = view only)
  canEditCurrencySettings: MANAGEMENT, //       Currency Settings (staff = view only)
  canEditPrintSettings: MANAGEMENT, //          Receipt Settings
  canManageLoyaltyProgram: MANAGEMENT, //       Loyalty Program
  canEditStoreInformation: MANAGEMENT, //       Store Information
  canEditInvoiceSettings: MANAGEMENT, //        Invoice Customization
  canConfigureOwnerLayout: OWNER_ONLY, //       My Workspace (owner's own layout)

  // --- Promotions & Membership ---
  canViewPromotionsMenu: MANAGEMENT, //         View Promotions Menu
  canManageMembership: MANAGEMENT, //           Membership Management
  canViewCustomerPoints: MANAGEMENT, //         View Customer Points
  canRedeemCouponsAdmin: MANAGEMENT, //         Redeem Coupons (Admin)
  canViewPointsHistory: MANAGEMENT, //          View Points History
  canManageOnlinePromotions: MANAGEMENT, //     Online Promotions
  canCreatePromotions: MANAGEMENT, //           Create Promotions
  canEditPromotions: MANAGEMENT, //             Edit Promotions
  canDeletePromotions: MANAGEMENT, //           Delete Promotions
};

/** Every permission key, useful for tests and audits. */
export const PERMISSION_KEYS = Object.keys(PERMISSION_MATRIX) as (keyof FeaturePermissions)[];

/**
 * Resolve the full permission set for a role.
 *
 * Any role outside POS_ROLES (e.g. "customer", or an unrecognised value from a
 * tampered user document) receives every permission as `false`.
 */
export function getRolePermissions(role: UserRole): FeaturePermissions {
  const permissions = {} as FeaturePermissions;
  for (const key of PERMISSION_KEYS) {
    permissions[key] = PERMISSION_MATRIX[key].includes(role);
  }
  return permissions;
}

/** Check a single permission without instantiating the whole set. */
export function hasPermission(
  role: UserRole | null | undefined,
  permission: keyof FeaturePermissions,
): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[permission].includes(role);
}

/**
 * Decide which role the UI should behave as.
 *
 * The owner can preview the POS as a Manager or Staff member ("View as role" in
 * the top bar). While previewing, the app applies that role's permissions so the
 * preview reflects reality rather than just hiding menu entries.
 *
 * The rules, in order:
 *   1. No signed-in role -> no permissions.
 *   2. Not an owner -> pinned to their own role. A manager or staff member can
 *      never raise their access by changing the preview.
 *   3. Owner with a valid POS role to preview -> that role.
 *   4. Owner with a missing or nonsensical preview -> full owner access.
 *
 * Because owner is the highest role, a preview can only ever narrow what is
 * permitted. `previewNeverEscalates` in scripts/rbac-audit.mjs asserts this.
 */
export function resolveEffectiveRole(
  actualRole: UserRole | null | undefined,
  viewAsRole: UserRole | null | undefined,
): UserRole | null {
  if (!actualRole) return null;
  if (actualRole !== "owner") return actualRole;
  if (!viewAsRole || !POS_ROLES.includes(viewAsRole)) return actualRole;
  return viewAsRole;
}

/* ================================================================== *
 * 3. ROUTE HELPERS
 * ================================================================== */

/**
 * Find the route rule governing a path, using the LONGEST matching prefix so
 * that `/owner/inventory/stocks/new-stock` wins over `/owner/inventory/stocks`.
 */
export function findRoutePermission(pathname: string): RoutePermission | undefined {
  let match: RoutePermission | undefined;
  for (const rule of routePermissions) {
    if (pathname === rule.path || pathname.startsWith(`${rule.path}/`)) {
      if (!match || rule.path.length > match.path.length) match = rule;
    }
  }
  return match;
}

/**
 * Can this role open this path?
 *
 * FAILS CLOSED. An unlisted route under /owner is denied rather than allowed,
 * so forgetting to register a new page is a visible bug instead of a silent
 * hole. Paths outside /owner (storefront, auth, API) are not governed here.
 */
export function hasRoutePermission(role: UserRole, pathname: string): boolean {
  const rule = findRoutePermission(pathname);

  if (!rule) {
    if (pathname.startsWith("/owner")) {
      console.warn(
        `[RBAC] "${pathname}" is not registered in routePermissions - denying access. ` +
          `Add it to src/config/rolePermissions.ts.`,
      );
      return false;
    }
    return true;
  }

  return rule.allowedRoles.includes(role);
}

/** Every route a role may open. */
export function getAccessibleRoutes(role: UserRole): RoutePermission[] {
  return routePermissions.filter((p) => p.allowedRoles.includes(role));
}
