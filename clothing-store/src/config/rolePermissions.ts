import { UserRole } from "@/types/auth";

/**
 * Role-Based Access Control (RBAC) Configuration
 * 
 * This file defines what each role can access and do in the system
 */

export interface RoutePermission {
  path: string;
  allowedRoles: UserRole[];
  description: string;
}

/**
 * Route permissions - defines which roles can access which routes
 */
export const routePermissions: RoutePermission[] = [
  // Home - All roles
  {
    path: "/owner/home",
    allowedRoles: ["owner", "manager", "staff"],
    description: "POS System Home",
  },

  // Dashboard - Owner & Manager only
  {
    path: "/owner/dashboard",
    allowedRoles: ["owner", "manager"],
    description: "Business Dashboard with Analytics",
  },

  // Sales - Transactions (All roles)
  {
    path: "/owner/sales/transactions",
    allowedRoles: ["owner", "manager", "staff"],
    description: "View and manage transactions",
  },

  // Sales - Reports (Owner & Manager only)
  {
    path: "/owner/sales/reports",
    allowedRoles: ["owner", "manager"],
    description: "View sales reports and analytics",
  },

  // Sales - Payments (All roles)
  {
    path: "/owner/sales/payments",
    allowedRoles: ["owner", "manager", "staff"],
    description: "Process and view payments",
  },

  // Sales - Online Orders (Owner & Manager only)
  {
    path: "/owner/sales/online-orders",
    allowedRoles: ["owner", "manager"],
    description: "Manage online orders from web store",
  },

  // Sales - Online Transactions (Owner & Manager only)
  {
    path: "/owner/sales/online-transactions",
    allowedRoles: ["owner", "manager"],
    description: "View online transactions",
  },

  // Inventory - Stocks (Owner & Manager only)
  {
    path: "/owner/inventory/stocks",
    allowedRoles: ["owner", "manager"],
    description: "Manage product inventory",
  },

  // Inventory - Customers (All roles)
  {
    path: "/owner/inventory/customers",
    allowedRoles: ["owner", "manager", "staff"],
    description: "Manage customer information",
  },

  // Expenses (Owner & Manager only)
  {
    path: "/owner/expenses",
    allowedRoles: ["owner", "manager"],
    description: "Track and manage expenses",
  },

  // Barcode - Label Print (Owner & Manager only)
  {
    path: "/owner/barcode/label-print",
    allowedRoles: ["owner", "manager"],
    description: "Print product labels",
  },

  // Barcode - Print Settings (Owner & Manager only)
  {
    path: "/owner/barcode/print-settings",
    allowedRoles: ["owner", "manager"],
    description: "Configure barcode print settings",
  },

  // Shops - Manage (Owner only)
  {
    path: "/owner/shops/manage",
    allowedRoles: ["owner"],
    description: "Manage shop branches",
  },

  // Shops - Reports (Owner only)
  {
    path: "/owner/shops/reports",
    allowedRoles: ["owner"],
    description: "View shop performance reports",
  },

  // Staff Management (Owner only)
  {
    path: "/owner/staff",
    allowedRoles: ["owner"],
    description: "Manage staff accounts and permissions",
  },

  // Settings (All roles, but different views)
  {
    path: "/owner/settings",
    allowedRoles: ["owner", "manager", "staff"],
    description: "System settings",
  },
];

/**
 * Feature permissions - defines what actions each role can perform
 */
export interface FeaturePermissions {
  // General permissions
  canViewDashboard: boolean;
  canViewReports: boolean;
  canViewFullFinancials: boolean;

  // Sales permissions
  canProcessSales: boolean;
  canRefundTransactions: boolean;
  canCancelTransactions: boolean;
  canViewAllTransactions: boolean;
  canManageOnlineOrders: boolean;
  canApprovePayments: boolean;

  // Inventory permissions
  canAddProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canManageStock: boolean;
  canViewStockValue: boolean;

  // Customer permissions
  canAddCustomers: boolean;
  canEditCustomers: boolean;
  canDeleteCustomers: boolean;
  canViewCustomerHistory: boolean;

  // Staff permissions
  canAddStaff: boolean;
  canEditStaff: boolean;
  canDeleteStaff: boolean;
  canChangeStaffRoles: boolean;

  // Shop/Branch permissions
  canManageShops: boolean;
  canViewShopReports: boolean;

  // Expense permissions
  canAddExpenses: boolean;
  canEditExpenses: boolean;
  canDeleteExpenses: boolean;

  // Settings permissions
  canEditBusinessSettings: boolean;
  canEditPrintSettings: boolean;
  canManageIntegrations: boolean;
}

/**
 * Get feature permissions for a specific role
 */
