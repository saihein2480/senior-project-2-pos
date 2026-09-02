/**
 * TEMPORARY check: demonstrate the lost-update bug in the OLD stock writer
 * (absolute array rebuilt from a stale React snapshot) versus the NEW relative
 * write applied against freshly-read data (what a Firestore transaction gives).
 */

// Database holds 8 units of the variant.
const START = 8;

// OLD: each call captures `clothingInventory` at the time its useCallback was
// created. Two clicks in the same tick share the same snapshot, and each writes
// an ABSOLUTE value.
async function oldWriter(deltas) {
  let dbQuantity = START;
  const snapshotQuantity = START; // both callbacks closed over the same value

  await Promise.all(
    deltas.map(async (delta) => {
      await Promise.resolve(); // interleave
      // Absolute write computed from the stale snapshot.
      dbQuantity = Math.max(0, snapshotQuantity + delta);
    }),
  );

  return dbQuantity;
}

// NEW: each call re-reads current data, applies the delta, writes. A Firestore
// transaction serialises these and retries on contention, so model them as
// strictly sequential reads of the live value.
async function newWriter(deltas) {
  let dbQuantity = START;
  let lock = Promise.resolve();

  const runExclusive = (fn) => {
    const next = lock.then(fn, fn);
    lock = next.catch(() => {});
    return next;
  };

  await Promise.all(
    deltas.map((delta) =>
      runExclusive(async () => {
        const current = dbQuantity; // fresh read inside the transaction
        await Promise.resolve();
        dbQuantity = Math.max(0, current + delta);
      }),
    ),
  );

  return dbQuantity;
}

(async () => {
  // Cashier decrements quantity twice quickly -> two restores of 1 unit each.
  const deltas = [+1, +1];
  const expected = START + 2; // 10

  const oldResult = await oldWriter(deltas);
  const newResult = await newWriter(deltas);

  console.log(`start=${START}, movements=${JSON.stringify(deltas)}`);
  console.log(`OLD writer -> ${oldResult} (expected ${expected})`);
  console.log(`NEW writer -> ${newResult} (expected ${expected})`);

  // And the reverse: two reductions must not be lost either.
  const reduceDeltas = [-1, -1];
  const expectedReduce = START - 2;
  const oldReduce = await oldWriter(reduceDeltas);
  const newReduce = await newWriter(reduceDeltas);
  console.log("");
  console.log(`movements=${JSON.stringify(reduceDeltas)}`);
  console.log(`OLD writer -> ${oldReduce} (expected ${expectedReduce})`);
  console.log(`NEW writer -> ${newReduce} (expected ${expectedReduce})`);

  const checks = [
    ["old writer loses a restore", oldResult !== expected],
    ["new writer applies both restores", newResult === expected],
    ["old writer loses a reduction", oldReduce !== expectedReduce],
    ["new writer applies both reductions", newReduce === expectedReduce],
  ];

  let failed = 0;
  console.log("");
  checks.forEach(([name, ok]) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  });

  console.log(
    `\n${failed === 0 ? "Lost update reproduced and fixed." : `${failed} check(s) FAILED.`}`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
