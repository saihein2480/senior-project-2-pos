# 🧪 RBAC Testing Checklist - Complete Verification Guide

## Testing Overview

This document provides a **step-by-step testing guide** to verify every RBAC feature in the POS system. Test each section methodically with Owner, Manager, and Staff accounts.

---

## Test Prerequisites

### Required Test Accounts

Create these test accounts before starting:

```
1. Owner Account
   Email: owner@test.com
   Password: owner123
   Role: owner

2. Manager Account
   Email: manager@test.com
   Password: manager123
   Role: manager

3. Staff Account
   Email: staff@test.com
   Password: staff123
   Role: staff
```

### Testing Environment

- [ ] Local development server running (`npm run dev`)
- [ ] Browser opened (Chrome/Firefox recommended)
- [ ] Developer console open (F12)
- [ ] Clear browser cache before starting
- [ ] Use incognito/private mode for clean tests

---

## Testing Method

For each feature, follow this pattern:

```
1. TEST AS OWNER
   ✅ Should see/access feature
   ✅ Verify full functionality
   
2. TEST AS MANAGER
   ✅/❌ Check expected access
   ✅ Verify functionality if allowed
   
3. TEST AS STAFF
   ✅/❌ Check expected access
   ✅ Verify functionality if allowed
```

---

## Section 1: Dashboard & Analytics

### Test 1.1: Dashboard Page Access

**URL:** `http://localhost:3000/owner/dashboard`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/dashboard`
- [ ] **Expected:** ✅ Page loads successfully
- [ ] **Expected:** See revenue metrics, charts, statistics
- [ ] **Expected:** All data visible

#### Manager Test
- [ ] Logout Owner
- [ ] Login as Manager
- [ ] Navigate to `/owner/dashboard`
- [ ] **Expected:** ✅ Page loads successfully
- [ ] **Expected:** Same view as Owner
- [ ] **Expected:** All analytics visible

#### Staff Test
- [ ] Logout Manager
- [ ] Login as Staff
- [ ] Try to access `/owner/dashboard`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** No error message shown
- [ ] **Expected:** Dashboard not in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

**Issues Found:**
```
[Write any issues here]
```

---

### Test 1.2: Sidebar - Dashboard Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Dashboard" menu visible
- [ ] **Expected:** Can click and navigate

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Dashboard" menu visible
- [ ] **Expected:** Can click and navigate

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Dashboard" menu NOT visible
- [ ] **Expected:** Sidebar shows only: Home, Sales (Transactions), Customers, Settings

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 2: Sales & Transactions

### Test 2.1: Transactions Page Access

**URL:** `http://localhost:3000/owner/sales/transactions`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/sales/transactions`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See all transactions
- [ ] **Expected:** "Refund" button visible
- [ ] **Expected:** "Cancel" button visible
- [ ] **Expected:** "Delete" button visible

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/sales/transactions`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See all transactions
- [ ] **Expected:** "Refund" button visible
- [ ] **Expected:** "Cancel" button visible
- [ ] **Expected:** ❌ "Delete" button NOT visible

#### Staff Test
- [ ] Login as Staff
- [ ] Navigate to `/owner/sales/transactions`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See transactions
- [ ] **Expected:** ❌ "Refund" button NOT visible
- [ ] **Expected:** ❌ "Cancel" button NOT visible
- [ ] **Expected:** ❌ "Delete" button NOT visible
- [ ] **Expected:** VIEW ONLY mode

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 2.2: Refund Functionality

#### Owner Test
- [ ] Login as Owner
- [ ] Go to Transactions page
- [ ] Click "Refund" on a transaction
- [ ] **Expected:** ✅ Refund modal opens
- [ ] **Expected:** Can process refund

#### Manager Test
- [ ] Login as Manager
- [ ] Go to Transactions page
- [ ] Click "Refund" on a transaction
- [ ] **Expected:** ✅ Refund modal opens
- [ ] **Expected:** Can process refund

#### Staff Test
- [ ] Login as Staff
- [ ] Go to Transactions page
- [ ] **Expected:** ❌ No "Refund" button visible
- [ ] **Expected:** Cannot refund transactions

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 2.3: Sales Reports Page

**URL:** `http://localhost:3000/owner/sales/reports`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/sales/reports`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See sales reports

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/sales/reports`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See same reports

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/sales/reports`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Reports" submenu not visible in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 2.4: Payments Page

