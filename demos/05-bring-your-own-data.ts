/**
 * Demo 5 — Bring your own data provider
 *
 * This library ships NO provider client. No Yahoo, no Polygon, no exchange SDK,
 * no `node:fs`. Every algorithm takes plain arrays and plain objects, so it runs
 * unchanged in Node, the browser, a Worker, Deno or Bun.
 *
 * Integrating a provider is therefore not a library feature — it is a small
 * mapping function that you own, of the kind shown below. When your vendor
 * changes their API, you edit one adapter; the algorithms never move.
 *
 * Run: npm run build && node --experimental-strip-types demos/05-bring-your-own-data.ts
 */

import { constructBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";

console.log("\n=== Demo 5 — bring your own data ========================\n");

// ---------------------------------------------------------------------------
// The contract the library speaks
// ---------------------------------------------------------------------------

interface Trade {
  tradeId: string;
  timestamp: string; // ISO-8601 UTC
  session: string;
  symbol: string;
  price: number;
  volume: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Provider A — a REST tick endpoint returning epoch millis and snake_case keys
// ---------------------------------------------------------------------------

const providerAResponse = {
  results: [
    { id: "a1", t: 1767623400000, p: 100.0, s: 400, sym: "ACME" },
    { id: "a2", t: 1767623441000, p: 101.5, s: 250, sym: "ACME" },
    { id: "a3", t: 1767623462000, p: 100.75, s: 600, sym: "ACME" },
  ],
};

const fromProviderA = (payload: typeof providerAResponse): Trade[] =>
  payload.results.map((r) => ({
    tradeId: r.id,
    timestamp: new Date(r.t).toISOString(),
    session: "S1",
    symbol: r.sym,
    price: r.p,
    volume: r.s,
    currency: "USD",
  }));

// ---------------------------------------------------------------------------
// Provider B — CSV rows, everything a string
// ---------------------------------------------------------------------------

const providerBCsv = [
  "trade_id,ts,symbol,px,qty",
  "b1,2026-01-05T14:31:48Z,ACME,99.25,150",
  "b2,2026-01-05T14:32:10Z,ACME,99.80,900",
].join("\n");

const fromProviderB = (csv: string): Trade[] => {
  const [header, ...rows] = csv.trim().split("\n");
  const cols = header.split(",");
  return rows.map((row) => {
    const cells = row.split(",");
    const get = (name: string) => cells[cols.indexOf(name)];
    return {
      tradeId: get("trade_id"),
      timestamp: new Date(get("ts")).toISOString(),
      session: "S1",
      symbol: get("symbol"),
      price: Number(get("px")),
      volume: Number(get("qty")),
      currency: "USD",
    };
  });
};

// ---------------------------------------------------------------------------
// Both adapters feed the identical pipeline
// ---------------------------------------------------------------------------

const tape: Trade[] = [...fromProviderA(providerAResponse), ...fromProviderB(providerBCsv)].sort(
  (a, b) => a.timestamp.localeCompare(b.timestamp),
);

console.log(`merged ${tape.length} trades from 2 unrelated providers:\n`);
for (const t of tape) {
  console.log(`  ${t.tradeId.padEnd(3)} ${t.timestamp}  ${String(t.price).padStart(7)} x ${t.volume}`);
}

const bars = constructBars(tape, {
  intervalSeconds: 60,
  sessionStarts: { S1: "2026-01-05T14:30:00.000Z" },
  emptyBarPolicy: "omit",
  closePartial: true,
});

console.log(`\n${bars.length} time bars built from the merged tape:`);
for (const bar of bars) {
  console.log(`  ${bar.startTime}  O ${bar.open}  C ${bar.close}  vol ${bar.volume}`);
}

// Chain straight into an indicator — bar closes are just numbers.
const ema = calculateEma(bars.map((b) => b.close), 2);
console.log(`\nEMA(2) over those closes: ${JSON.stringify(ema)}`);

console.log(
  "\n  Neither adapter is part of the library, and neither algorithm knows a\n" +
    "  provider exists. That boundary is the whole design.\n",
);
