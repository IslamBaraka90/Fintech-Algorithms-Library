# Pitfalls

Every entry is a real failure mode. They share a property: **none of them throw**.
The code runs, a number comes out, and the number is wrong.

Read this before finalising any numeric answer.

---

## 1. Warm-up nulls are not missing data

Output length always equals input length so that `bars[i]` and `result[i]`
describe the same instant. The leading `null`s are positions where the window
was not yet full.

```js
calculateSma([44.34, 44.09, 44.15, 43.61, 44.33, 44.83], 5);
// → [null, null, null, null, 44.104, 44.202]
```

**The bug:** `result.filter(v => v !== null)` shifts the series left. Every
subsequent index now points at the wrong bar, and nothing errors. Keep the nulls
and index into the array; drop them only when formatting output for a human.

A 14-period RSI on 14 bars is entirely warm-up. Check the warm-up count before
concluding "the indicator returned nothing".

---

## 2. Never guess a returned field name

Return-key casing is **not consistent** across the library. All of these are
real, from the same package version:

```js
bollingerBands(close, 20, 2)   // → { middle, stddev, upper, lower, percent_b }
averageTrueRange(h, l, c, 14)  // → { true_range, atr }
obv(close, volume, 0)          // → { direction, volume, signed_volume, obv }
macd(close, 12, 26, 9)[25]     // → { index, value, fastEma, slowEma, macd, signal, histogram, status }
constructBars(trades, cfg)[0]  // → { barIndex, startTime, dollarValue, closeReason, … }
```

`percent_b` and `signed_volume` are snake_case. `fastEma` and `barIndex` are
camelCase. Writing `result.percentB` yields `undefined`, which propagates into
arithmetic as `NaN` — and `NaN` compares false against every threshold, so a
condition silently never fires.

**The rule:** read the captured example *output* for that topic. The `RETURNS`
type string is a summary — for many topics it is a type name like `Bar[]` rather
than a field list, and for a few the casing in the prose does not match the
implementation. The captured output is real execution and is regenerated on
every build.

```bash
node "${SKILL_DIR}/scripts/lookup.mjs" show bollinger-bands   # prints the executed output
```

---

## 3. `row-classify` topics never throw

All 17 report failure in the return value. One malformed record in ten thousand
should lose neither that record nor the other 9,999.

```js
const verdicts = validateBars(bars, config);   // no exception, ever
```

**The bug:** calling it and not reading the result. That is indistinguishable
from "all rows passed". Always branch on `valid` and report the rejected count.

---

## 4. Sibling functions are no longer re-exported (changed in 0.12.0)

Each subpath exports **its own** entry and nothing else from the family.

```js
// ✗ worked before 0.12.0, now undefined
import { williamsR } from "fintech-algorithms/technical-indicators/momentum/rsi";

// ✓
import { williamsR } from "fintech-algorithms/technical-indicators/momentum/williams-r";
```

The root export carries no algorithm at all — only `topics`, `topic`,
`byDomain`, `byFamily`, `byArchetype`, `load`, `runner`.

## 5. Entry points were renamed to camelCase in 0.12.0

23 functions changed. If code or a cached answer uses the old names, it breaks:

`bollinger_bands` → `bollingerBands` · `true_range` → `trueRange` ·
`average_true_range` → `averageTrueRange` · `keltner_channels` → `keltnerChannels` ·
`donchian_channels` → `donchianChannels` · `bollinger_bandwidth` → `bollingerBandwidth` ·
`stochastic_rsi` → `stochasticRsi` · `williams_r` → `williamsR` ·
`ultimate_oscillator` → `ultimateOscillator` · `connors_rsi` → `connorsRsi` ·
`parabolic_sar` → `parabolicSar` · `directional_movement` → `directionalMovement` ·
`money_flow_index` → `moneyFlowIndex` · `chaikin_money_flow` → `chaikinMoneyFlow` ·
`accumulation_distribution_line` → `accumulationDistributionLine` ·
`volume_price_trend` → `volumePriceTrend` · `force_index` → `forceIndex` ·
`double_top` → `doubleTop` · `double_bottom` → `doubleBottom` ·
`triple_top` → `tripleTop` · `triple_bottom` → `tripleBottom` ·
`head_and_shoulders` → `headAndShoulders` ·
`inverse_head_and_shoulders` → `inverseHeadAndShoulders`