export function getRolePermissions(role: UserRole): FeaturePermissions {
  switch (role) {
    case "owner":
      return {
        // General
        canViewDashboard: true,
        canViewReports: true,
        canViewFullFinancials: true,

        // Sales
        canProcessSales: true,
        canRefundTransactions: true,
        canCancelTransactions: true,
        canViewAllTransactions: true,
        canManageOnlineOrders: true,
        canApprovePayments: true,

        // Inventory
        canAddProducts: true,
        canEditProducts: true,
        canDeleteProducts: true,
        canManageStock: true,
        canViewStockValue: true,

        // Customers
        canAddCustomers: true,
        canEditCustomers: true,
        canDeleteCustomers: true,
        canViewCustomerHistory: true,

        // Staff
        canAddStaff: true,
        canEditStaff: true,
        canDeleteStaff: true,
        canChangeStaffRoles: true,

        // Shops
        canManageShops: true,
        canViewShopReports: true,

        // Expenses
        canAddExpenses: true,
        canEditExpenses: true,
        canDeleteExpenses: true,

        // Settings
        canEditBusinessSettings: true,
        canEditPrintSettings: true,
        canManageIntegrations: true,
      };

    case "manager":
      return {
        // General
        canViewDashboard: true,
        canViewReports: true,
        canViewFullFinancials: true,

        // Sales
        canProcessSales: true,
        canRefundTransactions: true,
        canCancelTransactions: true,
        canViewAllTransactions: true,
        canManageOnlineOrders: true,
        canApprovePayments: true,

        // Inventory
        canAddProducts: true,
        canEditProducts: true,
        canDeleteProducts: false, // Managers cannot delete products
        canManageStock: true,
        canViewStockValue: true,

        // Customers
        canAddCustomers: true,
        canEditCustomers: true,
        canDeleteCustomers: false, // Managers cannot delete customers
        canViewCustomerHistory: true,

        // Staff
        canAddStaff: false,
        canEditStaff: false,
        canDeleteStaff: false,
        canChangeStaffRoles: false,

        // Shops
        canManageShops: false,
        canViewShopReports: false,

        // Expenses
        canAddExpenses: true,
        canEditExpenses: true,
        canDeleteExpenses: false,

        // Settings
        canEditBusinessSettings: false,
        canEditPrintSettings: true,
        canManageIntegrations: false,
      };

    case "staff":
      return {
        // General
        canViewDashboard: false,
        canViewReports: false,
        canViewFullFinancials: false,

        // Sales
        canProcessSales: true,
        canRefundTransactions: false,
        canCancelTransactions: false,
        canViewAllTransactions: true,
        canManageOnlineOrders: false,
        canApprovePayments: false,

        // Inventory
        canAddProducts: false,
        canEditProducts: false,
        canDeleteProducts: false,
        canManageStock: false,
        canViewStockValue: false,

        // Customers
        canAddCustomers: true,
        canEditCustomers: true,
        canDeleteCustomers: false,
        canViewCustomerHistory: true,

        // Staff
        canAddStaff: false,
        canEditStaff: false,
        canDeleteStaff: false,
        canChangeStaffRoles: false,

        // Shops
        canManageShops: false,
        canViewShopReports: false,

        // Expenses
        canAddExpenses: false,
        canEditExpenses: false,
        canDeleteExpenses: false,

        // Settings
        canEditBusinessSettings: false,
        canEditPrintSettings: false,
        canManageIntegrations: false,
      };

    default:
      // Customer or unknown role - no permissions
      return {
        canViewDashboard: false,
        canViewReports: false,
        canViewFullFinancials: false,
        canProcessSales: false,
        canRefundTransactions: false,
        canCancelTransactions: false,
        canViewAllTransactions: false,
        canManageOnlineOrders: false,
        canApprovePayments: false,
        canAddProducts: false,
        canEditProducts: false,
        canDeleteProducts: false,
        canManageStock: false,
        canViewStockValue: false,
        canAddCustomers: false,
        canEditCustomers: false,
        canDeleteCustomers: false,
        canViewCustomerHistory: false,
        canAddStaff: false,
        canEditStaff: false,
        canDeleteStaff: false,
        canChangeStaffRoles: false,
        canManageShops: false,
        canViewShopReports: false,
        canAddExpenses: false,
        canEditExpenses: false,
        canDeleteExpenses: false,
        canEditBusinessSettings: false,
        canEditPrintSettings: false,
        canManageIntegrations: false,
      };
  }
}

/**
 * Check if a user role has permission to access a route
 */
export function hasRoutePermission(role: UserRole, path: string): boolean {
  const permission = routePermissions.find((p) => path.startsWith(p.path));
  if (!permission) {
    // If route not found in permissions, allow access (for dynamic routes)
    return true;
  }
  return permission.allowedRoles.includes(role);
}

/**
 * Get accessible routes for a specific role
 */
export function getAccessibleRoutes(role: UserRole): RoutePermission[] {
  return routePermissions.filter((p) => p.allowedRoles.includes(role));
}
