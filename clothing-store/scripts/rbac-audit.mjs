/**
 * RBAC STATIC AUDIT
 * =================
 * Verifies the code against the documented permission matrix in
 * documents/ROLE_BASED_ACCESS_CONTROL.md (Document Version 3.0).
 *
 * Run:  npm run rbac:audit
 *
 * The expectations below (DOC_FLAGS, DOC_ROUTES) are transcribed BY HAND from
 * the documentation, deliberately not imported from the code, so this is a real
 * comparison rather than a tautology.
 *
 * Layers checked:
 *   1  Feature flags  - getRolePermissions() vs the documented matrix
 *   2  Route guards   - what each page.tsx actually allows
 *   3  Sidebar        - per-role menu visibility
 *   4  Enforcement    - are the action flags actually read by components?
 *   5  Server side    - API authorization, middleware, Firestore rules
 *
 * Exit code 0 = all checks pass, 1 = at least one FAIL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app");
const ROLES = ["owner", "manager", "staff"];

let pass = 0;
let fail = 0;
let warn = 0;
const failures = [];

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const yesNo = (b) => (b ? `${C.green}YES${C.reset}` : `${C.red} NO${C.reset}`);

const head = (t) => console.log(`\n${C.bold}${C.cyan}${"=".repeat(78)}\n${t}\n${"=".repeat(78)}${C.reset}`);
const sub = (t) => console.log(`\n${C.bold}${t}${C.reset}`);
function check(ok, label, detail = "") {
  if (ok) { pass++; console.log(`  ${C.green}PASS${C.reset}  ${label}`); }
  else { fail++; failures.push(label + (detail ? ` -- ${detail}` : "")); console.log(`  ${C.red}FAIL${C.reset}  ${label}${detail ? `\n        ${C.dim}${detail}${C.reset}` : ""}`); }
}
function warning(label, detail = "") {
  warn++;
  console.log(`  ${C.yellow}WARN${C.reset}  ${label}${detail ? `\n        ${C.dim}${detail}${C.reset}` : ""}`);
}

const read = (p) => fs.readFileSync(p, "utf8");
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const ALL_SRC_FILES = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

/* ------------------------------------------------------------------ *
 * Load the real rolePermissions.ts through the TypeScript compiler.
 * ------------------------------------------------------------------ */
const permSrcPath = path.join(SRC, "config", "rolePermissions.ts");
const permSrc = read(permSrcPath);

