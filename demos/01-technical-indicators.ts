/**
 * Demo 1 — Technical indicators (archetype: series-transform)
 *
 * Shape: (values: number[], ...params) -> (number | null)[]
 * `null` marks a warm-up observation where the indicator is not yet defined.
 *
 * Run: npm run build && node --experimental-strip-types demos/01-technical-indicators.ts
 */

import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";
import { macd } from "fintech-algorithms/technical-indicators/trend-systems/macd";

// A plain array of closes. Where it came from is none of the library's business.
const closes = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
  45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
  46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45,
  45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66,
];

console.log("\n=== Demo 1 — technical indicators =======================\n");
console.log(`input: ${closes.length} closes\n`);

const sma5 = calculateSma(closes, 5);
const ema5 = calculateEma(closes, 5);

console.log("SMA(5) vs EMA(5) — first 10 observations");
console.log("  idx  close    SMA(5)    EMA(5)");
for (let i = 0; i < 10; i++) {
  const fmt = (v: number | null) => (v === null ? "  warming" : v.toFixed(4).padStart(9));
  console.log(`  ${String(i + 1).padStart(3)}  ${closes[i].toFixed(2).padStart(6)} ${fmt(sma5[i])} ${fmt(ema5[i])}`);
}

// Both are SMA-seeded, so the first defined value appears at observation `window`.
const firstSma = sma5.findIndex((v) => v !== null);
const firstEma = ema5.findIndex((v) => v !== null);
console.log(`\n  first defined SMA at observation ${firstSma + 1}, EMA at ${firstEma + 1}`);

// MACD returns rows, not a bare series — fast EMA - slow EMA, plus signal + histogram.
const points = macd(closes, 12, 26, 9);
const ready = points.filter((p) => p.macd !== null);
console.log(`\nMACD(12,26,9): ${points.length} rows, ${ready.length} with a defined MACD line`);
const last = points.at(-1);
if (last) {
  console.log("  last row:", {
    macd: last.macd === null ? null : Number(last.macd.toFixed(6)),
    signal: last.signal === null ? null : Number(last.signal.toFixed(6)),
    histogram: last.histogram === null ? null : Number(last.histogram.toFixed(6)),
    status: last.status,
  });
}
console.log("");
