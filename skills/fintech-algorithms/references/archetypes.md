# The five input shapes

Every one of the 675 topics belongs to exactly one archetype. The archetype is
printed on every index line and in `lookup.mjs` output. **Filter on it before
fetching anything** — it decides how much adapter code the task needs.

Every input and output on this page was executed against `fintech-algorithms@0.12.0`.

| Archetype | Topics | First argument | Returns |
|---|---|---|---|
| `record-transform` | 257 | domain-specific | domain-specific |
| `series-transform` | 37 | `(number \| null)[]` | same-length array |
| `row-classify` | 17 | array of rows | one verdict per row |
| `tape-aggregate` | 7 | `Trade[]` | `Bar[]` |
| `snapshot-evaluate` | 6 | one snapshot | one verdict |

---

## series-transform — 37 topics

The indicator shape. Takes a bare numeric array plus numeric parameters, returns
an array of **the same length**, aligned index-for-index with the input.

```js
import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";

const close = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42];
calculateSma(close, 5);
// → [null, null, null, null, 44.104, 44.202, 44.404, 44.658]
```

Some return a bare array (`calculateSma`, `calculateEma`); others return a
**record of parallel series**, each the same length:

```js
import { bollingerBands } from "fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bands";

const b = bollingerBands(close20, 20, 2);
Object.keys(b);   // → ["middle", "stddev", "upper", "lower", "percent_b"]
b.middle[19];     // → 45.409
b.percent_b[19];  // → 0.5676892045355136   ← snake_case, not percentB
```

And a few return an **array of row objects**:

```js
import { macd } from "fintech-algorithms/technical-indicators/trend-systems/macd";

macd(close, 12, 26, 9)[25];
// → { index: 25, value: 45.35, fastEma: 45.842…, slowEma: 45.535…,
//      macd: 0.3066…, signal: null, histogram: null, status: "warming_signal" }
```

Three different return shapes inside one archetype. **Read the topic's captured
example output** — `lookup.mjs show <slug>` prints it.

**Caveat.** Leading nulls are warm-up, not missing data. The output is the same
length as the input so `bars[i]` and `result[i]` describe the same instant.
Filtering the nulls shifts the series left, and nothing errors.

**Validate first with:** the MAD outlier filter
(`market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter`).
A numeric series has no structure to check, so check its values.

---

## tape-aggregate — 7 topics

Trades in, bars out. All seven are bar-construction methods: time, tick, volume,
dollar, and three imbalance/run variants.

```js
import { constructBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";

const trades = [
  { tradeId: "T1", timestamp: "2026-01-05T14:30:00.000Z", session: "RTH",
    symbol: "DEMO", price: 100, volume: 10, currency: "USD" },
  { tradeId: "T2", timestamp: "2026-01-05T14:30:30.000Z", session: "RTH",
    symbol: "DEMO", price: 101, volume: 5,  currency: "USD" },
  { tradeId: "T3", timestamp: "2026-01-05T14:31:10.000Z", session: "RTH",
    symbol: "DEMO", price: 99,  volume: 8,  currency: "USD" },
];

constructBars(trades, {
  intervalSeconds: 60,
  sessionStarts: { RTH: "2026-01-05T14:30:00.000Z" },
  closePartial: true,
  emptyBarPolicy: "omit",
});
```

Executed output — note it is far richer than a plain OHLCV row:

```js
[
  { barIndex: 0, session: "RTH", intervalIndex: 0,
    startTime: "2026-01-05T14:30:00.000Z", endTime: "2026-01-05T14:31:00.000Z",
    firstTradeTime: "2026-01-05T14:30:00.000Z", lastTradeTime: "2026-01-05T14:30:30.000Z",
    open: 100, high: 101, low: 100, close: 101,
    volume: 15, dollarValue: 1505, tickCount: 2,
    firstTradeId: "T1", lastTradeId: "T2",
    emptyIntervalsBefore: 0, closeReason: "interval" },
  { barIndex: 1, /* … */ open: 99, high: 99, low: 99, close: 99,
    volume: 8, dollarValue: 792, tickCount: 1, closeReason: "stream_end" },
]
```

`closeReason` matters: `"interval"` means the bar closed because its window
ended; `"stream_end"` means the data ran out mid-bar. **The last bar of a live
feed is almost always `stream_end` — it is incomplete.** Feeding it to an
indicator as if it were closed is the most common live-data error.