const transpiled = ts.transpileModule(
  // The only import is the UserRole type; drop it so the module stands alone.
  permSrc.replace(/^\s*import\s+\{[^}]*\}\s+from\s+["']@\/types\/auth["'];\s*$/m, ""),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

const mod = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);
const {
  getRolePermissions, hasPermission, routePermissions,
  hasRoutePermission, findRoutePermission, PERMISSION_KEYS,
} = mod;

/* ================================================================== *
 * LAYER 1 - Feature flags vs the documented matrix
 * ================================================================== */
// [owner, manager, staff, "doc row this implements"]
const O = true, X = false;
const DOC_FLAGS = {
  // Dashboard & Analytics
  canViewDashboard:             [O, O, X, "Dashboard: View Business Dashboard"],
  canViewReports:               [O, O, X, "Dashboard: View Sales Reports"],
  canViewFullFinancials:        [O, O, X, "Dashboard: View Financial Analytics"],
  canViewProfitLoss:            [O, O, X, "Dashboard: View Profit/Loss Data"],
  canExportReports:             [O, O, X, "Dashboard: Export Reports"],

  // Sales & Transactions
  canProcessSales:              [O, O, O, "Sales: Process Sales (POS)"],
  canViewAllTransactions:       [O, O, O, "Sales: View Transactions"],
  canRefundTransactions:        [O, O, X, "Sales: Refund Transactions"],
  canCancelTransactions:        [O, O, X, "Sales: Cancel Transactions"],
  canDeleteTransactions:        [O, X, X, "Sales: Delete Transactions"],
  canBulkDeleteTransactions:    [O, X, X, "Sales: Bulk Delete"],
  canViewFullPaymentDetails:    [O, O, X, "Sales: View Payment Details (staff limited)"],
  canUpdateDeliveryStatus:      [O, O, X, "Sales: Update Delivery Status (staff view only)"],
  canExportTransactions:        [O, O, X, "Sales: Export Transactions"],

  // Inventory
  canViewStockList:             [O, O, X, "Inventory: View Stock List"],
  canAddProducts:               [O, O, X, "Inventory: Add New Products"],
  canEditProducts:              [O, O, X, "Inventory: Edit Product Details"],
  canDeleteProducts:            [O, X, X, "Inventory: Delete Products"],
  canManageStock:               [O, O, X, "Inventory: Manage Stock Levels"],
  canViewStockValue:            [O, O, X, "Inventory: View Stock Value"],
  canManagePricing:             [O, O, X, "Inventory: Price Management"],
  canManageWholesalePricing:    [O, O, X, "Inventory: Wholesale Pricing"],
  canExportStockData:           [O, O, X, "Inventory: Export Data"],

  // Customers
  canViewCustomers:             [O, O, O, "Customers: View Customer List"],
  canAddCustomers:              [O, O, O, "Customers: Add New Customers"],
  canEditCustomers:             [O, O, O, "Customers: Edit Customer Info"],
  canDeleteCustomers:           [O, X, X, "Customers: Delete Customers"],
  canViewCustomerHistory:       [O, O, O, "Customers: View Purchase History"],
  canViewLoyaltyPoints:         [O, O, O, "Customers: View Loyalty Points"],
  canAdjustLoyaltyPoints:       [O, O, X, "Customers: Adjust Loyalty Points"],
  canIssueCoupons:              [O, O, X, "Customers: Issue Coupons"],
  canViewFullCustomerAnalytics: [O, O, X, "Customers: Customer Analytics (staff limited)"],

  // Online Orders
  canViewOnlineOrders:          [O, O, X, "Online: View Online Orders"],
  canManageOnlineOrders:        [O, O, X, "Online: Process Orders"],
  canUpdateOrderStatus:         [O, O, X, "Online: Update Order Status"],
  canHandleCancellations:       [O, O, X, "Online: Handle Cancellations"],
  canProcessOnlineRefunds:      [O, O, X, "Online: Process Refunds"],
  canViewOnlineTransactions:    [O, O, X, "Online: View Online Transactions"],
  canManageReturnRequests:      [O, O, X, "Online: Manage Return Requests"],
  canApprovePayments:           [O, O, X, "Online: Issue Refund Payments"],
  canViewRefundReports:         [O, O, X, "Online: View Refund Reports"],

  // Payments & Financial
  canViewOwnPayments:           [O, O, O, "Payments: View Payments (staff = own)"],
  canViewAllPayments:           [O, O, X, "Payments: View Payments (all)"],
  canReconcilePayments:         [O, O, X, "Payments: Payment Reconciliation"],
  canExportPaymentData:         [O, O, X, "Payments: Export Payment Data"],
  canViewFinancialReports:      [O, O, X, "Payments: Financial Reports"],

  // Expenses
  canViewExpenses:              [O, O, X, "Expenses: View Expenses"],
  canAddExpenses:               [O, O, X, "Expenses: Add New Expense"],
  canEditExpenses:              [O, O, X, "Expenses: Edit Expense"],
  canDeleteExpenses:            [O, X, X, "Expenses: Delete Expense"],
  canBulkDeleteExpenses:        [O, X, X, "Expenses: Bulk Delete"],
  canManageExpenseCategories:   [O, O, X, "Expenses: Manage Categories"],
  canUploadReceipts:            [O, O, X, "Expenses: Upload Receipts"],
  canViewTotalExpenses:         [O, O, X, "Expenses: View Total Expenses"],
  canExportExpenseData:         [O, O, X, "Expenses: Export Data"],

  // Branch / Shop
  canViewShops:                 [O, X, X, "Branch: View Shops List"],
  canManageShops:               [O, X, X, "Branch: Add/Edit/Delete Shop"],
  canViewShopReports:           [O, X, X, "Branch: View Shop Reports"],
  canCompareShops:              [O, X, X, "Branch: Compare Shops"],

  // Staff
  canViewStaffMenu:             [O, X, X, "Staff: View Staff Menu"],
  canViewStaffList:             [O, X, X, "Staff: View Staff List"],
  canAddStaff:                  [O, X, X, "Staff: Add New Staff / Manager"],
  canEditStaff:                 [O, X, X, "Staff: Edit Staff Details"],
  canDeleteStaff:               [O, X, X, "Staff: Delete/Remove Staff"],
  canChangeStaffRoles:          [O, X, X, "Staff: Change Staff Role"],
  canViewStaffCredentials:      [O, X, X, "Staff: View Staff Credentials"],
  canResetPasswords:            [O, X, X, "Staff: Reset Passwords"],

  // Settings
  canAccessSettings:            [O, O, O, "Settings: Access Settings Page"],
  canEditBusinessSettings:      [O, O, X, "Settings: Business Information"],
  canSelectBranch:              [O, O, O, "Settings: Branch Selection"],
  canEditTaxRate:               [O, O, X, "Settings: Tax Rate (staff view only)"],
  canEditCurrencySettings:      [O, O, X, "Settings: Currency Settings (staff view only)"],
  canEditPrintSettings:         [O, O, X, "Settings: Receipt Settings"],
  canManageLoyaltyProgram:      [O, O, X, "Settings: Loyalty Program"],
  canEditStoreInformation:      [O, O, X, "Settings: Store Information"],
  canEditInvoiceSettings:       [O, O, X, "Settings: Invoice Customization"],
  canConfigureOwnerLayout:      [O, X, X, "Settings: My Workspace - owner's own layout"],

  // Promotions & Membership
  canViewPromotionsMenu:        [O, O, X, "Promotions: View Promotions Menu"],
  canManageMembership:          [O, O, X, "Promotions: Membership Management"],
  canViewCustomerPoints:        [O, O, X, "Promotions: View Customer Points"],
  canRedeemCouponsAdmin:        [O, O, X, "Promotions: Redeem Coupons (Admin)"],
  canViewPointsHistory:         [O, O, X, "Promotions: View Points History"],
  canManageOnlinePromotions:    [O, O, X, "Promotions: Online Promotions"],
  canCreatePromotions:          [O, O, X, "Promotions: Create Promotions"],
  canEditPromotions:            [O, O, X, "Promotions: Edit Promotions"],
  canDeletePromotions:          [O, O, X, "Promotions: Delete Promotions"],
};

head("LAYER 1 - Feature permission flags  (src/config/rolePermissions.ts)");
console.log(`${C.dim}Every row of the documented matrix, checked against getRolePermissions().${C.reset}`);
const actual = Object.fromEntries(ROLES.map((r) => [r, getRolePermissions(r)]));

const docFlagNames = Object.keys(DOC_FLAGS);
let mismatchCount = 0;
console.log(`\n  ${"FLAG".padEnd(30)}OWNER    MANAGER  STAFF    DOC MATCH`);
console.log(`  ${"-".repeat(74)}`);
for (const flag of docFlagNames) {
  const expected = DOC_FLAGS[flag].slice(0, 3);
  const got = ROLES.map((r) => actual[r][flag]);
  const ok = expected.every((e, i) => e === got[i]);
  if (!ok) mismatchCount++;
  const cells = got.map((g) => (g ? "true " : "false").padEnd(9));
  console.log(`  ${flag.padEnd(30)}${cells.join("")}${ok ? `${C.green}ok${C.reset}` : `${C.red}MISMATCH${C.reset}`}`);
}

sub("Layer 1 results");
for (const flag of docFlagNames) {
  const expected = DOC_FLAGS[flag].slice(0, 3);
  const docRow = DOC_FLAGS[flag][3];
  const got = ROLES.map((r) => actual[r][flag]);
  const ok = expected.every((e, i) => e === got[i]);
  if (!ok) {
    check(false, `${flag} matches doc`,
      `doc "${docRow}" expects {${ROLES.map((r, i) => `${r}:${expected[i]}`).join(", ")}} but code returns {${ROLES.map((r, i) => `${r}:${got[i]}`).join(", ")}}`);
  }
}
check(mismatchCount === 0,
  `all ${docFlagNames.length} documented permissions match the code`,
  mismatchCount ? `${mismatchCount} mismatched (listed above)` : "");

// Every documented row must have a flag, and every flag should be documented.
const codeFlagNames = PERMISSION_KEYS ?? Object.keys(actual.owner);
const undocumented = codeFlagNames.filter((k) => !docFlagNames.includes(k));
check(undocumented.length === 0, "no flag exists that the documentation does not describe",
  undocumented.length ? `${undocumented.join(", ")} (harmless, but add them to the doc or remove them)` : "");

// The unknown-role path must deny everything.
const customerPerms = getRolePermissions("customer");
const leaked = codeFlagNames.filter((k) => customerPerms[k]);
check(leaked.length === 0, "an unrecognised role gets zero permissions (fail closed)",
  leaked.length ? `these are true for role "customer": ${leaked.join(", ")}` : "");
check(hasPermission(null, "canProcessSales") === false,
  "hasPermission(null, ...) denies rather than throws");

/* ================================================================== *
 * LAYER 2 - Route guards
 * ================================================================== */
const DOC_ROUTES = {
  "owner/home":                        ["owner", "manager", "staff"],
  "owner/dashboard":                   ["owner", "manager"],
  "owner/sales/transactions":          ["owner", "manager", "staff"],
  "owner/sales/reports":               ["owner", "manager"],
  "owner/sales/payments":              ["owner", "manager", "staff"],
  "owner/sales/online-orders":         ["owner", "manager"],
  "owner/sales/online-transactions":   ["owner", "manager"],
  "owner/requests/cancellations":      ["owner", "manager"],
  "owner/requests/refunds":            ["owner", "manager"],
  "owner/requests/pending-refunds":    ["owner", "manager"],
  "owner/requests/refund-report":      ["owner", "manager"],
  "owner/inventory/stocks":            ["owner", "manager"],
  "owner/inventory/stocks/new-stock":  ["owner", "manager"],
  "owner/inventory/stocks/edit/[id]":  ["owner", "manager"],
  "owner/inventory/customers":         ["owner", "manager", "staff"],
  "owner/membership":                  ["owner", "manager"],
  "owner/online-promotions":           ["owner", "manager"],
  "owner/expenses":                    ["owner", "manager"],
  "owner/shops/manage":                ["owner"],
  "owner/shops/reports":               ["owner"],
  "owner/staff":                       ["owner"],
  "owner/settings":                    ["owner", "manager", "staff"],
  "owner/notifications":               ["owner", "manager", "staff"],
  "owner/barcode/label-print":         ["owner", "manager"],
  "owner/barcode/print-settings":      ["owner", "manager"],
};

/** Turn an app-dir relative folder into the URL a browser would request. */
const toUrl = (rel) => "/" + rel.replace(/\/\[[^\]]+\]/g, "/sample-id");

