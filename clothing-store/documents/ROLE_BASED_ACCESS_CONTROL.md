# Role-Based Access Control (RBAC) in POS System

## Overview
This document outlines the role-based access control system implemented in the POS (Point of Sale) application. The system supports three primary roles: **Owner**, **Manager**, and **Staff**, each with specific permissions and access levels.

---

## User Roles

### 🔴 Owner (Highest Privilege)
**Description:** The business owner with full system access and control over all business operations.

**Core Responsibilities:**
- Full business oversight and management
- Strategic decision-making with complete financial visibility
- Staff and branch management
- System configuration and integrations
- Ultimate authority on all business operations

---

### 🟡 Manager (Supervisory Role)
**Description:** Store or branch managers who supervise daily operations and staff.

**Core Responsibilities:**
- Day-to-day operational management
- Sales and inventory oversight
- Customer relationship management
- Reporting to owner with operational insights
- Supervising staff performance

---

### 🟢 Staff (Operational Role)
**Description:** Front-line employees who handle customer transactions and basic operations.

**Core Responsibilities:**
- Process customer sales and transactions
- Assist customers with purchases
- Basic customer information management
- Follow operational procedures set by management
- Execute assigned branch operations only

---

## Detailed Permission Matrix

### 📊 Dashboard & Analytics

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Business Dashboard | ✅ Full | ✅ Full | ❌ No |
| View Sales Reports | ✅ All branches | ✅ All branches | ❌ No |
| View Financial Analytics | ✅ Complete | ✅ Complete | ❌ No |
| View Profit/Loss Data | ✅ Yes | ✅ Yes | ❌ No |
| Export Reports | ✅ Yes | ✅ Yes | ❌ No |

---

### 💰 Sales & Transactions

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| Process Sales (POS) | ✅ Yes | ✅ Yes | ✅ Yes |
| View Transactions | ✅ All | ✅ All | ✅ All |
| Refund Transactions | ✅ Yes | ✅ Yes | ❌ No |
| Cancel Transactions | ✅ Yes | ✅ Yes | ❌ No |
| Delete Transactions | ✅ Yes | ❌ No | ❌ No |
| View Payment Details | ✅ Full | ✅ Full | ⚠️ Limited |
| Process Payments | ✅ Yes | ✅ Yes | ✅ Yes |
| Approve Large Payments | ✅ Yes | ✅ Yes | ❌ No |

---

### 📦 Inventory Management

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Stock List | ✅ All branches | ✅ All branches | ⚠️ Own branch |
| Add New Products | ✅ Yes | ✅ Yes | ❌ No |
| Edit Product Details | ✅ Yes | ✅ Yes | ❌ No |
| Delete Products | ✅ Yes | ❌ No | ❌ No |
| Manage Stock Levels | ✅ Yes | ✅ Yes | ❌ No |
| View Stock Value | ✅ Yes | ✅ Yes | ❌ No |
| Import/Export Stock | ✅ Yes | ✅ Yes | ❌ No |
| Price Management | ✅ Yes | ✅ Yes | ❌ No |
| Wholesale Pricing | ✅ Yes | ✅ Yes | ❌ No |

---

### 👥 Customer Management

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Customers List | ✅ All | ✅ All | ✅ All |
| Add New Customers | ✅ Yes | ✅ Yes | ✅ Yes |
| Edit Customer Info | ✅ Yes | ✅ Yes | ✅ Yes |
| Delete Customers | ✅ Yes | ❌ No | ❌ No |
| View Purchase History | ✅ Complete | ✅ Complete | ✅ Basic |
| Manage Loyalty Points | ✅ Yes | ✅ Yes | ⚠️ View only |
| Issue Coupons | ✅ Yes | ✅ Yes | ❌ No |
| Customer Analytics | ✅ Yes | ✅ Yes | ❌ No |

---

### 🛒 Online Orders (E-commerce)

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Online Orders | ✅ All | ✅ All | ❌ No |
| Process Orders | ✅ Yes | ✅ Yes | ❌ No |
| Approve/Reject Orders | ✅ Yes | ✅ Yes | ❌ No |
| Manage Order Status | ✅ Yes | ✅ Yes | ❌ No |
| Handle Returns | ✅ Yes | ✅ Yes | ❌ No |
| View Online Analytics | ✅ Yes | ✅ Yes | ❌ No |

---