**URL:** `http://localhost:3000/owner/sales/payments`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/sales/payments`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See ALL columns: Date, Amount, Cost, Profit, Margin
- [ ] **Expected:** Can see profit and cost data

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/sales/payments`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See ALL columns including profit/cost

#### Staff Test
- [ ] Login as Staff
- [ ] Navigate to `/owner/sales/payments`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See LIMITED columns: Date, Amount only
- [ ] **Expected:** ❌ Cost column HIDDEN
- [ ] **Expected:** ❌ Profit column HIDDEN
- [ ] **Expected:** ❌ Margin column HIDDEN

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 3: Inventory Management

### Test 3.1: Stocks Page Access

**URL:** `http://localhost:3000/owner/inventory/stocks`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/inventory/stocks`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See all products
- [ ] **Expected:** "Add Stock" button visible
- [ ] **Expected:** Edit/Delete buttons visible

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/inventory/stocks`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See all products
- [ ] **Expected:** Can add/edit products
- [ ] **Expected:** ❌ Cannot delete products

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/inventory/stocks`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Stocks" submenu not in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 3.2: Customers Page Access

**URL:** `http://localhost:3000/owner/inventory/customers`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/inventory/customers`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See customer list
- [ ] **Expected:** Can add/edit customers
- [ ] **Expected:** ✅ "Delete" button visible

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/inventory/customers`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can add/edit customers
- [ ] **Expected:** ❌ "Delete" button NOT visible

#### Staff Test
- [ ] Login as Staff
- [ ] Navigate to `/owner/inventory/customers`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can add/edit customers
- [ ] **Expected:** ❌ "Delete" button NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 3.3: Sidebar - Inventory Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar under "Inventory"
- [ ] **Expected:** ✅ See "Stocks" submenu
- [ ] **Expected:** ✅ See "Customers" submenu

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar under "Inventory"
- [ ] **Expected:** ✅ See "Stocks" submenu
- [ ] **Expected:** ✅ See "Customers" submenu

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Inventory" menu shows only "Customers"
- [ ] **Expected:** ❌ "Stocks" submenu NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 4: Online Orders (E-commerce)

### Test 4.1: Online Orders Page

**URL:** `http://localhost:3000/owner/sales/online-orders`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/sales/online-orders`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See online orders

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/sales/online-orders`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See online orders

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/sales/online-orders`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Online Sales" menu not visible

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 4.2: Online Transactions Page

**URL:** `http://localhost:3000/owner/sales/online-transactions`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/sales/online-transactions`
- [ ] **Expected:** ✅ Page loads

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/sales/online-transactions`
- [ ] **Expected:** ✅ Page loads

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/sales/online-transactions`
- [ ] **Expected:** ❌ Redirected to `/owner/home`

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 4.3: Cancellations Page

**URL:** `http://localhost:3000/owner/requests/cancellations`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/requests/cancellations`
- [ ] **Expected:** ✅ Page loads

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/requests/cancellations`
- [ ] **Expected:** ✅ Page loads

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/requests/cancellations`
- [ ] **Expected:** ❌ Redirected to `/owner/home`

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 5: Expenses Management

### Test 5.1: Expenses Page Access

**URL:** `http://localhost:3000/owner/expenses`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/expenses`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See expense list
- [ ] **Expected:** "Add Expense" button visible
- [ ] **Expected:** Edit button visible
- [ ] **Expected:** ✅ Delete button visible

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/expenses`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can add/edit expenses
- [ ] **Expected:** ❌ Delete button NOT visible

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/expenses`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Expenses" menu not in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 5.2: Sidebar - Expenses Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Expenses" menu visible

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Expenses" menu visible

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Expenses" menu NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 6: Branch/Shop Management

### Test 6.1: Manage Shops Page

**URL:** `http://localhost:3000/owner/shops/manage`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/shops/manage`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See shop list
- [ ] **Expected:** Can add/edit/delete shops

#### Manager Test
- [ ] Login as Manager
- [ ] Try to access `/owner/shops/manage`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Shops" menu not in sidebar

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/shops/manage`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Shops" menu not in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 6.2: Shop Reports Page

**URL:** `http://localhost:3000/owner/shops/reports`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/shops/reports`
- [ ] **Expected:** ✅ Page loads