/**
 * What can actually reach this page?
 * ProtectedRoute now falls back to routePermissions, so a bare <ProtectedRoute>
 * is still role-gated; only a missing guard is a hole.
 */
function effectiveAccess(src, url) {
  const withRole = [...src.matchAll(/<ProtectedRoute\s+requiredRole=\{?\s*(\[[^\]]*\]|"[a-z]+")\s*\}?\s*>/g)];
  if (withRole.length) {
    const raw = withRole[withRole.length - 1][1];
    return { kind: "explicit", roles: [...raw.matchAll(/"([a-z]+)"/g)].map((m) => m[1]) };
  }
  if (/<ProtectedRoute[\s>]/.test(src)) {
    const rule = findRoutePermission(url);
    return rule
      ? { kind: "from route table", roles: rule.allowedRoles }
      : { kind: "fail-closed (unregistered)", roles: [] };
  }
  return { kind: "NO GUARD", roles: [...ROLES, "anonymous"] };
}

head("LAYER 2 - Route guards  (per page.tsx)");
const pages = walk(APP)
  .filter((f) => f.endsWith("page.tsx"))
  .map((p) => ({
    rel: path.relative(APP, p).replace(/\\/g, "/").replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "(root)"),
    src: read(p),
  }))
  .filter(({ rel }) => rel !== "(root)" && !rel.startsWith("auth/"));

