/**
 * RBAC RUNTIME TEST
 * -----------------
 * Where rbac-audit.mjs reads the source, this script talks to the running app
 * and to the real Firebase project to see what actually happens.
 *
 * Run:
 *   1. npm run dev          (in one terminal)
 *   2. npm run rbac:runtime (in another)
 *
 * SAFETY: this script is read-only.
 *   - Every API probe is a GET, except two write probes that are deliberately
 *     built to be rejected by field validation BEFORE any database call:
 *       POST /api/staff     with role="__rbac_probe__"  -> "Invalid role"
 *       DELETE /api/expenses with no id                 -> "ID is required"
 *     Neither creates, updates or deletes a single document.
 *   - Firestore is only read, never written.
 *   - No accounts are created or modified.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.RBAC_TEST_URL || "http://localhost:3000";

/* -- load .env.local without printing any secret -------------------- */
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
let pass = 0, fail = 0, warn = 0;
const failures = [];

const head = (t) => console.log(`\n${C.bold}${C.cyan}${"=".repeat(78)}\n${t}\n${"=".repeat(78)}${C.reset}`);
const sub = (t) => console.log(`\n${C.bold}${t}${C.reset}`);
function check(ok, label, detail = "") {
  if (ok) { pass++; console.log(`  ${C.green}PASS${C.reset}  ${label}`); }
  else { fail++; failures.push(`${label}${detail ? ` -- ${detail}` : ""}`); console.log(`  ${C.red}FAIL${C.reset}  ${label}${detail ? `\n        ${C.dim}${detail}${C.reset}` : ""}`); }
}
function warning(label, detail = "") {
  warn++;
  console.log(`  ${C.yellow}WARN${C.reset}  ${label}${detail ? `\n        ${C.dim}${detail}${C.reset}` : ""}`);
}

async function req(method, url, body) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90_000), // dev server compiles a route on first hit
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, text, json, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, text: "", json: null, error: String(e.message || e), ms: Date.now() - started };
  }
}

/* ================================================================== */
head("PREFLIGHT");
const ping = await req("GET", "/");
if (ping.status === 0) {
  console.log(`  ${C.red}Cannot reach ${BASE}${C.reset}\n  ${C.dim}${ping.error}${C.reset}`);
  console.log(`\n  Start the app first:  ${C.bold}npm run dev${C.reset}   then re-run this script.`);
  console.log(`  Or point it elsewhere: ${C.bold}$env:RBAC_TEST_URL="http://localhost:3001"${C.reset}\n`);
  process.exit(2);
}
console.log(`  Server reachable at ${BASE} (HTTP ${ping.status}, ${ping.ms}ms)`);
console.log(`  ${C.dim}All requests below are sent with NO cookies, NO Authorization header:`);
console.log(`  i.e. as a complete stranger who has never logged in.${C.reset}`);

/* ================================================================== *
 * TEST 1 - API routes, unauthenticated
 * ================================================================== */
head("TEST 1 - Can an anonymous caller read your data through the API?");

const READ_PROBES = [
  ["/api/staff",           "Employee accounts (email, role, names)"],
  ["/api/customers",       "Customer records (name, phone, address)"],
  ["/api/customers/stats", "Customer analytics"],
  ["/api/stocks",          "Product inventory + cost prices"],
  ["/api/expenses",        "Business expenses"],
  ["/api/shops",           "Branch list"],
  ["/api/shops/stats",     "Branch performance stats"],
  ["/api/settings",        "Business settings (tax, currency, loyalty)"],
];

console.log(`\n  ${"GET ENDPOINT".padEnd(24)}${"HTTP".padEnd(7)}${"RECORDS".padEnd(10)}WHAT LEAKS`);
console.log(`  ${"-".repeat(94)}`);
const leaked = [];
for (const [url, what] of READ_PROBES) {
  const r = await req("GET", url);
  const payload = r.json?.data ?? r.json?.settings ?? r.json;
  const count = Array.isArray(payload) ? payload.length : payload && typeof payload === "object" ? "object" : "-";
  const ok200 = r.status === 200 && r.json?.success !== false;
  if (ok200) leaked.push([url, what, count]);
  const statusCol = ok200 ? `${C.red}${r.status}${C.reset}` : `${C.green}${r.status || "ERR"}${C.reset}`;
  console.log(`  ${url.padEnd(24)}${statusCol.padEnd(16)}${String(count).padEnd(10)}${ok200 ? what : C.dim + "blocked/empty" + C.reset}`);
}

