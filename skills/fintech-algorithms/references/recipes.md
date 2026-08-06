# Recipes

End-to-end tasks. Every output shown was produced by running the code against
`fintech-algorithms@0.12.0`.

---

## 1. Find the right topic when you are not sure it exists

Always do this before writing an import. Guessing a subpath produces something
that looks right and is wrong.

```bash
node "${SKILL_DIR}/scripts/lookup.mjs" search "average true range"
node "${SKILL_DIR}/scripts/lookup.mjs" show atr          # full contract + executed example
```

If nothing matches, the library does not cover it. Name the closest topic that
does exist, say how it differs, and do not substitute it silently.

```bash
node "${SKILL_DIR}/scripts/lookup.mjs" domain D07        # browse a whole domain
node "${SKILL_DIR}/scripts/lookup.mjs" domains           # the thirteen, with index URLs
```

---

## 2. Multi-indicator snapshot from provider bars

The most common request: *"analyse SYMBOL for me."*

```js
import { validateBars }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";
import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";
import { rsi } from "fintech-algorithms/technical-indicators/momentum/rsi";
import { averageTrueRange } from "fintech-algorithms/technical-indicators/volatility-and-channels/atr";
import { bollingerBands } from "fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bands";

// bars: Bar[] from your adapter — see references/ingestion.md
const verdicts = validateBars(bars, { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 });
const clean = bars.filter((_, i) => verdicts[i].valid);
const rejected = verdicts.filter((v) => !v.valid);

// One pass over the same array, so every column stays aligned.
const close = clean.map((b) => b.close);
const high  = clean.map((b) => b.high);
const low   = clean.map((b) => b.low);

const sma20 = calculateSma(close, 20);
const ema12 = calculateEma(close, 12);
const { rsi: rsi14 } = rsi(close, 14);
const atr = averageTrueRange(high, low, close, 14);
const bb  = bollingerBands(close, 20, 2);

const i = clean.length - 1;
const report = {
  asOf: clean[i].timestamp,
  barsIn: bars.length,
  barsUsed: clean.length,
  rejected: rejected.map((v) => ({ ts: v.timestamp, issues: v.issues })),
  close: close[i],
  sma20: sma20[i],
  ema12: ema12[i],
  rsi14: rsi14[i],
  atr14: atr.atr[i],
  bb: { upper: bb.upper[i], middle: bb.middle[i], lower: bb.lower[i], percent_b: bb.percent_b[i] },
};
```

Executed output, 60 synthetic daily bars with one deliberately corrupted:

```json
{
 "asOf": "2026-06-29T00:00:00.000Z",
 "barsIn": 60,
 "barsUsed": 59,
 "rejected": [{ "ts": "2026-05-18T00:00:00.000Z",
                "issues": ["HIGH_BELOW_LOW", "HIGH_BELOW_BODY"] }],
 "close": 106.47,
 "sma20": 110.73550000000004,
 "ema12": 109.26093812210355,
 "rsi14": 39.336224865125274,
 "atr14": 1.7343294190600809,
 "bb": { "upper": 114.82630664417175, "middle": 110.73549999999997,
         "lower": 106.6446933558282, "percent_b": -0.021351944863622976 }
}
```

**How to report this to a person.** State the observation, the input, the tier,
and stop:

> As of 2026-06-29, close 106.47. RSI(14) is 39.3; price is at the lower
> Bollinger band (%B = −0.02, i.e. marginally below it) with SMA(20) at 110.74.
> ATR(14) is 1.73. Computed on 59 bars — one was rejected by the OHLC validator
> for `HIGH_BELOW_LOW`. All five are `verified` tier.
>
> These are measurements of the series, not a view on what happens next, and not
> a recommendation.

Note `percent_b` — snake_case. `bb.percentB` would be `undefined`, and
`undefined < 0` is `false`, so a threshold check would silently never fire.

---

## 3. Raw tick tape → bars → volatility

When the user has trades rather than bars.

```js
import { constructBars }
  from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { averageTrueRange }
  from "fintech-algorithms/technical-indicators/volatility-and-channels/atr";

const trades = ticks
  .map((t) => ({
    tradeId: String(t.id),
    timestamp: new Date(t.ts).toISOString(),
    session: "RTH",
    symbol: t.symbol,
    price: Number(t.price),      // venues send strings
    volume: Number(t.size),
    currency: "USD",
  }))
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp));   // required

const bars = constructBars(trades, {
  intervalSeconds: 300,
  sessionStarts: { RTH: "2026-01-05T14:30:00.000Z" },
  closePartial: true,
  emptyBarPolicy: "omit",
});

// Drop the forming bar before computing anything conclusive.
const closed = bars.filter((b) => b.closeReason === "interval");

const atr = averageTrueRange(
  closed.map((b) => b.high),
  closed.map((b) => b.low),
  closed.map((b) => b.close),
  14,
);
```