console.log(`\n  ${"ROUTE".padEnd(34)}${"REACHABLE BY".padEnd(26)}${"VIA".padEnd(24)}DOC`);
console.log(`  ${"-".repeat(104)}`);
for (const { rel, src } of pages) {
  const acc = effectiveAccess(src, toUrl(rel));
  const doc = DOC_ROUTES[rel];
  const bad = doc ? acc.roles.some((r) => !doc.includes(r)) : false;
  const rolesStr = acc.roles.length ? acc.roles.join(",") : "(nobody)";
  console.log(`  ${rel.padEnd(34)}${(bad ? C.red + rolesStr + C.reset : rolesStr).padEnd(bad ? 35 : 26)}${acc.kind.padEnd(24)}${doc ? doc.join(",") : "-"}`);
}

sub("Layer 2 results - can a role open a page the doc denies?");
for (const { rel, src } of pages) {
  const doc = DOC_ROUTES[rel];
  if (!doc) { warning(`${rel} is not in the documented matrix`); continue; }
  const acc = effectiveAccess(src, toUrl(rel));
  const over = acc.roles.filter((r) => !doc.includes(r));
  check(over.length === 0, `${rel} denies every role the doc denies`,
    over.length ? `guard=${acc.kind}; reachable by [${over.join(", ")}] but doc allows only [${doc.join(", ")}]` : "");
}

