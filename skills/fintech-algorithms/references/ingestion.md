# Data ingestion

The library never fetches. Every task that starts with "analyse SYMBOL" is
really this pipeline, and only steps 3–4 are `fintech-algorithms`:

```
1. fetch     the user's provider, the user's credentials  (not this library)
2. adapt     vendor payload  →  Trade[] / Bar[] / number[]
3. validate  reject bad rows at the boundary               ← library
4. compute   indicators, patterns, breadth, TCA…           ← library
5. report    value + warm-up + verification tier
```

Canonical source: [Wiring up a data provider](https://docs.thefintechbuilder.com/guides/data-providers/).
This page is the practical extension of it.

## The two shapes

```ts
interface Trade {
  tradeId: string;
  timestamp: string;   // ISO 8601
  session: string;
  symbol: string;
  price: number;
  volume: number;
  currency: string;
}

interface Bar {
  timestamp: string;   // ISO 8601
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

Series transforms take a plain `number[]` and need no adapter at all.

---

## Adapter recipes

Write one adapter per provider. Nothing downstream should ever see a vendor
field name — if a function signature mentions `r.c` or `results[]`, the boundary
has leaked.

### Object-per-bar JSON (most REST APIs)

```js
export function toBars(symbol, rows) {
  return rows.map((r) => ({
    timestamp: new Date(r.t).toISOString(),   // epoch ms → ISO 8601
    symbol,
    open: r.o, high: r.h, low: r.l, close: r.c,
    volume: r.v,
  }));
}
```

### Array-of-arrays JSON (exchange klines)

Common on crypto venues: `[openTime, open, high, low, close, volume, …]`, with
**every numeric field as a string**.

```js
export function toBarsFromKlines(symbol, rows) {
  return rows.map(([openTime, o, h, l, c, v]) => ({
    timestamp: new Date(Number(openTime)).toISOString(),
    symbol,
    open: Number(o), high: Number(h), low: Number(l), close: Number(c),
    volume: Number(v),
  }));
}
```

⚠️ `Number()` on every field. A string `"100.5"` flows through arithmetic as
`NaN` or as string concatenation, and neither throws. `calculateSma(["1","2"], 2)`
returns numbers that are silently wrong.

### CSV

```js
export function toBarsFromCsv(symbol, text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",").map((h) => h.trim().toLowerCase());
  const at = (row, name) => row[cols.indexOf(name)];

  return lines.map((lineText) => {
    const row = lineText.split(",");
    return {
      timestamp: new Date(at(row, "date") ?? at(row, "timestamp")).toISOString(),
      symbol,
      open: Number(at(row, "open")),
      high: Number(at(row, "high")),
      low: Number(at(row, "low")),
      close: Number(at(row, "close")),
      volume: Number(at(row, "volume")),
    };
  });
}
```

Resolve the header by name, never by position. Vendors reorder columns between
exports and a positional reader mislabels the whole file without erroring.

### Websocket tick stream → `Trade[]`

Bar construction needs a chronologically ordered batch, so buffer and flush:

```js
const buffer = [];

socket.on("message", (raw) => {
  const m = JSON.parse(raw);
  buffer.push({
    tradeId: String(m.id),
    timestamp: new Date(m.ts).toISOString(),
    session: "RTH",                    // your calendar decides this, not the feed
    symbol: m.s,
    price: Number(m.p),
    volume: Number(m.q),
    currency: "USD",
  });
});

// Flush on a timer, then aggregate.
function flush() {
  const batch = buffer.splice(0, buffer.length)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));   // required
  return constructBars(batch, {
    intervalSeconds: 60,
    sessionStarts: { RTH: sessionOpenIso },
  });
}
```

`sessionStarts` anchors every bucket boundary. Get it wrong and every bar edge
is off by the same amount — consistently enough to look correct.

---

## Bars → column arrays

Every `series-transform` wants a bare array. This is the step between step 2 and
step 4, and getting it wrong is how series drift apart.

```js
export function columns(bars) {
  return {
    timestamp: bars.map((b) => b.timestamp),
    open:  bars.map((b) => b.open),
    high:  bars.map((b) => b.high),
    low:   bars.map((b) => b.low),
    close: bars.map((b) => b.close),
    volume: bars.map((b) => b.volume),
  };
}
```

Build all columns from **the same `bars` array in one pass**. Filtering `close`
separately from `high`/`low` — dropping nulls from one but not the others —
silently misaligns them, and multi-series functions like `averageTrueRange`
throw `RangeError` only if the lengths differ, not if the contents shifted.

---

## Validate at the boundary

Run the guard that matches the shape, and branch on the verdict. These never
throw; ignoring the return value looks exactly like success.

```js
import { validateBars }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

const verdicts = validateBars(bars, { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 });
const clean = bars.filter((_, i) => verdicts[i].valid);