### 💳 Payments & Financial

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Payment Records | ✅ All | ✅ All | ✅ Own |
| Cash Payments | ✅ Yes | ✅ Yes | ✅ Yes |
| Digital Payments (Scan) | ✅ Yes | ✅ Yes | ✅ Yes |
| COD Orders | ✅ Manage | ✅ Manage | ⚠️ View only |
| Payment Reconciliation | ✅ Yes | ✅ Yes | ❌ No |
| View Payment Analytics | ✅ Yes | ✅ Yes | ❌ No |

---

### 💸 Expenses Management

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Expenses | ✅ All | ✅ All | ❌ No |
| Add Expenses | ✅ Yes | ✅ Yes | ❌ No |
| Edit Expenses | ✅ Yes | ✅ Yes | ❌ No |
| Delete Expenses | ✅ Yes | ❌ No | ❌ No |
| Categorize Expenses | ✅ Yes | ✅ Yes | ❌ No |
| Export Expense Reports | ✅ Yes | ✅ Yes | ❌ No |

---

### 🏪 Branch/Shop Management

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Branch List | ✅ All | ⚠️ View only | ⚠️ Own branch |
| Add New Branch | ✅ Yes | ❌ No | ❌ No |
| Edit Branch Info | ✅ Yes | ❌ No | ❌ No |
| Delete Branch | ✅ Yes | ❌ No | ❌ No |
| Switch Between Branches | ✅ Yes | ✅ Yes | ✅ Yes |
| View Branch Reports | ✅ All | ❌ No | ❌ No |
| Assign Staff to Branch | ✅ Yes | ❌ No | ❌ No |

---

### 👨‍💼 Staff Management

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Staff List | ✅ All | ❌ No | ❌ No |
| Add Staff/Manager | ✅ Yes | ❌ No | ❌ No |
| Edit Staff Info | ✅ Yes | ❌ No | ❌ No |
| Delete Staff | ✅ Yes | ❌ No | ❌ No |
| Assign Roles | ✅ Yes | ❌ No | ❌ No |
| Activate/Deactivate Staff | ✅ Yes | ❌ No | ❌ No |
| View Staff Performance | ✅ Yes | ❌ No | ❌ No |

---

### 🏷️ Barcode & Labels

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| Print Product Labels | ✅ Yes | ✅ Yes | ❌ No |
| Configure Label Settings | ✅ Yes | ✅ Yes | ❌ No |
| Bulk Print Labels | ✅ Yes | ✅ Yes | ❌ No |
| Custom Label Design | ✅ Yes | ❌ No | ❌ No |

---

### ⚙️ Settings & Configuration

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| Business Settings | ✅ Full edit | ❌ No | ❌ No |
| Tax & Currency Settings | ✅ Edit | ⚠️ View only | ⚠️ View only |
| Select Current Branch | ✅ Yes | ✅ Yes | ✅ Yes |
| Receipt Settings | ✅ Edit | ⚠️ View only | ❌ No |
| Print Configuration | ✅ Edit | ✅ Edit | ❌ No |
| Loyalty Program Setup | ✅ Edit | ❌ No | ❌ No |
| Integrations (Payment/API) | ✅ Full | ❌ No | ❌ No |
| Online Store Settings | ✅ Full | ❌ No | ❌ No |

---

### 🎁 Promotions & Membership

| Feature | Owner | Manager | Staff |
|---------|-------|---------|-------|
| View Promotions | ✅ Yes | ✅ Yes | ⚠️ View only |
| Create Promotions | ✅ Yes | ❌ No | ❌ No |
| Edit Promotions | ✅ Yes | ❌ No | ❌ No |
| Delete Promotions | ✅ Yes | ❌ No | ❌ No |
| Loyalty Tiers Setup | ✅ Yes | ❌ No | ❌ No |
| Coupon Management | ✅ Yes | ✅ Issue | ❌ No |

---

## Special Permissions & Notes

### 🔐 Security & Access

1. **Owner-Only Features:**
   - Staff account creation and management
   - Business-level settings and integrations
   - Complete financial oversight across all branches
   - Shop/branch creation and deletion
   - Role assignment and permission changes

2. **Manager Restrictions:**
   - Cannot manage other staff accounts
   - Cannot delete products or customers (safety measure)
   - Cannot access shop-level reports (branch comparison)
   - Cannot modify business-wide settings
   - Cannot manage staff or change roles

3. **Staff Restrictions:**
   - Limited to POS operations and customer service
   - Cannot access financial reports or analytics
   - Cannot modify inventory or pricing
   - Cannot process refunds or cancellations
   - Can only view their assigned branch data
   - Read-only access to settings (tax rate, currency)

---

## Branch/Multi-Location Access

### Branch Access Logic:

| Role | Branch Access |
|------|---------------|
| **Owner** | Full access to ALL branches with ability to switch views and compare performance |
| **Manager** | Can view and switch between branches, but cannot see branch comparison reports |
| **Staff** | Assigned to ONE specific branch, sees only that branch's data |

### Branch Selection:
- All roles can select their current working branch via:
  - Top navigation bar dropdown
  - Settings page branch selector
- Selection is saved per-user in:
  - LocalStorage (user-specific preference)
  - Firebase settings (persistent across devices)
- When branch is changed:
  - All pages update in real-time without refresh
  - Data filters automatically to show only selected branch
  - Cart and transactions are branch-specific

---

## Role Switching Feature (Owner Only)

The Owner has a special **"View As"** feature that allows them to:
- Switch perspective to Manager or Staff view
- Experience the system as other roles would see it
- Test permissions and UI/UX for different roles
- Return to Owner view at any time

**Purpose:**
- Quality assurance and testing
- Understanding staff/manager experience
- Training and demonstration purposes
- Troubleshooting permission issues

---

## Authentication & Security

### Login Methods:
1. **Email/Password** (all roles)
2. **Google Sign-In** (all roles)

### Security Measures:
- Role verification on every request
- Route protection with role checking
- Server-side permission validation
- JWT/Firebase token-based auth
- Automatic logout on role mismatch
- Protected API endpoints with role validation

---

## Best Practices & Recommendations

### For Real-World POS Systems:

#### 1. **Owner Role:**
- Should have at least 2 owner accounts (primary + backup)
- Enable two-factor authentication
- Regularly review staff access logs
- Conduct periodic permission audits
- Keep backup access credentials secure

#### 2. **Manager Role:**
- Ideal for:
  - Store managers
  - Department heads
  - Shift supervisors with more responsibility
- Should be limited in number (1-2 per branch)
- Grant manager role only to trusted, experienced staff
- Regular performance reviews

#### 3. **Staff Role:**
- Default role for new employees
- Sufficient for:
  - Cashiers
  - Sales associates
  - Front-line customer service
- Easy to train on limited interface
- Prevents accidental data modification
- Can be upgraded to Manager as they gain experience

#### 4. **Additional Role Suggestions:**
You may consider adding:
- **Accountant/Bookkeeper**: Read-only financial access
- **Inventory Manager**: Stock management only
- **Customer Service Lead**: Customer management focus
- **Regional Manager**: Multi-branch oversight (between Manager and Owner)

---

## Permission Override Scenarios

### When Staff Needs Higher Access:
1. Manager/Owner can temporarily assist using their login
2. Consider promoting to Manager role if frequently needed
3. Use "View As" feature for training without giving full access

### When Manager Needs Owner-Level Access:
1. Owner can temporarily grant specific permissions (custom implementation)
2. Consider promoting trusted managers to co-owner status
3. Use shared screen/remote assistance for sensitive operations

---

## Testing Checklist

Use this checklist to verify RBAC implementation:

### Owner Account:
- [ ] Can access all dashboard pages
- [ ] Can create/edit/delete staff
- [ ] Can manage all branches
- [ ] Can modify business settings
- [ ] Can view all financial data
- [ ] Can switch to Manager/Staff view

### Manager Account:
- [ ] Can access dashboard and reports
- [ ] Cannot manage staff accounts
- [ ] Can process refunds and cancellations
- [ ] Can manage inventory (but not delete)
- [ ] Can view online orders
- [ ] Cannot modify business settings

### Staff Account:
- [ ] Can only access POS and customers
- [ ] Cannot see dashboard or reports
- [ ] Cannot process refunds
- [ ] Cannot modify inventory
- [ ] Can only see current branch
- [ ] Settings page shows minimal info (read-only)

---

## Implementation Files Reference

**Key Files:**
- `src/config/rolePermissions.ts` - Permission definitions
- `src/hooks/usePermissions.ts` - Permission hook for components
- `src/components/auth/ProtectedRoute.tsx` - Route protection
- `src/types/auth.ts` - Role type definitions
- `src/contexts/AuthContext.tsx` - Authentication context
- `src/contexts/ViewModeContext.tsx` - Role switching for Owner

---

## Conclusion

This RBAC system provides:
✅ Clear separation of responsibilities  
✅ Security through least-privilege principle  
✅ Scalability for growing businesses  
✅ Flexibility for multi-branch operations  
✅ User-friendly role-based interfaces  
✅ Owner oversight with accountability  

The current implementation balances security with usability, ensuring each role has the tools they need without exposing sensitive business operations to unauthorized users.

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Maintained By:** Development Team