**Caveat.** The only shape that cares about ordering and sessions. Trades must
arrive chronologically, and `sessionStarts` anchors every bucket boundary — get
it wrong and every bar edge is off by the same amount, consistently enough to
look correct.

**Validate first with:** the duplicate-trade resolver
(`market-data-engineering/cleaning-and-validation/duplicate-trade-resolver`).
A duplicated print inflates volume permanently and is invisible once inside a bar.

---

## row-classify — 17 topics

One verdict per row, same order, `verdicts.length === rows.length`. These are
the boundary guards.

```js
import { validateBars } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

validateBars(
  [
    { bar_id: "B1", source: "S", symbol: "DEMO", timestamp: "2026-07-20T09:30:00Z",
      open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { bar_id: "B2", source: "S", symbol: "DEMO", timestamp: "2026-07-20T09:31:00Z",
      open: 101, high: 100, low: 99, close: 99.5, volume: 900 },  // high < open
  ],
  { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 },
);
```

Executed output (abridged):

```js
[
  { index: 0, timestamp: "2026-07-20T09:30:00Z", valid: true,  issues: [], … },
  { index: 1, timestamp: "2026-07-20T09:31:00Z", valid: false,
    issues: ["HIGH_BELOW_BODY"],
    normalizedPrices: { open: 101, high: 100, low: 99, close: 99.5 },
    provenance: { source: "S", symbol: "DEMO", bar_id: "B2" },
    rawBar: { /* the row exactly as supplied */ } },
]
```

**Caveat — the important one.** These **never throw**. One malformed record in
ten thousand should lose neither that record nor the other 9,999, so failure is
reported in the return value. Ignoring the return value looks exactly like
success. Always branch on `valid`:

```js
const verdicts = validateBars(bars, config);
const clean = bars.filter((_, i) => verdicts[i].valid);
const rejected = verdicts.filter((v) => !v.valid);
if (rejected.length) {
  console.warn(`${rejected.length} bars rejected:`,
    rejected.map((v) => `${v.timestamp} ${v.issues.join(",")}`));
}
```

---

## snapshot-evaluate — 6 topics

One point-in-time snapshot plus a decision time, one verdict about that instant.

```js
import { consensus } from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";

consensus(
  {
    as_of: "2026-07-13T13:30:01.000Z",
    quotes: [
      { source_id: "A", owner_id: "OWNER-A", price: 100.00, instrument_id: "SYNTH-USD",
        currency: "USD", price_type: "last_trade", adjustment: "unadjusted",
        session: "regular", event_time: "2026-07-13T13:30:01.000Z" },
      { source_id: "B", owner_id: "OWNER-B", price: 100.01, /* … */ },
      { source_id: "C", owner_id: "OWNER-C", price: 100.02, /* … */ },
    ],
  },
  policy,
);
```

**Caveat.** The second argument is usually a decision time, and it is what makes
the result reproducible. Passing "now" instead of the instant being evaluated
turns a point-in-time check into look-ahead — the result stops being something
you could have known then.

---

## record-transform — 257 topics

**Not a shape.** The residual bucket: a topic lands here when it is none of the
other four. It spans fourteen of the sixteen domains and shares no field names
between families.

There is no general rule. Read the topic's own `api` block and captured example:

```bash
node "${SKILL_DIR}/scripts/lookup.mjs" show hampel-bad-tick-filter
```

A representative one — per-input-index records with a decision and a reason:

```js
import { hampelFilter } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter";

hampelFilter([100, 100.1, 99.9, 100, 100.1, 112, 100.05],
  { windowRadius: 3, threshold: 3, scale: 1.4826, minHistory: 3, mode: "causal" });
```

```js
[
  { index: 0, value: 100, mode: "causal", windowStart: 0, windowEnd: 0, windowCount: 1,
    median: 100, mad: 0, scaledMad: 0, score: null, threshold: 3,
    flagged: false, status: "insufficient_history",
    lookaheadUsed: false, suggestedReplacement: null, output: 100 },
  // …
  { index: 2, /* … */ score: 0.674…, flagged: false, status: "eligible", output: 99.9 },
]
```

Two fields worth noting on any record-transform result: a `status` that
distinguishes "not applicable yet" from "evaluated and passed", and a
`lookaheadUsed` flag where centred windows are possible. `mode: "causal"` is the
right choice for anything that must be reproducible in real time.

**Validate first with:** whichever guard matches the record — a bar →
`ohlc-consistency-validator`, a quote → `stale-quote-detector`, a corporate
action → its own family's guard.
