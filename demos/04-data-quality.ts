/**
 * Demo 4 — Data quality (archetype: row-classify)
 *
 * Shape: (rows: TRow[], config?) -> Verdict[]
 * Returns a verdict per row rather than throwing, so one bad bar in a million
 * does not abort the batch — you decide what to quarantine.
 *
 * Run: npm run build && node --experimental-strip-types demos/04-data-quality.ts
 */

import { validateBars } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

console.log("\n=== Demo 4 — data quality ===============================\n");

// Row 2 is inconsistent on purpose: its high is below its open.
const bars = [
  { timestamp: "2026-01-05T14:30:00.000Z", open: 100.0, high: 101.5, low: 99.5, close: 101.0, volume: 1000, symbol: "ACME" },
  { timestamp: "2026-01-05T14:31:00.000Z", open: 101.0, high: 100.2, low: 99.0, close: 99.5, volume: 1500, symbol: "ACME" },
  { timestamp: "2026-01-05T14:32:00.000Z", open: 99.5, high: 100.0, low: 98.75, close: 99.0, volume: 900, symbol: "ACME" },
];

const verdicts = validateBars(bars, { tickSize: 0.01, toleranceTicks: 1 });

let bad = 0;
for (const v of verdicts) {
  const mark = v.valid ? "ok  " : "FAIL";
  if (!v.valid) bad++;
  console.log(`  [${mark}] row ${v.index}  ${v.timestamp}`);
  for (const issue of v.issues) console.log(`         ↳ ${issue}`);
}

console.log(`\n  ${verdicts.length - bad}/${verdicts.length} bars passed, ${bad} flagged.`);
console.log(
  "\n  Nothing threw — every row got a verdict. Feed `verdicts` into your own\n" +
    "  quarantine/alerting policy instead of letting a bad tick poison a series.\n",
);
