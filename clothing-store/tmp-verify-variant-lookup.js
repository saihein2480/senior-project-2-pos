/**
 * TEMPORARY check: does findVariantIndex resolve the identifiers the UI actually
 * produces, including the reported failure (cv1-<stockId> against a stored
 * variant that has no id)?
 */

const normalize = (v) => (v || "").trim().toLowerCase();

function findVariantIndex(variants, colorId, stockId) {
  const exact = variants.findIndex((v) => v.id === colorId);
  if (exact !== -1) return exact;

  const synthetic = variants.findIndex(
    (_v, index) => `cv${index + 1}-${stockId}` === colorId,
  );
  if (synthetic !== -1) return synthetic;

  return variants.findIndex((v) => normalize(v.color) === normalize(colorId));
}

const STOCK_ID = "NqcReSJpkvUe1CTP7LmJ";

const cases = [
  {
    name: "reported failure: synthetic id, stored variant has no id",
    variants: [
      { color: "Gainsboro", sizeQuantities: [{ size: "M", quantity: 5 }] },
    ],
    colorId: `cv1-${STOCK_ID}`,
    expected: 0,
  },
  {
    name: "synthetic id resolves to the right index (second variant)",
    variants: [
      { color: "Red", sizeQuantities: [] },
      { color: "Blue", sizeQuantities: [] },
    ],
    colorId: `cv2-${STOCK_ID}`,
    expected: 1,
  },
  {
    name: "real stored id still matches exactly",
    variants: [
      { id: "abc123", color: "Red", sizeQuantities: [] },
      { id: "def456", color: "Blue", sizeQuantities: [] },
    ],
    colorId: "def456",
    expected: 1,
  },
  {
    name: "exact id wins over a colliding synthetic position",
    variants: [
      { id: `cv2-${STOCK_ID}`, color: "Red", sizeQuantities: [] },
      { id: "other", color: "Blue", sizeQuantities: [] },
    ],
    colorId: `cv2-${STOCK_ID}`,
    expected: 0,
  },
  {
    name: "falls back to colour name",
    variants: [
      { id: "x1", color: "Red", sizeQuantities: [] },
      { id: "x2", color: "Pine Cone", sizeQuantities: [] },
    ],
    colorId: "pine cone",
    expected: 1,
  },
  {
    name: "genuinely missing variant reports -1",
    variants: [{ id: "x1", color: "Red", sizeQuantities: [] }],
    colorId: "nope",
    expected: -1,
  },
];

// Size matching must tolerate case/whitespace differences.
const sizeCases = [
  { stored: "M", asked: "M", ok: true },
  { stored: "m", asked: "M", ok: true },
  { stored: " M ", asked: "M", ok: true },
  { stored: "L", asked: "M", ok: false },
];

let failed = 0;

cases.forEach((c) => {
  const got = findVariantIndex(c.variants, c.colorId, STOCK_ID);
  const ok = got === c.expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name} (expected ${c.expected}, got ${got})`,
  );
});

console.log("");
sizeCases.forEach((c) => {
  const matches = normalize(c.stored) === normalize(c.asked);
  const ok = matches === c.ok;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  size "${c.stored}" vs "${c.asked}" -> ${matches}`,
  );
});

console.log(
  `\n${failed === 0 ? "Variant and size resolution correct." : `${failed} check(s) FAILED.`}`,
);
process.exit(failed === 0 ? 0 : 1);