sub("Layer 2 results - is the route table live and safe?");
const consumerText = ALL_SRC_FILES
  .filter((f) => !f.endsWith("rolePermissions.ts"))
  .map(read).join("\n");
const tableUsed = /hasRoutePermission\s*\(|findRoutePermission\s*\(|getAccessibleRoutes\s*\(/.test(consumerText);
check(tableUsed, "routePermissions is actually consulted at runtime",
  tableUsed ? "" : "nothing calls hasRoutePermission/findRoutePermission, so the table is documentation only");

check(hasRoutePermission("staff", "/owner/some/brand/new/page") === false,
  "an unregistered /owner route is denied by default (fails closed)",
  hasRoutePermission("staff", "/owner/some/brand/new/page") ? "it returns true, so any new page is public to every role" : "");

// Longest-prefix matching must not let a child route inherit the wrong parent.
const editRule = findRoutePermission("/owner/inventory/stocks/edit/abc123");
check(editRule?.path === "/owner/inventory/stocks/edit",
  "dynamic child routes resolve to their own rule, not a shorter parent prefix",
  `resolved to "${editRule?.path}"`);

// Every page must be registered.
const unregistered = pages.filter(({ rel }) => !findRoutePermission(toUrl(rel)));
check(unregistered.length === 0, "every page is registered in routePermissions",
  unregistered.length ? `missing: ${unregistered.map((p) => p.rel).join(", ")}` : "");

/* ================================================================== *
 * LAYER 3 - Sidebar
 * ================================================================== */
head("LAYER 3 - Sidebar menu visibility per role");
const sidebarSrc = read(path.join(SRC, "components", "ui", "Sidebar.tsx"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const menu = [];
for (const m of sidebarSrc.matchAll(/id:\s*"([a-z0-9-]+)"[\s\S]{0,400}?roles:\s*\[([^\]]*)\]/g)) {
  const href = /href:\s*"([^"]+)"/.exec(m[0]);
  menu.push({
    id: m[1],
    href: href ? href[1] : null,
    roles: [...m[2].matchAll(/"([a-z]+)"/g)].map((x) => x[1]),
  });
}

console.log(`\n  ${"MENU ITEM".padEnd(26)}${"HREF".padEnd(36)}OWNER  MANAGER  STAFF`);
console.log(`  ${"-".repeat(84)}`);
for (const it of menu) {
  console.log(`  ${it.id.padEnd(26)}${(it.href || "(group)").padEnd(36)}` +
    `${yesNo(it.roles.includes("owner"))}    ${yesNo(it.roles.includes("manager"))}     ${yesNo(it.roles.includes("staff"))}`);
}

sub("Layer 3 results - menu visibility vs the route it links to");
for (const it of menu) {
  if (!it.href) continue;
  const rel = it.href.replace(/^\//, "");
  const doc = DOC_ROUTES[rel];
  if (!doc) { warning(`menu "${it.id}" -> ${it.href} not in documented matrix`); continue; }
  const same = ROLES.every((r) => it.roles.includes(r) === doc.includes(r));
  check(same, `menu "${it.id}" is visible to exactly the documented roles`,
    same ? "" : `sidebar=[${it.roles.join(",")}] doc=[${doc.join(",")}]`);
}

// The sidebar must agree with the route table, not just with the doc.
sub("Layer 3 results - sidebar agrees with routePermissions (no drift)");
let drift = 0;
for (const it of menu) {
  if (!it.href) continue;
  const rule = findRoutePermission(it.href);
  if (!rule) continue;
  const same = ROLES.every((r) => it.roles.includes(r) === rule.allowedRoles.includes(r));
  if (!same) {
    drift++;
    console.log(`  ${C.red}drift${C.reset} ${it.id}: sidebar=[${it.roles.join(",")}] routeTable=[${rule.allowedRoles.join(",")}]`);
  }
}
check(drift === 0, "no menu item disagrees with the route table",
  drift ? `${drift} item(s) drifted - a user would see a link that then denies them` : "");

/* ================================================================== *
 * LAYER 3b - The owner's "View as role" preview
 * ================================================================== */
head('LAYER 3b - "View as role" preview  (owner previewing Manager / Staff)');
console.log(`${C.dim}The preview must be faithful: an owner viewing as Staff should see and be`);
console.log(`able to do exactly what Staff can. It must never let anyone gain access.${C.reset}`);

// --- the invariant, tested as a pure function ------------------------
sub("Who does the app behave as? resolveEffectiveRole(actualRole, viewAsRole)");
const EFFECTIVE_CASES = [
  // actual,    preview,      expected,   why
  ["owner",   "owner",      "owner",   "owner not previewing keeps full access"],
  ["owner",   "manager",    "manager", "owner previewing Manager acts as Manager"],
  ["owner",   "staff",      "staff",   "owner previewing Staff acts as Staff"],
  ["owner",   "customer",   "owner",   "a non-POS preview role is ignored"],
  ["owner",   null,         "owner",   "no preview set means full owner access"],
  ["manager", "owner",      "manager", "a manager cannot promote themselves"],
  ["staff",   "owner",      "staff",   "staff cannot promote themselves"],
  ["staff",   "manager",    "staff",   "staff cannot reach manager access"],
  ["customer","owner",      "customer","a customer cannot enter the POS"],
  [null,      "owner",      null,      "not signed in resolves to no role"],
];

console.log(`\n  ${"ACCOUNT".padEnd(12)}${"PREVIEWING".padEnd(14)}${"ACTS AS".padEnd(12)}RESULT`);
console.log(`  ${"-".repeat(74)}`);
for (const [actualRole, preview, expected] of EFFECTIVE_CASES) {
  const got = mod.resolveEffectiveRole(actualRole, preview);
  const ok = got === expected;
  console.log(`  ${String(actualRole).padEnd(12)}${String(preview).padEnd(14)}${String(got).padEnd(12)}${ok ? `${C.green}ok${C.reset}` : `${C.red}expected ${expected}${C.reset}`}`);
}
for (const [actualRole, preview, expected, why] of EFFECTIVE_CASES) {
  const got = mod.resolveEffectiveRole(actualRole, preview);
  check(got === expected, why, got === expected ? "" : `resolveEffectiveRole(${actualRole}, ${preview}) returned "${got}", expected "${expected}"`);
}

// --- the security property: a preview can only narrow ---------------
sub("Property: previewing can never grant a permission the account lacks");
const ALL_ROLE_VALUES = ["owner", "manager", "staff", "customer", null, "hacked"];
const escalations = [];
for (const actualRole of ALL_ROLE_VALUES) {
  if (!actualRole) continue;
  const real = getRolePermissions(actualRole);
  for (const preview of ALL_ROLE_VALUES) {
    const effective = mod.resolveEffectiveRole(actualRole, preview);
    if (!effective) continue;
    const previewed = getRolePermissions(effective);
    for (const key of Object.keys(previewed)) {
      if (previewed[key] && !real[key]) {
        escalations.push(`${actualRole} previewing ${preview} would gain ${key}`);
      }
    }
  }
}
check(escalations.length === 0,
  "no account/preview combination escalates a single permission",
  escalations.length ? `${escalations.length} escalation(s): ${escalations.slice(0, 5).join("; ")}${escalations.length > 5 ? " ..." : ""}` : "");

// --- is the preview actually wired into the UI? ---------------------
sub("Is the preview wired into permissions and routing, not just the menu?");
const permsHookSrc = read(path.join(SRC, "hooks", "usePermissions.ts"));
const guardSrc = read(path.join(SRC, "components", "auth", "ProtectedRoute.tsx"));
const viewModeSrc = read(path.join(SRC, "contexts", "ViewModeContext.tsx"));
const sidebarRaw = read(path.join(SRC, "components", "ui", "Sidebar.tsx"));

const wiring = [
  ["usePermissions resolves flags from the effective role", /effectiveRole/.test(permsHookSrc)],
  ["ProtectedRoute gates routes on the effective role", /effectiveRole/.test(guardSrc)],
  ["Sidebar filters the menu on the effective role", /effectiveRole/.test(sidebarRaw)],
  ["ViewModeContext delegates to resolveEffectiveRole", /resolveEffectiveRole/.test(viewModeSrc)],
];
console.log("");
for (const [label, ok] of wiring) console.log(`  ${label.padEnd(56)}${yesNo(ok)}`);
console.log("");
for (const [label, ok] of wiring) {
  check(ok, label, ok ? "" : "the preview would only be cosmetic here");
}

// An owner must never be able to trap themselves in a previewed role.
check(/resetToActualRole/.test(guardSrc) && /resetToActualRole/.test(viewModeSrc),
  "a denied page offers the owner a way out of the preview",
  "ProtectedRoute should call resetToActualRole so the owner is not stuck");

/* ================================================================== *
 * LAYER 3c - Owner workspace: "Hide the walk-in POS"
 * ================================================================== */
head('LAYER 3c - Owner setting: "Hide the walk-in POS"');
console.log(`${C.dim}One toggle must hide the Home menu entry AND the top-bar cart together,`);
console.log(`for the owner only. Managers and staff must keep both.${C.reset}`);

const posHookPath = path.join(SRC, "hooks", "usePosSurfaceVisibility.ts");
const posHookExists = fs.existsSync(posHookPath);
const posHookSrc = posHookExists ? read(posHookPath) : "";
const topNavSrc = read(path.join(SRC, "components", "ui", "TopNavBar.tsx"));
const settingsPageSrc = read(path.join(APP, "owner", "settings", "page.tsx"));
const settingsServiceSrc = read(path.join(SRC, "services", "settingsService.ts"));
const settingsApiSrc = read(path.join(APP, "api", "settings", "route.ts"));

check(posHookExists,
  "the two halves share one source of truth (usePosSurfaceVisibility)",
  posHookExists ? "" : "without a shared hook the menu and the cart can be hidden separately");

// Both consumers must read the SAME hook - this is what makes it a single switch.
const sidebarUsesHook = /usePosSurfaceVisibility/.test(sidebarRaw);
const topNavUsesHook = /usePosSurfaceVisibility/.test(topNavSrc);
console.log(`\n  ${"CONSUMER".padEnd(40)}USES THE SHARED HOOK?`);
console.log(`  ${"-".repeat(66)}`);
console.log(`  ${"Sidebar (Home menu entry)".padEnd(40)}${yesNo(sidebarUsesHook)}`);
console.log(`  ${"TopNavBar (cart button)".padEnd(40)}${yesNo(topNavUsesHook)}`);
console.log("");

check(sidebarUsesHook && topNavUsesHook,
  "Home and the cart are driven by the same switch, not two",
  `Sidebar: ${sidebarUsesHook}, TopNavBar: ${topNavUsesHook}`);

// Neither may re-derive the condition itself, or they could drift apart.
const localDrift = [
  ["Sidebar", /hidePosForOwner/.test(sidebarRaw)],
  ["TopNavBar", /hidePosForOwner/.test(topNavSrc)],
].filter(([, reads]) => reads);
check(localDrift.length === 0,
  "neither consumer reads the raw setting directly",
  localDrift.length ? `${localDrift.map(([n]) => n).join(", ")} bypasses the shared hook` : "");

// Scope: owner only, and it must respect the role preview.
check(/role === "owner"/.test(posHookSrc),
  "the preference applies to the owner only (managers and staff keep the POS)",
  "the hook should require the effective role to be owner");
check(/usePermissions/.test(posHookSrc),
  "scope is decided from the effective role, so previewing Staff restores the POS",
  "the hook should read usePermissions(), not user.role");

// The toggle itself must be owner-only in the UI and must persist.
check(/permissions\.canConfigureOwnerLayout/.test(settingsPageSrc),
  "the Settings toggle is gated on an owner-only permission",
  "it would otherwise appear for managers");
check(/hidePosForOwner/.test(settingsServiceSrc),
  "the setting is part of BusinessSettings and is read back from Firestore");
check(/hidePosForOwner/.test(settingsApiSrc),
  "POST /api/settings whitelists the setting so it actually saves",
  "the API builds an explicit object; an unlisted field is silently dropped");

/* ================================================================== *
 * LAYER 4 - Are the action flags actually read?
 * ================================================================== */
head("LAYER 4 - Enforcement: is each action flag read by a component?");
console.log(`${C.dim}View/route-level flags are enforced by Layer 2. The flags below gate a`);
console.log(`button or an action, so each one must appear in component code.${C.reset}`);

const ACTION_FLAGS = [
  "canRefundTransactions", "canCancelTransactions", "canBulkDeleteTransactions",
  "canExportTransactions", "canUpdateDeliveryStatus", "canViewFullPaymentDetails",
  "canViewProfitLoss",
  "canAddProducts", "canEditProducts", "canDeleteProducts", "canExportStockData",
  "canAddCustomers", "canEditCustomers", "canDeleteCustomers",
  "canAdjustLoyaltyPoints", "canViewFullCustomerAnalytics",
  "canManageReturnRequests", "canHandleCancellations", "canApprovePayments",
  "canExportReports", "canExportPaymentData",
  "canAddExpenses", "canEditExpenses", "canDeleteExpenses",
  "canBulkDeleteExpenses", "canManageExpenseCategories",
  "canAddStaff", "canDeleteStaff", "canManageShops",
  "canRedeemCouponsAdmin", "canCreatePromotions", "canEditPromotions", "canDeletePromotions",
  "canEditBusinessSettings", "canEditTaxRate", "canEditCurrencySettings",
  "canEditInvoiceSettings", "canManageLoyaltyProgram", "canConfigureOwnerLayout",
];

const componentText = ALL_SRC_FILES
  .filter((f) => !f.endsWith("rolePermissions.ts") && !f.endsWith("usePermissions.ts"))
  .map(read).join("\n");

console.log(`\n  ${"ACTION FLAG".padEnd(32)}READ IN COMPONENT CODE?`);
console.log(`  ${"-".repeat(58)}`);
const unread = [];
for (const flag of ACTION_FLAGS) {
  const used = new RegExp(`[.\\s{(!]${flag}\\b`).test(componentText);
  if (!used) unread.push(flag);
  console.log(`  ${flag.padEnd(32)}${yesNo(used)}`);
}
sub("Layer 4 results");
check(unread.length === 0, `all ${ACTION_FLAGS.length} action flags gate real UI`,
  unread.length ? `${unread.length} declared but never read, so they enforce nothing: ${unread.join(", ")}` : "");

sub("Layer 4 results - no UI gated on a raw role string");
const adhoc = [];
for (const f of ALL_SRC_FILES) {
  const src = read(f);
  // Ignore the auth plumbing, which legitimately compares roles.
  if (/(AuthContext|ViewModeContext|RoleViewSwitcher|authService|staffService|ProtectedRoute)\.tsx?$/.test(f)) continue;
  const hits = [...src.matchAll(/user\?\.role\s*(===|!==)\s*"(owner|manager|staff)"/g)]
    // A JSX-commented block is dead code, not a live gate.
    .filter((m) => !/\{\/\*[^]*?$/.test(src.slice(Math.max(0, m.index - 80), m.index)));
  if (hits.length) adhoc.push({ f: path.relative(ROOT, f), n: hits.length });
}
check(adhoc.length === 0, "no page gates UI on a hard-coded role string",
  adhoc.length ? adhoc.map((a) => `${a.f} (${a.n})`).join("; ") : "");
if (adhoc.length) {
  for (const { f, n } of adhoc) console.log(`        ${C.dim}${f}: ${n} hard-coded comparison(s)${C.reset}`);
}

/* ================================================================== *
 * LAYER 5 - Server side
 * ================================================================== */
head("LAYER 5 - Server-side authorization  (the security boundary)");
const apiRoutes = walk(path.join(APP, "api")).filter((f) => f.endsWith("route.ts"));
let guarded = 0;
console.log(`\n  ${"API ROUTE".padEnd(48)}VERIFIES CALLER?`);
console.log(`  ${"-".repeat(70)}`);
for (const f of apiRoutes) {
  const src = read(f);
  const ok = /verifyIdToken|adminAuth\.verify|requireRole|assertRole|getServerSession/.test(src);
  if (ok) guarded++;
  console.log(`  ${path.relative(APP, f).replace(/\\/g, "/").padEnd(48)}${yesNo(ok)}`);
}
sub("Layer 5 results");
check(apiRoutes.length > 0 && guarded === apiRoutes.length,
  "every API route verifies the caller's identity and role",
  `${apiRoutes.length - guarded}/${apiRoutes.length} routes accept any request. Client-side RBAC can be bypassed with a direct fetch().`);

const hasMiddleware = ["middleware.ts", "src/middleware.ts"].some((p) => fs.existsSync(path.join(ROOT, p)));
check(hasMiddleware, "a Next.js middleware enforces routes on the server",
  hasMiddleware ? "" : "no middleware.ts - route protection is client-side only");

const rulesFile = ["firestore.rules", "../firestore.rules", "../../firestore.rules"]
  .map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p));
check(!!rulesFile, "Firestore security rules are version-controlled",
  rulesFile ? "" : "no firestore.rules found - the browser reads Firestore directly, so rules are the only real boundary");

/* ================================================================== */
head("SUMMARY");
console.log(`  ${C.green}PASS${C.reset}  ${pass}`);
console.log(`  ${C.red}FAIL${C.reset}  ${fail}`);
console.log(`  ${C.yellow}WARN${C.reset}  ${warn}`);
if (failures.length) {
  console.log(`\n${C.bold}${C.red}Failing checks${C.reset}`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log(`\n  ${C.dim}Runtime counterpart: npm run rbac:runtime (needs npm run dev)${C.reset}\n`);
process.exit(fail ? 1 : 0);