#### Manager Test
- [ ] Login as Manager
- [ ] Try to access `/owner/shops/reports`
- [ ] **Expected:** ❌ Redirected to `/owner/home`

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/shops/reports`
- [ ] **Expected:** ❌ Redirected to `/owner/home`

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 6.3: Sidebar - Shops Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Shops" menu visible
- [ ] **Expected:** See "Manage Shops" submenu
- [ ] **Expected:** See "Shop Reports" submenu

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Shops" menu NOT visible

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Shops" menu NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 7: Staff Management

### Test 7.1: Staff Page Access

**URL:** `http://localhost:3000/owner/staff`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/staff`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See staff list
- [ ] **Expected:** Can add/edit/delete staff

#### Manager Test
- [ ] Login as Manager
- [ ] Try to access `/owner/staff`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Staff" menu not in sidebar

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/staff`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Staff" menu not in sidebar

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 7.2: Sidebar - Staff Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Staff" menu visible

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Staff" menu NOT visible

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Staff" menu NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 8: Settings & Configuration

### Test 8.1: Settings Page Access

**URL:** `http://localhost:3000/owner/settings`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/settings`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See ALL sections:
  - [ ] Business Information
  - [ ] Invoice & Receipt Settings
  - [ ] Currency Rate
  - [ ] Loyalty Program Settings
  - [ ] Store Information

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/settings`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See ALL sections (same as Owner)

#### Staff Test
- [ ] Login as Staff
- [ ] Navigate to `/owner/settings`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** See ONLY:
  - [ ] Current Branch selector
  - [ ] Tax Rate (read-only)
  - [ ] Currency Rate (read-only)
- [ ] **Expected:** ❌ Other sections HIDDEN

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 8.2: Settings - Read-Only for Staff

#### Staff Test
- [ ] Login as Staff
- [ ] Go to Settings page
- [ ] Check Tax Rate section
- [ ] **Expected:** See tax rate value
- [ ] **Expected:** ❌ Cannot edit (read-only)
- [ ] Check Currency Rate section
- [ ] **Expected:** See exchange rate
- [ ] **Expected:** ❌ Cannot edit (read-only)
- [ ] Check Branch selector
- [ ] **Expected:** ✅ Can change branch
- [ ] **Expected:** "Save Branch" button visible (not "Save Settings")

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 9: Promotions & Membership

### Test 9.1: Membership Page

**URL:** `http://localhost:3000/owner/membership`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/membership`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can search customers
- [ ] **Expected:** See loyalty data

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/membership`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Same access as Owner

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/membership`
- [ ] **Expected:** ❌ Redirected to `/owner/home`
- [ ] **Expected:** "Promotion & Membership" menu not visible

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 9.2: Online Promotions Page

**URL:** `http://localhost:3000/owner/online-promotions`

#### Owner Test
- [ ] Login as Owner
- [ ] Navigate to `/owner/online-promotions`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can create promotions

#### Manager Test
- [ ] Login as Manager
- [ ] Navigate to `/owner/online-promotions`
- [ ] **Expected:** ✅ Page loads
- [ ] **Expected:** Can create promotions

#### Staff Test
- [ ] Login as Staff
- [ ] Try to access `/owner/online-promotions`
- [ ] **Expected:** ❌ Redirected to `/owner/home`

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 9.3: Sidebar - Promotions Menu

#### Owner Test
- [ ] Login as Owner
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Promotion & Membership" menu visible
- [ ] **Expected:** See "Membership" submenu
- [ ] **Expected:** See "Online Promotions" submenu

#### Manager Test
- [ ] Login as Manager
- [ ] Check sidebar
- [ ] **Expected:** ✅ "Promotion & Membership" menu visible
- [ ] **Expected:** Both submenus visible

#### Staff Test
- [ ] Login as Staff
- [ ] Check sidebar
- [ ] **Expected:** ❌ "Promotion & Membership" menu NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

## Section 10: View As Role Switcher

### Test 10.1: Role Switcher Visibility

#### Owner Test
- [ ] Login as Owner
- [ ] Check TopNavBar (top right)
- [ ] **Expected:** ✅ See "👁️ Owner View ▼" badge
- [ ] **Expected:** Badge has purple/pink gradient

#### Manager Test
- [ ] Login as Manager
- [ ] Check TopNavBar
- [ ] **Expected:** ❌ Role switcher NOT visible
- [ ] **Expected:** TopNavBar clean

#### Staff Test
- [ ] Login as Staff
- [ ] Check TopNavBar
- [ ] **Expected:** ❌ Role switcher NOT visible

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 10.2: Switch to Manager View

