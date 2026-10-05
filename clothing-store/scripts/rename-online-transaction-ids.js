/**
 * Give already-recorded online QR (MyanMyanPay) sales the receipt number new
 * ones get: `TXN-<online order id>`, e.g. TXN-ONL-1790263939253-QY5O0V.
 *
 * Before this format, the storefront named the sale after the gateway
 * reference: `TEST-ONL-...` for sandbox payments, MyanMyanPay's own reference
 * for live ones.
 *
 * Only the `transactionId` field (the number every screen shows and searches)
 * changes. The document id stays, so points history, coupon usage,
 * notifications and refund records that point at the document keep working.
 * The old number is kept in `previousTransactionId`.
 *
 * COD sales are left alone: they already use TXN-<13-digit counter>.
 *
 * Usage (from clothing-store/):
 *   node scripts/rename-online-transaction-ids.js           # dry run, lists changes
 *   node scripts/rename-online-transaction-ids.js --apply   # writes them
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

// Read FIREBASE_SERVICE_ACCOUNT_KEY from .env.local, like the other scripts.
const envPath = path.resolve(__dirname, "../.env.local");
const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
let serviceAccountKey = null;
for (const line of envLines) {
  if (line.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY=")) {
    serviceAccountKey = line.substring("FIREBASE_SERVICE_ACCOUNT_KEY=".length).trim();
    break;
  }
}
if (!serviceAccountKey) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local");
  process.exit(1);
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
  });
}
const db = admin.firestore();

/** Online order ids never contain "/" (they are document ids). */
function isUsableOrderId(value) {
  return typeof value === "string" && value.trim() !== "" && !value.includes("/");
}

async function main() {
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: dry run (no writes)\n");

  // Single-field equality, so no composite index is needed.
  const snap = await db.collection("transactions").where("source", "==", "online").get();

  // QR sales grouped by the online order they belong to.
  const salesByOrder = new Map();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const isQrSale =
      String(data.paymentProvider || "").toUpperCase() === "MMPAY" &&
      String(data.paymentMethod || "").toLowerCase() !== "cod";
    if (!isQrSale || !isUsableOrderId(data.onlineOrderId)) continue;

    const orderId = data.onlineOrderId.trim();
    if (!salesByOrder.has(orderId)) salesByOrder.set(orderId, []);
    salesByOrder.get(orderId).push({ doc, data });
  }

  const changes = [];
  const duplicates = [];
  for (const [orderId, sales] of salesByOrder) {
    // An order should have one sale. Two would end up with the same receipt
    // number, so they are reported for a person to resolve instead.
    if (sales.length > 1) {
      duplicates.push({ orderId, sales });
      continue;
    }

    const { doc, data } = sales[0];
    const target = `TXN-${orderId}`;
    const current = data.transactionId ? String(data.transactionId) : doc.id;
    if (current === target) continue;

    changes.push({ ref: doc.ref, docId: doc.id, from: current, to: target });
  }

  console.log(`Online sales checked: ${snap.size}`);
  console.log(`To rename:            ${changes.length}`);
  console.log(`Skipped (duplicates): ${duplicates.length} order(s)\n`);
  for (const change of changes) {
    console.log(`  ${change.from}  ->  ${change.to}${change.docId !== change.from ? `   (doc ${change.docId})` : ""}`);
  }

  if (duplicates.length > 0) {
    console.log("\nOrders with more than one sale (not renamed, review these):");
    for (const { orderId, sales } of duplicates) {
      console.log(`  ${orderId}`);
      for (const { doc, data } of sales) {
        const vendor = (data.paymentMeta && data.paymentMeta.vendor) || "-";
        console.log(`    - ${data.transactionId || doc.id}  total ${data.total}  vendor ${vendor}`);
      }
    }
  }

  if (!APPLY) {
    if (changes.length > 0) {
      console.log("\nDry run only. Re-run with --apply to write these changes.");
    }
    return;
  }

  // Batches of up to 500 writes.
  for (let i = 0; i < changes.length; i += 500) {
    const batch = db.batch();
    for (const change of changes.slice(i, i + 500)) {
      batch.update(change.ref, {
        transactionId: change.to,
        previousTransactionId: change.from,
        transactionIdRenamedAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }
  console.log(`\nRenamed ${changes.length} sale(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed:", error.message);
    process.exit(1);
  });