Choosing the bar type matters more than the indicator that follows. Time bars
sample the clock; volume and dollar bars sample activity and are steadier when
liquidity varies through the session. All seven are in
`node "${SKILL_DIR}/scripts/lookup.mjs" archetype tape-aggregate`.

---

## 4. Data-quality gate before any analysis

Run this first when the user says the numbers "look odd", or before any study
whose conclusion depends on the input being clean.

```js
import { hampelFilter }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter";

const flagged = hampelFilter(close, {
  windowRadius: 3, threshold: 3, scale: 1.4826,
  minHistory: 3, mode: "causal",     // causal = no look-ahead
});

const spikes = flagged.filter((r) => r.flagged);
```

Executed on `[100, 100.1, 99.9, 100, 100.1, 112, 100.05]`, index 5 is flagged
with a `score` far above `threshold`, and `suggestedReplacement` carries the
median-based substitute. Each record also has `status`
(`insufficient_history` → `eligible`) and `lookaheadUsed`.

`mode: "centred"` is more accurate but uses future points — fine for a
historical clean, invalid for anything that must be reproducible in real time.

Other guards: OHLC validator, stale-quote detector, duplicate-trade resolver,
crossed/locked market detector, price-source consensus check. Full mapping in
`references/ingestion.md`.

---

## 5. A moving-average crossover, aligned correctly

The classic request, and the classic way to get it wrong.

```js
const fast = calculateEma(close, 12);
const slow = calculateEma(close, 26);

// Both arrays are input-length. The first index where BOTH are defined:
const start = Math.max(
  fast.findIndex((v) => v !== null),
  slow.findIndex((v) => v !== null),
);

const crossings = [];
for (let i = start + 1; i < close.length; i++) {
  const wasBelow = fast[i - 1] <= slow[i - 1];
  const isAbove  = fast[i] > slow[i];
  if (wasBelow && isAbove) crossings.push({ index: i, timestamp: bars[i].timestamp, kind: "fast_above_slow" });
  if (!wasBelow && !isAbove) crossings.push({ index: i, timestamp: bars[i].timestamp, kind: "fast_below_slow" });
}
```

Three things this gets right that a naive version does not: it starts after both
warm-ups instead of comparing against `null` (`null <= null` is `true`, which
manufactures a crossing at index 0); it indexes `bars[i]` directly because the
output is input-aligned; and it never filters the nulls out, which would shift
every timestamp.

For MACD, remember the signal line is defined `signal - 1` bars later than the
MACD line — use the row's `status` field rather than assuming both are ready.

**Framing:** a crossing is an observation about two averages of the same series.
It is not a prediction and not a signal to act on.

---

## 6. Registry-driven: run a topic by catalog id

For playgrounds, batch jobs and "show me every topic in this family". Prefer a
direct subpath import when the algorithm is known at build time.

```js
import { topics, byArchetype, byFamily, runner } from "fintech-algorithms";

topics.length;                       // 324
byArchetype("series-transform").length;   // 37
byFamily("D07-F01").map((t) => t.slug);
// → ["sma","ema","wma","wilder-rma","dema","tema","hull-ma","kama","mama"]

const fn = await runner("D07-F01-A01");   // SMA
fn([1, 2, 3, 4], 2);                      // → [null, 1.5, 2.5, 3.5]
```

`topic(id)` returns the metadata record — `entry`, `exports`, `path`,
`archetype`, `articleUrl` — which is how you discover an entry-point name
without guessing it.

---

## 7. Comparing several symbols

There is no multi-symbol API — the functions are pure and single-series. Loop,
and keep each symbol's arrays built from its own bars.

```js
const results = await Promise.all(symbols.map(async (symbol) => {
  const bars = await loadBars(symbol);                    // yours
  const verdicts = validateBars(bars, validatorConfig);
  const clean = bars.filter((_, i) => verdicts[i].valid);
  const close = clean.map((b) => b.close);
  const { rsi: r } = rsi(close, 14);
  return {
    symbol,
    asOf: clean.at(-1).timestamp,
    rsi14: r.at(-1),
    barsUsed: clean.length,
    barsDropped: bars.length - clean.length,
  };
}));
```

Never concatenate two symbols' closes into one array. Every series transform
assumes a single continuous series, and the join point produces a fabricated
return that propagates through the whole window.

For breadth across a universe — advance/decline, McClellan, high-low — use the
Market Breadth domain (28 topics), which is built for exactly this:
`node "${SKILL_DIR}/scripts/lookup.mjs" domain D04`.
