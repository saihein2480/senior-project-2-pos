# 🚀 RBAC Quick Test Guide - Start Testing Now!

## Get Started in 5 Minutes

Follow this guide to test your RBAC implementation quickly and systematically.

---

## Step 1: Prepare Test Accounts (5 minutes)

### Create Test Users

You need 3 test accounts. Use the Staff Management page (Owner login required):

**1. Owner Account** (Should already exist)
```
Role: owner
Use your existing owner account
```

**2. Manager Account**
```
Email: manager@test.com
Password: manager123
Role: manager
Branch: Any branch
```

**3. Staff Account**
```
Email: staff@test.com
Password: staff123
Role: staff
Branch: Any branch
```

---

## Step 2: Quick Sidebar Test (2 minutes each role)

This is the FASTEST way to verify RBAC is working.

### Test A: Login as Owner

1. Login as Owner
2. Check sidebar menu
3. Count menu items: **Should see ~23 items**

**Expected Owner Sidebar:**
```
✅ Home
✅ Dashboard
✅ Walk-in Sales
   ✅ Transactions
   ✅ Reports
   ✅ Payments
✅ Online Sales
   ✅ Online Orders
   ✅ Online Transactions
   ✅ Cancellations
✅ Inventory
   ✅ Stocks
   ✅ Customers
✅ Expenses
✅ Shops                    ← Owner only!
   ✅ Manage Shops
   ✅ Shop Reports
✅ Staff                    ← Owner only!
✅ Promotion & Membership
   ✅ Membership
   ✅ Online Promotions
✅ Settings
```

**Result:** 🟢 PASS / 🔴 FAIL

---

### Test B: Login as Manager

1. Logout Owner
2. Login as Manager
3. Check sidebar
4. Count menu items: **Should see ~20 items**

**Expected Manager Sidebar:**
```
✅ Home
✅ Dashboard
✅ Walk-in Sales
   ✅ Transactions
   ✅ Reports
   ✅ Payments
✅ Online Sales
   ✅ Online Orders
   ✅ Online Transactions
   ✅ Cancellations
✅ Inventory
   ✅ Stocks
   ✅ Customers
✅ Expenses
❌ Shops (Should be HIDDEN)
❌ Staff (Should be HIDDEN)
✅ Promotion & Membership
   ✅ Membership
   ✅ Online Promotions
✅ Settings
```

**Result:** 🟢 PASS / 🔴 FAIL

---

### Test C: Login as Staff

1. Logout Manager
2. Login as Staff
3. Check sidebar
4. Count menu items: **Should see ~7 items**

**Expected Staff Sidebar:**
```
✅ Home
✅ Walk-in Sales
   ✅ Transactions (only this submenu)
✅ Customers (direct, not submenu)
✅ Settings

EVERYTHING ELSE HIDDEN:
❌ Dashboard
❌ Reports
❌ Payments
❌ Online Sales
❌ Inventory > Stocks
❌ Expenses
❌ Shops
❌ Staff
❌ Promotions
```

**Result:** 🟢 PASS / 🔴 FAIL

---

## Step 3: URL Access Test (3 minutes each role)

Test if users can bypass sidebar restrictions by typing URLs directly.

### Critical URLs to Test

Open new browser tab and try these URLs:

#### Test as Owner (All should work ✅)
```
http://localhost:3000/owner/dashboard              ✅ Should load
http://localhost:3000/owner/expenses               ✅ Should load
http://localhost:3000/owner/shops/manage           ✅ Should load
http://localhost:3000/owner/staff                  ✅ Should load
http://localhost:3000/owner/membership             ✅ Should load
```

#### Test as Manager (Some should redirect ❌)
```
http://localhost:3000/owner/dashboard              ✅ Should load
http://localhost:3000/owner/expenses               ✅ Should load
http://localhost:3000/owner/shops/manage           ❌ Should redirect to /owner/home
http://localhost:3000/owner/staff                  ❌ Should redirect to /owner/home
http://localhost:3000/owner/membership             ✅ Should load
```