sub("Test 1 results");
check(leaked.length === 0,
  "API rejects unauthenticated reads",
  leaked.length ? `${leaked.length}/${READ_PROBES.length} endpoints returned data to an anonymous caller: ${leaked.map(([u]) => u).join(", ")}` : "");

const staffLeak = leaked.find(([u]) => u === "/api/staff");
if (staffLeak) {
  warning("GET /api/staff is the most severe of these",
    `it returned ${staffLeak[2]} employee record(s). Your doc marks "View Staff List" and "View Staff Credentials" as Owner-only, but no login is required at all.`);
}

/* ================================================================== *
 * TEST 2 - Write endpoints, unauthenticated
 * ================================================================== */
head("TEST 2 - Does a write endpoint check WHO is calling before it acts?");
console.log(`  ${C.dim}Both probes are crafted to fail validation, so nothing is written.`);
console.log(`  The question is only: does it answer 401/403, or does it answer with a`);
console.log(`  business-logic error? A business-logic error proves the request got past`);
console.log(`  authorization, because there is none.${C.reset}`);

const w1 = await req("POST", "/api/staff", {
  email: "rbac-probe@example.invalid",
  password: "not-a-real-password",
  displayName: "RBAC Probe",
  role: "__rbac_probe__", // rejected by the role whitelist before any DB write
});
console.log(`\n  POST   /api/staff      -> HTTP ${w1.status}  ${C.dim}${JSON.stringify(w1.json)}${C.reset}`);
check([401, 403].includes(w1.status),
  "POST /api/staff requires authentication",
  ![401, 403].includes(w1.status)
    ? `it answered ${w1.status} "${w1.json?.error}" - that is the payload validator talking, not an auth check. Supply role:"manager" with a valid password and this endpoint creates a manager account for an anonymous caller (staffService.createStaffAccount).`
    : "");

const w2 = await req("DELETE", "/api/expenses");
console.log(`  DELETE /api/expenses   -> HTTP ${w2.status}  ${C.dim}${JSON.stringify(w2.json)}${C.reset}`);
check([401, 403].includes(w2.status),
  "DELETE /api/expenses requires authentication",
  ![401, 403].includes(w2.status)
    ? `it answered ${w2.status} "${w2.json?.error}" - only the id was missing. With an id it deletes, even though your doc restricts Delete Expense to Owner.`
    : "");

/* ================================================================== *
 * TEST 3 - Page guards, as served by the server
 * ================================================================== */
head("TEST 3 - Does the server hand protected pages to a stranger?");
console.log(`  ${C.dim}ProtectedRoute renders a spinner while auth resolves, so a guarded page's`);
console.log(`  HTML contains the spinner and NOT its content. An unguarded page ships its`);
console.log(`  real content straight to anyone. That difference is the test.${C.reset}`);

const SPINNER = /animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600/;
const PAGE_PROBES = [
  ["/owner/requests/refunds",         "Return Requests",            ["owner", "manager"]],
  ["/owner/requests/pending-refunds", "Refund Payment",             ["owner", "manager"]],
  ["/owner/requests/refund-report",   "Online Report",              ["owner", "manager"]],
  ["/owner/requests/cancellations",   "Order Cancellation Requests",["owner", "manager"]],
  ["/owner/staff",                    "Staff Management",           ["owner"]],
  ["/owner/expenses",                 "Expenses",                   ["owner", "manager"]],
];

console.log(`\n  ${"PAGE".padEnd(34)}${"HTTP".padEnd(6)}${"GUARD SPINNER".padEnd(15)}CONTENT SENT TO STRANGER?`);
console.log(`  ${"-".repeat(96)}`);
const pageResults = [];
for (const [url, marker, allowed] of PAGE_PROBES) {
  const r = await req("GET", url);
  const guarded = SPINNER.test(r.text);
  const contentSent = r.text.includes(marker);
  pageResults.push({ url, marker, allowed, guarded, contentSent, status: r.status });
  console.log(`  ${url.padEnd(34)}${String(r.status).padEnd(6)}` +
    `${(guarded ? `${C.green}present${C.reset}` : `${C.red}absent${C.reset}`).padEnd(24)}` +
    `${contentSent ? `${C.red}YES - "${marker}"${C.reset}` : `${C.green}no${C.reset}`}`);
}

sub("Test 3 results");
for (const p of pageResults) {
  check(p.guarded && !p.contentSent,
    `${p.url} withholds content from an anonymous request`,
    p.contentSent
      ? `the HTML already contains "${p.marker}" and no ProtectedRoute spinner. Doc restricts this page to [${p.allowed.join(", ")}], but it is served to a logged-out stranger - so a staff account reaches it too.`
      : "");
}

