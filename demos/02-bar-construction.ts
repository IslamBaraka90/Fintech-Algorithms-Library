/**
 * Demo 2 — Bar construction (archetype: tape-aggregate)
 *
 * Shape: (trades: Trade[], config) -> Bar[]
 *
 * The same trade tape drives two different sampling schemes. Time bars close on
 * the clock; volume bars close on traded size. Swapping the sampling scheme is a
 * one-line change because both speak the same `Trade` contract.
 *
 * Run: npm run build && node --experimental-strip-types demos/02-bar-construction.ts
 */

import { constructBars as timeBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { constructBars as volumeBars } from "fintech-algorithms/market-data-engineering/bar-construction/volume-bars";

// The Trade contract: plain objects, ISO-8601 UTC timestamps, explicit session.
const tape = [
  { tradeId: "T1", timestamp: "2026-01-05T14:30:00.000Z", session: "S1", symbol: "ACME", price: 100.0, volume: 400, currency: "USD" },
  { tradeId: "T2", timestamp: "2026-01-05T14:30:41.000Z", session: "S1", symbol: "ACME", price: 101.5, volume: 250, currency: "USD" },
  { tradeId: "T3", timestamp: "2026-01-05T14:31:02.000Z", session: "S1", symbol: "ACME", price: 100.75, volume: 600, currency: "USD" },
  { tradeId: "T4", timestamp: "2026-01-05T14:31:48.000Z", session: "S1", symbol: "ACME", price: 99.25, volume: 150, currency: "USD" },
  { tradeId: "T5", timestamp: "2026-01-05T14:32:10.000Z", session: "S1", symbol: "ACME", price: 99.8, volume: 900, currency: "USD" },
  { tradeId: "T6", timestamp: "2026-01-05T14:33:05.000Z", session: "S1", symbol: "ACME", price: 102.4, volume: 300, currency: "USD" },
];

console.log("\n=== Demo 2 — bar construction ===========================\n");
console.log(`input: ${tape.length} trades, ${tape.reduce((s, t) => s + t.volume, 0)} shares\n`);

const byTime = timeBars(tape, {
  intervalSeconds: 60,
  sessionStarts: { S1: "2026-01-05T14:30:00.000Z" },
  emptyBarPolicy: "omit",
  closePartial: true,
});

console.log(`Time bars (60s): ${byTime.length}`);
for (const bar of byTime) {
  console.log(
    `  ${bar.startTime}  O ${bar.open}  H ${bar.high}  L ${bar.low}  C ${bar.close}` +
      `  vol ${bar.volume}  ticks ${bar.tickCount}  (${bar.closeReason})`,
  );
}

const byVolume = volumeBars(tape, { targetVolume: 800, closePartial: true });

console.log(`\nVolume bars (target 800 shares): ${byVolume.length}`);
for (const bar of byVolume) {
  console.log(
    `  O ${bar.open}  H ${bar.high}  L ${bar.low}  C ${bar.close}` +
      `  vol ${bar.volume}  (${bar.closeReason})`,
  );
}

console.log(
  "\n  Note: the last bar of each series closes with a partial reason because\n" +
    "  closePartial: true. Set it to false to drop incomplete bars instead.\n",
);