Check the installed version before trusting either form:
`node "${SKILL_DIR}/scripts/lookup.mjs" version`.

---

## 6. MACD's signal line is defined later than its MACD line

```
warm-up: slow - 1              for the MACD line
         slow + signal - 2     for signal and histogram
```

The signal line is an average *of* the MACD line, so it starts strictly later.
Plotting the two without allowing for that misaligns them by `signal - 1` bars —
which shifts every crossing, the one thing anybody reads MACD for.

The row's `status` field tells you where you are: `warming_price_emas` →
`warming_signal` → ready.

---

## 7. Multi-series inputs must be aligned, not merely equal in length

`averageTrueRange(high, low, close, p)` throws `RangeError` when the three
arrays differ in **length**. It cannot detect that they are the same length but
shifted — which is what happens when you filter one column and not the others.

Build every column from the same `bars` array in one pass. See
`references/ingestion.md`.

---

## 8. Trades must be chronological, and `sessionStarts` anchors everything

`tape-aggregate` is the only archetype that cares about ordering. A websocket
batch is not sorted just because it arrived in order — sort explicitly.

A wrong `sessionStarts` shifts every bar boundary by the same amount. The bars
still look plausible; they just describe different intervals than you think.

---

## 9. The last bar of a live feed is incomplete

`closeReason: "stream_end"` means the data ran out mid-window;
`closeReason: "interval"` means the bar actually closed. An indicator computed
on a forming bar changes on every tick and reads as a signal.

Filter to `closeReason === "interval"` for anything that drives a conclusion.

---

## 10. Point-in-time: pass the decision instant, never `Date.now()`

`snapshot-evaluate` topics and every corporate-action topic with an `asOf` take
the instant being evaluated. Passing "now" converts a reproducible check into
look-ahead — the answer uses information that did not exist at the timestamp it
claims to describe. Nothing errors, and any study built on it is invalid.

---

## 11. JSON numbers that are strings

Many venues return `"100.5"`. `Number()` every numeric field in the adapter.
String inputs flow through arithmetic without throwing and produce results that
are wrong rather than absent.

---

## 12. Runtime facts

- **Node >= 22.**
- **ESM.** The `require` condition resolves to the same ES module — there is no
  separate CommonJS build — so `require()` needs a runtime supporting
  `require(esm)`. In older CommonJS, use `await import(...)`.
- **No state, no incremental API.** Recompute over a rolling window. The value
  for a given input never depends on call order — deliberately.
- **Zero dependencies.** If a task seems to need an HTTP client or a file read,
  that belongs in the caller's code, not here.

---

## 13. State the verification tier

158 topics are `verified` (worked example replayed and asserted on every build);
166 are `contract` (signature and shape checked against the compiled code, the
numbers not attested by an independent published figure).

Both guarantee the signature. Only `verified` guarantees the arithmetic against
a published figure.

> "This is the `contract` tier — the call and the shape are reliable, but the
> arithmetic is not cross-checked against an independent published figure."

That sentence is useful and honest. Omitting it overstates what was checked.

---

## 14. When the topic does not exist, say so

324 named topics, no catch-all. Do **not** invent a subpath, reshape another
topic's payload because the names look similar, or silently substitute a nearby
algorithm. Every subpath mirrors its docs URL exactly, so a plausible guess is
wrong in a way that reads as right.

Do: search the domain slice for the family that would contain it, name the
closest topic that does exist and say how it differs, and if the calculation
must be written by hand, write it explicitly rather than implying the library
did it.

---

## 15. An indicator value is not a recommendation

A crossing, a divergence or a completed pattern is an observation about a
series. Presenting it as a reason for a specific person to buy, sell or hold
crosses from analysis into investment advice — a regulated activity no code
library can discharge.

Report what was computed, on what input, at which tier. If asked what to do with
money, say that is a question for a licensed adviser.