#### Owner Test
- [ ] Login as Owner
- [ ] Count sidebar items (should be ~23)
- [ ] Click role switcher badge
- [ ] Select "Manager View"
- [ ] **Expected:** Badge changes to blue "Manager View"
- [ ] **Expected:** Sidebar updates immediately
- [ ] **Expected:** Count sidebar items (should be ~20)
- [ ] **Expected:** "Shops" menu disappears
- [ ] **Expected:** "Staff" menu disappears
- [ ] Try accessing `/owner/shops/manage`
- [ ] **Expected:** ✅ Still accessible (route protection uses actual role)

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 10.3: Switch to Staff View

#### Owner Test
- [ ] Login as Owner
- [ ] Click role switcher
- [ ] Select "Staff View"
- [ ] **Expected:** Badge changes to green "Staff View"
- [ ] **Expected:** Sidebar dramatically reduces
- [ ] **Expected:** Count sidebar items (should be ~7)
- [ ] **Expected:** Only see: Home, Sales (Transactions), Customers, Settings
- [ ] **Expected:** Most menus hidden
- [ ] Try accessing `/owner/dashboard`
- [ ] **Expected:** ✅ Still accessible (actual role is owner)

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 10.4: Return to Owner View

#### Owner Test
- [ ] From any other view, click role switcher
- [ ] Select "Owner View"
- [ ] **Expected:** Badge returns to purple "Owner View"
- [ ] **Expected:** All 23 menu items restored
- [ ] **Expected:** Full access back

**Status:** 🟢 PASS / 🔴 FAIL

---

### Test 10.5: View Mode Persistence

#### Owner Test
- [ ] Login as Owner
- [ ] Switch to "Manager View"
- [ ] Refresh page (F5)
- [ ] **Expected:** Still in "Manager View" after refresh
- [ ] **Expected:** localStorage persists choice
- [ ] Switch back to "Owner View"
- [ ] Logout and login again
- [ ] **Expected:** Back to "Owner View" (default)

**Status:** 🟢 PASS / 🔴 FAIL

---

## Summary Report

### Test Results Summary

Fill this in as you complete tests:

```
Total Tests: 60
Passed: ___
Failed: ___
Pass Rate: ____%
```

### Failed Tests

List all failed tests here:

```
1. [Test number] - [Test name]
   Issue: [Description]
   
2. [Test number] - [Test name]
   Issue: [Description]
```

### Critical Issues

High-priority issues that must be fixed:

```
1. [Issue description]
   Impact: [Who is affected]
   Severity: High/Medium/Low
   
2. [Issue description]
   Impact: [Who is affected]
   Severity: High/Medium/Low
```

### Minor Issues

Low-priority issues that can be fixed later:

```
1. [Issue description]
2. [Issue description]
```

---

## Quick Testing Commands

### Browser Console Checks

Open browser console (F12) and run these to verify:

```javascript
// Check current user role
console.log(localStorage.getItem('userRole'));

// Check view mode (Owner only)
console.log(localStorage.getItem('ownerViewAsRole'));

// Check if user is authenticated
console.log(localStorage.getItem('authToken'));
```

### Network Tab Checks

Check these API calls return correct status:

```
✅ Protected endpoint accessed by allowed role: 200 OK
❌ Protected endpoint accessed by denied role: 403 Forbidden or redirect
```

---

## Testing Best Practices

1. **Clear Cache Between Tests**
   - Clear browser cache
   - Use incognito/private mode
   - Clear localStorage

2. **Test Systematically**
   - Complete one section before moving to next
   - Don't skip tests
   - Document all failures

3. **Verify Both UI and Backend**
   - Check if menu item is hidden
   - Try direct URL access
   - Verify API responses

4. **Test Edge Cases**
   - Direct URL access attempts
   - Browser back button behavior
   - Multiple tabs open
   - Page refresh persistence

5. **Document Everything**
   - Screenshot failures
   - Note console errors
   - Record unexpected behavior

---

## Next Steps After Testing

### If All Tests Pass ✅
- [ ] System is production-ready
- [ ] Proceed with deployment
- [ ] Create final test report

### If Tests Fail ❌
- [ ] Document each failure
- [ ] Prioritize fixes (critical first)
- [ ] Fix issues one by one
- [ ] Re-test after fixes
- [ ] Repeat until all pass

---

**Testing Started:** [Date]  
**Testing Completed:** [Date]  
**Tester Name:** [Your Name]  
**Environment:** Development / Production  
**Browser Used:** Chrome / Firefox / Safari  
**Final Status:** ✅ PASS / ❌ FAIL

---

**End of Testing Checklist**
