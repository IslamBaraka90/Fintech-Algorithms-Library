/**
 * Demo 3 — Corporate actions (archetype: record-transform)
 *
 * Shape: (input: TInput) -> TOutput
 * One object in, one object out. This is the largest family in the library
 * (79 of 114 topics), covering splits, dividends, mergers and identity changes.
 *
 * Run: npm run build && node --experimental-strip-types demos/03-corporate-actions.ts
 */

import { calculate as backwardSplitAdjust } from "fintech-algorithms/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment";

console.log("\n=== Demo 3 — corporate actions ==========================\n");

// A 2-for-1 split occurring at index 2 of the series. Everything strictly before
// the event is restated onto the post-split basis; the event bar onward is left
// untouched, which is what makes the adjusted series continuous.
const result = backwardSplitAdjust({
  prices: [120, 123, 60, 62],
  volumes: [1000, 1200, 2400, 2000],
  eventIndex: 2,
  postSplitSharesPerPreSplitShare: 2,
});

console.log("2-for-1 split at index 2\n");
console.log("  idx   raw px   adj px    raw vol   adj vol   restated");
for (let i = 0; i < result.adjustedPrices.length; i++) {
  const restated = i < 2 ? "yes" : "no";
  console.log(
    `  ${String(i).padStart(3)} ${String([120, 123, 60, 62][i]).padStart(8)} ` +
      `${String(result.adjustedPrices[i]).padStart(8)} ` +
      `${String([1000, 1200, 2400, 2000][i]).padStart(10)} ` +
      `${String(result.adjustedVolumes[i]).padStart(9)}   ${restated}`,
  );
}

console.log(`\n  ratio convention: ${result.ratioConvention}`);
console.log(
  "  The convention is returned with the result on purpose — a split ratio is\n" +
    "  ambiguous unless the direction is stated, and silent disagreement here is\n" +
    "  a classic source of wrong backtests.\n",
);

// Every implementation validates its input and throws rather than returning a
// quietly wrong number.
try {
  backwardSplitAdjust({
    prices: [120, 123, 60, 62],
    volumes: [1000, 1200, 2400, 2000],
    eventIndex: 2,
    postSplitSharesPerPreSplitShare: 0, // invalid: must be positive
  });
  console.log("  ERROR: expected a validation failure but none was raised");
} catch (error) {
  console.log(`  validation works: ${(error as Error).message}`);
}
console.log("");