/* ================================================================== *
 * TEST 4 - Firestore rules, anonymous client
 * ================================================================== */
head("TEST 4 - Firestore rules: the real security boundary");
console.log(`  ${C.dim}Your roles live in a Firestore doc read by the browser, and every guard is`);
console.log(`  client-side. So the only thing that can truly stop a role is Firestore rules.`);
console.log(`  Probing them with the public web config, signed in as nobody.${C.reset}`);

let fsTested = false;
try {
  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getFirestore, collection, getDocs, limit, query } = await import("firebase/firestore");

  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!cfg.projectId) {
    warning("Skipped", "NEXT_PUBLIC_FIREBASE_PROJECT_ID not found in .env.local");
  } else {
    const app = initializeApp(cfg, "rbac-anon-probe");
    const db = getFirestore(app);
    const COLLECTIONS = ["users", "transactions", "stocks", "customers", "expenses", "settings", "shops"];

    console.log(`\n  project: ${cfg.projectId}`);
    console.log(`\n  ${"COLLECTION".padEnd(18)}ANONYMOUS READ`);
    console.log(`  ${"-".repeat(60)}`);
    const readable = [];
    for (const name of COLLECTIONS) {
      try {
        const snap = await getDocs(query(collection(db, name), limit(1)));
        readable.push(name);
        console.log(`  ${name.padEnd(18)}${C.red}ALLOWED${C.reset} ${C.dim}(${snap.size} doc(s) returned)${C.reset}`);
      } catch (e) {
        const denied = /permission|insufficient/i.test(String(e));
        console.log(`  ${name.padEnd(18)}${denied ? `${C.green}DENIED by rules${C.reset}` : `${C.yellow}error: ${String(e.message).slice(0, 50)}${C.reset}`}`);
      }
    }
    fsTested = true;
    sub("Test 4 results");
    check(readable.length === 0,
      "Firestore denies reads to unauthenticated clients",
      readable.length ? `${readable.length} collection(s) readable with no login: ${readable.join(", ")}. With rules this open, RBAC is cosmetic - a staff user can read every collection straight from the browser console regardless of what the UI hides.` : "");
    if (readable.includes("users")) {
      warning("The users collection is readable",
        "that is where role is stored. Anyone can enumerate accounts and their roles.");
    }
    await deleteApp(app);
  }
} catch (e) {
  warning("Firestore probe could not run", String(e.message || e));
}

/* ================================================================== *
 * TEST 5 - Which real accounts exist to test with?
 * ================================================================== */
head("TEST 5 - Accounts available for manual per-role testing");
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    warning("Skipped", "FIREBASE_SERVICE_ACCOUNT_KEY not set");
  } else {
    const mod = await import("firebase-admin");
    const admin = mod.default ?? mod;
    const existing = admin.apps?.find((a) => a && a.name === "rbac-admin-probe");
    const app = existing
      ? existing
      : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) }, "rbac-admin-probe");
    const snap = await admin.firestore(app).collection("users").get();
    const byRole = {};
    snap.forEach((d) => {
      const r = d.data().role || "(none)";
      byRole[r] = byRole[r] || [];
      byRole[r].push(d.data().email || d.id);
    });
    console.log(`\n  ${"ROLE".padEnd(12)}${"COUNT".padEnd(8)}ACCOUNTS`);
    console.log(`  ${"-".repeat(74)}`);
    for (const r of ["owner", "manager", "staff", "customer", "(none)"]) {
      if (!byRole[r]) continue;
      console.log(`  ${r.padEnd(12)}${String(byRole[r].length).padEnd(8)}${byRole[r].slice(0, 3).join(", ")}${byRole[r].length > 3 ? ` +${byRole[r].length - 3} more` : ""}`);
    }
    sub("Test 5 results");
    for (const r of ["owner", "manager", "staff"]) {
      check(!!byRole[r]?.length, `at least one ${r} account exists to test with`,
        byRole[r]?.length ? "" : `no user doc has role "${r}", so this role cannot be exercised end-to-end yet`);
    }
  }
} catch (e) {
  warning("Admin probe could not run", String(e.message || e).slice(0, 160));
}

/* ================================================================== */
head("SUMMARY");
console.log(`  ${C.green}PASS${C.reset}  ${pass}`);
console.log(`  ${C.red}FAIL${C.reset}  ${fail}`);
console.log(`  ${C.yellow}WARN${C.reset}  ${warn}`);
if (failures.length) {
  console.log(`\n${C.bold}${C.red}Failing checks${C.reset}`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log(`\n  ${C.dim}Static counterpart: npm run rbac:audit${C.reset}\n`);
process.exit(fail ? 1 : 0);
