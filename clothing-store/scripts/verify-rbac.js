#!/usr/bin/env node

/**
 * RBAC Verification Script
 * 
 * This script analyzes the codebase to verify RBAC implementation
 * Run: node scripts/verify-rbac.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 RBAC Implementation Verification\n');
console.log('===================================\n');

// Pages that should have ProtectedRoute
const protectedPages = [
  { path: 'src/app/owner/dashboard/page.tsx', requiredRole: '["owner", "manager"]', name: 'Dashboard' },
  { path: 'src/app/owner/sales/transactions/page.tsx', requiredRole: '["owner", "manager", "staff"]', name: 'Transactions' },
  { path: 'src/app/owner/sales/reports/page.tsx', requiredRole: '["owner", "manager"]', name: 'Sales Reports' },
  { path: 'src/app/owner/sales/payments/page.tsx', requiredRole: '["owner", "manager", "staff"]', name: 'Payments' },
  { path: 'src/app/owner/sales/online-orders/page.tsx', requiredRole: '["owner", "manager"]', name: 'Online Orders' },
  { path: 'src/app/owner/sales/online-transactions/page.tsx', requiredRole: '["owner", "manager"]', name: 'Online Transactions' },
  { path: 'src/app/owner/requests/cancellations/page.tsx', requiredRole: '["owner", "manager"]', name: 'Cancellations' },
  { path: 'src/app/owner/inventory/stocks/page.tsx', requiredRole: '["owner", "manager"]', name: 'Inventory Stocks' },
  { path: 'src/app/owner/inventory/customers/page.tsx', requiredRole: '["owner", "manager", "staff"]', name: 'Customers' },
  { path: 'src/app/owner/expenses/page.tsx', requiredRole: '["owner", "manager"]', name: 'Expenses' },
  { path: 'src/app/owner/shops/manage/page.tsx', requiredRole: '"owner"', name: 'Manage Shops' },
  { path: 'src/app/owner/shops/reports/page.tsx', requiredRole: '"owner"', name: 'Shop Reports' },
  { path: 'src/app/owner/staff/page.tsx', requiredRole: '"owner"', name: 'Staff Management' },
  { path: 'src/app/owner/settings/page.tsx', requiredRole: '["owner", "manager", "staff"]', name: 'Settings' },
  { path: 'src/app/owner/membership/page.tsx', requiredRole: '["owner", "manager"]', name: 'Membership' },
  { path: 'src/app/owner/online-promotions/page.tsx', requiredRole: '["owner", "manager"]', name: 'Online Promotions' },
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const issues = [];

console.log('📋 Checking Protected Routes...\n');

protectedPages.forEach((page) => {
  totalTests++;
  const filePath = path.join(process.cwd(), page.path);
  
  try {
    if (!fs.existsSync(filePath)) {
      failedTests++;
      issues.push({
        file: page.name,
        issue: `File not found: ${page.path}`,
        severity: 'HIGH'
      });
      console.log(`❌ ${page.name} - File not found`);
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for ProtectedRoute
    if (!content.includes('<ProtectedRoute')) {
      failedTests++;
      issues.push({
        file: page.name,
        issue: 'Missing <ProtectedRoute> wrapper',
        severity: 'CRITICAL'
      });
      console.log(`❌ ${page.name} - Missing ProtectedRoute`);
      return;
    }
    
    // Check for requiredRole prop
    const hasRequiredRole = content.includes('requiredRole=');
    const hasCorrectRole = content.includes(`requiredRole=${page.requiredRole}`);
    
    if (!hasRequiredRole) {
      failedTests++;
      issues.push({
        file: page.name,
        issue: 'ProtectedRoute missing requiredRole prop',
        severity: 'CRITICAL'
      });
      console.log(`❌ ${page.name} - Missing requiredRole prop`);
      return;
    }
    
    if (!hasCorrectRole) {
      failedTests++;
      issues.push({
        file: page.name,
        issue: `Expected requiredRole=${page.requiredRole}`,
        severity: 'HIGH'
      });
      console.log(`⚠️  ${page.name} - Incorrect role specification`);
      return;
    }
    
    passedTests++;
    console.log(`✅ ${page.name} - Protected correctly`);
    
  } catch (error) {
    failedTests++;
    issues.push({
      file: page.name,
      issue: `Error reading file: ${error.message}`,
      severity: 'HIGH'
    });
    console.log(`❌ ${page.name} - Error: ${error.message}`);
  }
});

console.log('\n📊 Checking Sidebar Configuration...\n');

const sidebarPath = path.join(process.cwd(), 'src/components/ui/Sidebar.tsx');
totalTests++;

try {
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
  
  // Check if Sidebar uses viewAsRole
  if (sidebarContent.includes('useViewMode') && sidebarContent.includes('viewAsRole')) {
    passedTests++;
    console.log('✅ Sidebar - Using viewAsRole for filtering');
  } else {
    failedTests++;
    issues.push({
      file: 'Sidebar',
      issue: 'Not using viewAsRole from ViewModeContext',
      severity: 'MEDIUM'
    });
    console.log('⚠️  Sidebar - Not using viewAsRole');
  }
} catch (error) {
  failedTests++;
  issues.push({
    file: 'Sidebar',
    issue: `Error reading file: ${error.message}`,
    severity: 'HIGH'
  });
  console.log(`❌ Sidebar - Error: ${error.message}`);
}

console.log('\n👁️  Checking View Mode Context...\n');

const viewModeContextPath = path.join(process.cwd(), 'src/contexts/ViewModeContext.tsx');
totalTests++;

try {
  if (fs.existsSync(viewModeContextPath)) {
    const contextContent = fs.readFileSync(viewModeContextPath, 'utf8');
    
    if (contextContent.includes('viewAsRole') && contextContent.includes('setViewAsRole')) {
      passedTests++;
      console.log('✅ ViewModeContext - Implemented correctly');
    } else {
      failedTests++;
      issues.push({
        file: 'ViewModeContext',
        issue: 'Missing viewAsRole or setViewAsRole',
        severity: 'HIGH'
      });
      console.log('❌ ViewModeContext - Missing required exports');
    }
  } else {
    failedTests++;
    issues.push({
      file: 'ViewModeContext',
      issue: 'ViewModeContext.tsx not found',
      severity: 'HIGH'
    });
    console.log('❌ ViewModeContext - File not found');
  }
} catch (error) {
  failedTests++;
  issues.push({
    file: 'ViewModeContext',
    issue: `Error: ${error.message}`,
    severity: 'HIGH'
  });
  console.log(`❌ ViewModeContext - Error: ${error.message}`);
}

console.log('\n🎨 Checking Role View Switcher...\n');

const roleViewSwitcherPath = path.join(process.cwd(), 'src/components/ui/RoleViewSwitcher.tsx');
totalTests++;

try {
  if (fs.existsSync(roleViewSwitcherPath)) {
    const switcherContent = fs.readFileSync(roleViewSwitcherPath, 'utf8');
    
    // Check if it has owner-only check
    if (switcherContent.includes('user?.role !== "owner"') && switcherContent.includes('return null')) {
      passedTests++;
      console.log('✅ RoleViewSwitcher - Owner-only check present');
    } else {
      failedTests++;
      issues.push({
        file: 'RoleViewSwitcher',
        issue: 'Missing owner-only access check',
        severity: 'CRITICAL'
      });
      console.log('❌ RoleViewSwitcher - Missing owner-only check');
    }
  } else {
    failedTests++;
    issues.push({
      file: 'RoleViewSwitcher',
      issue: 'RoleViewSwitcher.tsx not found',
      severity: 'MEDIUM'
    });
    console.log('⚠️  RoleViewSwitcher - File not found');
  }
} catch (error) {
  failedTests++;
  issues.push({
    file: 'RoleViewSwitcher',
    issue: `Error: ${error.message}`,
    severity: 'MEDIUM'
  });
  console.log(`⚠️  RoleViewSwitcher - Error: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 VERIFICATION SUMMARY\n');
console.log(`Total Tests:   ${totalTests}`);
console.log(`✅ Passed:      ${passedTests}`);
console.log(`❌ Failed:      ${failedTests}`);
console.log(`Pass Rate:     ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

if (issues.length > 0) {
  console.log('🚨 ISSUES FOUND:\n');
  
  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
  const highIssues = issues.filter(i => i.severity === 'HIGH');
  const mediumIssues = issues.filter(i => i.severity === 'MEDIUM');
  
  if (criticalIssues.length > 0) {
    console.log('❌ CRITICAL (Must fix immediately):');
    criticalIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.file}: ${issue.issue}`);
    });
    console.log('');
  }
  
  if (highIssues.length > 0) {
    console.log('⚠️  HIGH (Fix before deployment):');
    highIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.file}: ${issue.issue}`);
    });
    console.log('');
  }
  
  if (mediumIssues.length > 0) {
    console.log('ℹ️  MEDIUM (Fix when possible):');
    mediumIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.file}: ${issue.issue}`);
    });
    console.log('');
  }
} else {
  console.log('✨ No issues found! RBAC implementation looks good.\n');
}

console.log('='.repeat(50) + '\n');

// Exit with error code if tests failed
if (failedTests > 0) {
  console.log('⚠️  Some tests failed. Please review and fix the issues above.\n');
  process.exit(1);
} else {
  console.log('🎉 All RBAC checks passed! System is ready for testing.\n');
  process.exit(0);
}