#### Test as Staff (Most should redirect ❌)
```
http://localhost:3000/owner/dashboard              ❌ Should redirect to /owner/home
http://localhost:3000/owner/expenses               ❌ Should redirect to /owner/home
http://localhost:3000/owner/shops/manage           ❌ Should redirect to /owner/home
http://localhost:3000/owner/staff                  ❌ Should redirect to /owner/home
http://localhost:3000/owner/membership             ❌ Should redirect to /owner/home
http://localhost:3000/owner/inventory/stocks       ❌ Should redirect to /owner/home
http://localhost:3000/owner/sales/reports          ❌ Should redirect to /owner/home
```

**Result:** 🟢 PASS / 🔴 FAIL

---

## Step 4: Button/Feature Test (5 minutes)

Test that action buttons appear/hide correctly.

### Test Transactions Page

**URL:** `http://localhost:3000/owner/sales/transactions`

#### As Owner:
- [ ] Can see "Refund" button ✅
- [ ] Can see "Cancel" button ✅
- [ ] Can see "Delete" button ✅

#### As Manager:
- [ ] Can see "Refund" button ✅
- [ ] Can see "Cancel" button ✅
- [ ] CANNOT see "Delete" button ❌

#### As Staff:
- [ ] CANNOT see "Refund" button ❌
- [ ] CANNOT see "Cancel" button ❌
- [ ] CANNOT see "Delete" button ❌
- [ ] Page is VIEW ONLY

**Result:** 🟢 PASS / 🔴 FAIL

---

### Test Customers Page

**URL:** `http://localhost:3000/owner/inventory/customers`

#### As Owner:
- [ ] Can see "Delete" button ✅

#### As Manager:
- [ ] CANNOT see "Delete" button ❌

#### As Staff:
- [ ] CANNOT see "Delete" button ❌

**Result:** 🟢 PASS / 🔴 FAIL

---

### Test Expenses Page

**URL:** `http://localhost:3000/owner/expenses`

#### As Owner:
- [ ] Can access page ✅
- [ ] Can see "Delete" button ✅

#### As Manager:
- [ ] Can access page ✅
- [ ] CANNOT see "Delete" button ❌

#### As Staff:
- [ ] CANNOT access page (redirects) ❌

**Result:** 🟢 PASS / 🔴 FAIL

---

## Step 5: Settings Page Test (2 minutes)

**URL:** `http://localhost:3000/owner/settings`

### As Owner:
- [ ] Can access page ✅
- [ ] See ALL sections:
  - [ ] Business Information ✅
  - [ ] Receipt Settings ✅
  - [ ] Currency Rate ✅
  - [ ] Loyalty Program ✅
  - [ ] Store Information ✅

### As Manager:
- [ ] Can access page ✅
- [ ] See ALL sections (same as Owner) ✅

### As Staff:
- [ ] Can access page ✅
- [ ] See ONLY these sections:
  - [ ] Current Branch (editable) ✅
  - [ ] Tax Rate (read-only) ✅
  - [ ] Currency Rate (read-only) ✅
- [ ] All other sections HIDDEN ❌

**Result:** 🟢 PASS / 🔴 FAIL

---

## Step 6: Role Switcher Test (Owner only - 3 minutes)

**Only test this as Owner!**

### Test A: Owner Can See Switcher
- [ ] Login as Owner
- [ ] Check TopNavBar (top right)
- [ ] See "👁️ Owner View ▼" badge ✅

### Test B: Manager Cannot See Switcher
- [ ] Login as Manager
- [ ] Check TopNavBar
- [ ] Role switcher NOT visible ❌

### Test C: Staff Cannot See Switcher
- [ ] Login as Staff
- [ ] Check TopNavBar
- [ ] Role switcher NOT visible ❌

