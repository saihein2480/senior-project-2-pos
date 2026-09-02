/**
 * TEMPORARY check: reproduce the rapid-click stock bug against the OLD queue,
 * then confirm the NEW drain-once queue applies each movement exactly once.
 */

// ---- OLD behaviour: state queue drained by an effect that re-runs -----------
async function oldQueue(clicks) {
  let queue = [];
  const applied = [];
  let effectRunning = false;

  const runEffect = async () => {
    // Mirrors: if (queue.length && callbacks) { await Promise.all(map); queue=[] }
    if (queue.length === 0) return;
    const batch = [...queue]; // processes everything currently queued
    effectRunning = true;
    for (const u of batch) {
      await Promise.resolve();
      applied.push(u);
    }
    effectRunning = false;
    queue = [];
  };

  for (const u of clicks) {
    queue = [...queue, u];
    // Effect re-runs on every queue change, even while a drain is in flight.
    const p = runEffect();
    if (!effectRunning) await p;
  }

  await new Promise((r) => setTimeout(r, 10));
  return applied;
}

// ---- NEW behaviour: ref queue, shift-before-apply, single drain -------------
async function newQueue(clicks) {
  const queue = [];
  const applied = [];
  let draining = false;

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const u = queue.shift();
        await Promise.resolve();
        applied.push(u);
      }
    } finally {
      draining = false;
    }
  };

  for (const u of clicks) {
    queue.push(u);
    void drain();
  }

  await new Promise((r) => setTimeout(r, 10));
  return applied;
}

function netStock(applied) {
  return applied.reduce(
    (sum, u) => sum + (u.type === "reduce" ? -u.quantity : u.quantity),
    0,
  );
}

(async () => {
  // Cashier adds one (reduce 1), then decrements twice quickly (restore 1 each).
  const clicks = [
    { type: "reduce", quantity: 1 },
    { type: "restore", quantity: 1 },
    { type: "restore", quantity: 1 },
  ];

  const before = await oldQueue(clicks);
  const after = await newQueue(clicks);

  console.log(
    `OLD: ${before.length} movements applied (expected ${clicks.length}), net stock ${netStock(before)}`,
  );
  console.log(
    `NEW: ${after.length} movements applied (expected ${clicks.length}), net stock ${netStock(after)}`,
  );

  const expectedNet = netStock(clicks); // +1
  const checks = [
    ["old queue duplicates movements", before.length > clicks.length],
    ["new queue applies each once", after.length === clicks.length],
    ["new queue net stock correct", netStock(after) === expectedNet],
    [
      "new queue preserves order",
      after.map((u) => u.type).join(",") ===
        clicks.map((u) => u.type).join(","),
    ],
  ];

  let failed = 0;
  console.log("");
  checks.forEach(([name, ok]) => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  });

  console.log(
    `\n${failed === 0 ? "Regression reproduced and fixed." : `${failed} check(s) FAILED.`}`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