const rejected = verdicts.filter((v) => !v.valid);
if (rejected.length) {
  console.warn(`${rejected.length}/${bars.length} bars rejected`,
    rejected.slice(0, 5).map((v) => `${v.timestamp}: ${v.issues.join(", ")}`));
}
```

Which guard for which input:

| Input | Guard |
|---|---|
| OHLC bars | `cleaning-and-validation/ohlc-consistency-validator` |
| A numeric series | `cleaning-and-validation/median-absolute-deviation-outlier-filter` |
| A tick series with spikes | `cleaning-and-validation/hampel-bad-tick-filter` (`mode: "causal"`) |
| Raw trades before aggregating | `cleaning-and-validation/duplicate-trade-resolver` |
| Quotes | `cleaning-and-validation/stale-quote-detector` |
| Bid/ask | `cleaning-and-validation/crossed-locked-market-detector` |
| Two or more feeds | `data-quality/price-source-consensus-check` |
| Suspected missing bars | `data-quality/missing-bar-gap-classifier` |

Rejecting a bar leaves a hole. **Do not silently close the gap by concatenating
what remains** — that shortens the series and shifts every subsequent index.
Either carry the row through with a `null` close so positions are preserved, or
classify the gap explicitly with `missing-bar-gap-classifier` and say in the
report how many rows were dropped.

---

## Live and incremental data

**The last bar is usually incomplete.** `constructBars` marks it: `closeReason`
is `"interval"` for a bar that closed because its window ended and
`"stream_end"` for one that ran out of data mid-window. Treating a `stream_end`
bar as closed produces an indicator value that changes every tick and looks like
a signal.

```js
const bars = constructBars(trades, config);
const closed = bars.filter((b) => b.closeReason === "interval");
const forming = bars.find((b) => b.closeReason === "stream_end");   // display only
```

**Budget the warm-up.** Fetch more history than the window, or the first real
value never arrives:

| Indicator | Index of the first non-null |
|---|---|
| `calculateSma(values, window)` | `window - 1` |
| `calculateEma(values, span)` | `span - 1` |
| `bollingerBands(close, p, mult)` | `p - 1` |
| `rsi(close, p)` | `p` |
| `averageTrueRange(high, low, close, p)` | `p - 1` for `atr`; `true_range` has none |
| `obv(close, volume, initial)` | `0` — no warm-up; the series starts at `initial` |
| `macd(v, fast, slow, signal)` | `slow - 1` line · `slow + signal - 2` signal |

All measured by execution at `p` ∈ {5, 10, 14, 20} on 0.12.0, and each matches
the topic's published `warmup.count`. For any other topic, read the field —
`lookup.mjs show <slug>` prints it — or measure directly:

```js
const firstValid = series.findIndex((v) => v !== null);
```

A 14-period RSI on 14 bars is *entirely* warm-up. For live use fetch at least
`period × 3` bars and discard the leading nulls from the *report*, not from the
array.

**These functions hold no state.** There is no incremental update API —
recompute over a rolling window. That is a deliberate property: the value for a
given input never depends on call order.

---

## More than one provider

Two feeds never agree exactly and their clocks drift.

```js
import { consensus }
  from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";

const verdict = consensus(
  { as_of: decisionTime, quotes: [primary, secondary, tertiary] },
  { minimum_independent_sources: 3, z_threshold: 3,
    absolute_tolerance: 0.01, maximum_tolerance: 0.05, max_age_ms: 2000 },
);
```

Pass the **instant being evaluated** as `as_of`, not `Date.now()`. Passing "now"
turns a point-in-time check into look-ahead: the result stops being something
that could have been known then, which quietly invalidates any historical study
built on it.

---

## Credentials

Not in this library, and not in the adapter's committed source. Read them from
the environment in the layer that constructs the HTTP client, above the adapter:

```js
const client = new VendorClient({ apiKey: process.env.VENDOR_API_KEY });
const rows = await client.dailyBars("AAPL");
const bars = toBars("AAPL", rows);   // the adapter never sees the key
```

Never write a key into a file, a URL query string, or an example. When a user
pastes one into the conversation, use it for the call at hand and do not persist
it or echo it back.

---

## Complete example

Provider → adapter → validate → compute → report, runnable end to end.

```js
import { validateBars }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";
import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";
import { rsi } from "fintech-algorithms/technical-indicators/momentum/rsi";

// 1. fetch — yours
const rows = await client.dailyBars("AAPL", { limit: 120 });

// 2. adapt
const bars = rows.map((r) => ({
  timestamp: new Date(r.t).toISOString(), symbol: "AAPL",
  open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
}));

// 3. validate
const verdicts = validateBars(bars, { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 });
const clean = bars.filter((_, i) => verdicts[i].valid);
const dropped = bars.length - clean.length;

// 4. compute — one pass, so the columns stay aligned
const close = clean.map((b) => b.close);
const sma20 = calculateSma(close, 20);
const { rsi: rsi14 } = rsi(close, 14);

// 5. report
const i = clean.length - 1;
console.log({
  asOf: clean[i].timestamp,
  close: close[i],
  sma20: sma20[i],          // null until index 19
  rsi14: rsi14[i],          // null until index 14
  barsUsed: clean.length,
  barsDropped: dropped,
  tiers: { sma: "verified", rsi: "verified" },
});
```

Report `barsDropped` and the tiers. A number without its provenance is the thing
this library exists to avoid.