### Test D: Switch to Manager View
- [ ] Login as Owner
- [ ] Click role switcher
- [ ] Select "Manager View"
- [ ] Badge changes to blue "Manager View" ✅
- [ ] Sidebar updates (Shops & Staff disappear) ✅
- [ ] Count menu items: ~20 ✅

### Test E: Switch to Staff View
- [ ] Login as Owner
- [ ] Click role switcher
- [ ] Select "Staff View"
- [ ] Badge changes to green "Staff View" ✅
- [ ] Sidebar dramatically reduces ✅
- [ ] Count menu items: ~7 ✅

### Test F: Return to Owner View
- [ ] Click role switcher
- [ ] Select "Owner View"
- [ ] Badge returns to purple "Owner View" ✅
- [ ] All menus restored ✅

**Result:** 🟢 PASS / 🔴 FAIL

---

## Quick Issue Checklist

Use this to quickly identify common problems:

### ❌ Issue: Sidebar shows wrong items
**Fix:** Check `src/components/ui/Sidebar.tsx` - verify `roles` arrays

### ❌ Issue: Page doesn't redirect when it should
**Fix:** Check page file has `<ProtectedRoute requiredRole={...}>`

### ❌ Issue: Buttons visible when they shouldn't be
**Fix:** Check page uses `usePermissions()` hook correctly

### ❌ Issue: Role switcher visible to Manager/Staff
**Fix:** Check `RoleViewSwitcher.tsx` has owner-only check

### ❌ Issue: Settings shows all sections to Staff
**Fix:** Check `settings/page.tsx` has conditional rendering `{user?.role !== "staff" && ...}`

---

## Summary Results

Fill this in as you test:

```
SECTION 1: Sidebar Test
Owner:   🟢 PASS / 🔴 FAIL
Manager: 🟢 PASS / 🔴 FAIL
Staff:   🟢 PASS / 🔴 FAIL

SECTION 2: URL Access Test
Owner:   🟢 PASS / 🔴 FAIL
Manager: 🟢 PASS / 🔴 FAIL
Staff:   🟢 PASS / 🔴 FAIL

SECTION 3: Button/Feature Test
Transactions: 🟢 PASS / 🔴 FAIL
Customers:    🟢 PASS / 🔴 FAIL
Expenses:     🟢 PASS / 🔴 FAIL

SECTION 4: Settings Test
Owner:   🟢 PASS / 🔴 FAIL
Manager: 🟢 PASS / 🔴 FAIL
Staff:   🟢 PASS / 🔴 FAIL

SECTION 5: Role Switcher Test
Visibility: 🟢 PASS / 🔴 FAIL
Switching:  🟢 PASS / 🔴 FAIL

OVERALL STATUS: ✅ ALL PASS / ❌ SOME FAIL
```

---

## What to Do If Tests Fail

### 1. Document the Failure
Write down:
- Which test failed
- What you expected
- What actually happened
- Screenshot if possible

### 2. Check Console for Errors
- Open browser console (F12)
- Look for red errors
- Copy error messages

### 3. Verify File Changes
Check if these files were modified:
- [ ] Page files have `<ProtectedRoute requiredRole={...}>`
- [ ] Sidebar has correct `roles: [...]` arrays
- [ ] Pages use `usePermissions()` where needed

### 4. Report Issues
Create a list of all failures:
```
1. [Issue description]
   - Expected: [what should happen]
   - Actual: [what happened]
   - File: [which file might be wrong]

2. [Next issue...]
```

---

## Next Steps

### All Tests Pass ✅
Great! Your RBAC is working correctly. You can:
- Deploy to production
- Create user documentation
- Train your team

### Some Tests Fail ❌
Don't worry! You can:
1. Use the detailed `RBAC_TESTING_CHECKLIST.md` for more thorough testing
2. Share your failure list so we can fix specific issues
3. Re-test after fixes

---

**Testing Time:** ~20-30 minutes total  
**Difficulty:** Easy - just follow the steps  
**Tools Needed:** Browser + 3 test accounts  

**Good luck! 🚀**
