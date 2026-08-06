---
name: fintech-algorithms
description: Compute market-data and trading analytics with the `fintech-algorithms` npm package — 324 zero-dependency TypeScript algorithms covering technical indicators (RSI, MACD, moving averages, Bollinger Bands, ATR, OBV, Stochastic), candlestick and chart patterns, market breadth, bar construction from tick data, OHLC validation and cleaning, corporate actions, index and benchmark construction, market microstructure, matching engines, execution and TCA, statistical time series, on-chain metrics and EPS analytics. Use when asked to analyse a price series, compute or explain an indicator, detect a candlestick or chart pattern, build bars from ticks, validate or clean market data, wire up a market-data provider, or when writing code that needs any of these calculations to be correct rather than approximated.
metadata:
  version: 0.12.0
---

# fintech-algorithms

324 pure functions for market and financial calculations. Plain arrays and
objects in, plain values out. Zero runtime dependencies, Node >= 22, ESM.

**Docs:** https://docs.thefintechbuilder.com ·
**Authoritative agent guide:** https://docs.thefintechbuilder.com/guides/ai-agents/

## Non-negotiables

Four rules. Breaking any one produces output that looks right and is wrong.

1. **Never invent an import path, a function name, or a parameter.** Every
   subpath mirrors its docs URL exactly, which makes a plausible guess wrong in
   a way that reads as correct. Look it up — `scripts/lookup.mjs` or the
   resolution order below. If the topic does not exist, say so and stop.
2. **Never guess a returned field name.** Return-key casing is not consistent
   across the library: `bollingerBands` returns `percent_b`, `macd` rows return
   `fastEma`. Read the captured example output for that topic. See
   `references/pitfalls.md`.
3. **State the verification tier** on any numeric claim. `verified` (158 topics)
   means the arithmetic is replayed and asserted on every build. `contract`
   (166 topics) means the signature and shape are checked but the numbers are
   not attested by an independent published figure.
4. **Analysis, not advice.** These functions compute quantities. An indicator
   crossing is an observation about a series — not a prediction, not a signal,
   and never a recommendation for a specific person's money. Report what was
   computed, on what input, at which tier. If asked what to buy or sell, say
   that is a question for a licensed adviser.

## The library does not fetch data

There is no HTTP client, no vendor SDK, no API key, no `node:fs`. If a task
needs prices, the caller supplies them. This is deliberate: vendor APIs get
rewritten every few years and algorithms do not.

When a user wants "live analysis", the shape is always: **their feed → their
adapter → validate → compute → report.** Only the middle two steps are this
library. Load `references/ingestion.md` for the adapter pattern and the
canonical `Trade` / `Bar` shapes.

## Resolution order

Stop at the first step that answers the question.

1. **Installed package** — if `fintech-algorithms` is a dependency, read
   `node_modules/fintech-algorithms/docs.json`. Every signature, contract and
   worked example, no network. **Prefer this.** `scripts/lookup.mjs` uses it
   automatically.
2. **Domain index** — `https://docs.thefintechbuilder.com/{domain-slug}/llms.txt`
   (3–11 KB each). The map of all thirteen is the `## Per-domain indexes` block
   at the top of `/llms.txt`; one root fetch gives a permanent routing table.
3. **Topic markdown** — append `index.md` to any docs URL. The full contract in
   3–11 KB instead of 68–114 KB of HTML.
4. **Full payload** — `https://docs.thefintechbuilder.com/reference/payload.json`
   (~2.6 MB). For ingestion, not for answering one question.

Turn a docs URL into an import: swap `https://docs.thefintechbuilder.com/` for
`fintech-algorithms/` and drop the trailing slash.

Check the installed version matches the docs with
`https://docs.thefintechbuilder.com/version.json` (under 1 KB).

## Workflow

**1. Identify the quantity.** What is actually being asked for? "Is this
overbought" → RSI. "Smooth this" → which moving average, and why that one.

**2. Narrow by archetype before fetching anything.** Five input shapes cover all
324 topics, and the archetype is on every index line:

| Archetype | Takes | Returns | Count |
|---|---|---|---|
| `series-transform` | `(number \| null)[]` + numeric params | same-length array | 37 |
| `tape-aggregate` | `Trade[]` + config | `Bar[]` | 7 |
| `row-classify` | rows | one verdict per row | 17 |
| `snapshot-evaluate` | one snapshot + decision time | one verdict | 6 |
| `record-transform` | domain-specific | domain-specific | 257 |

`record-transform` is the residual bucket — read that topic's own contract.
Details and executed examples: `references/archetypes.md`.

**3. Read the contract.** Signature, params, returns, **warm-up**, errors.

```bash
node scripts/lookup.mjs show rsi
```

**4. Shape the data.** Map the user's payload into the documented input. Run the
boundary validator first when the input is bars, ticks or quotes.

**5. Compute and report.** Say what was computed, on what input, at which tier,
and how many leading values are warm-up rather than signal.

## Quick start

```bash
npm install fintech-algorithms
```

Algorithms are **subpath-only**. The root export carries metadata and lookups
(`topics`, `topic`, `byDomain`, `byFamily`, `byArchetype`, `load`, `runner`) and
re-exports no algorithm. A sibling topic's function is never re-exported from
another subpath — import each from its own.

```js
import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";

calculateSma([44.34, 44.09, 44.15, 43.61, 44.33, 44.83], 5);
// → [null, null, null, null, 44.104, 44.202]
//     ^^^^ four warm-up nulls: window - 1
```

The `require` condition resolves to the same ES module — there is no separate
CommonJS build, so `require()` needs a runtime supporting `require(esm)`.

## The lookup script

`scripts/lookup.mjs` sits next to this file. The working directory is the user's
project, not the skill, so always invoke it by absolute path.

**These files write `${SKILL_DIR}` for the directory containing this SKILL.md.**
In Claude Code that is `${CLAUDE_SKILL_DIR}`, which the harness substitutes for
you. In any other agent, substitute the real path before running the command.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/lookup.mjs" search "moving average"
```

Commands:

| Command | Does |
|---|---|
| `search <query>` | find topics by name, slug, family or entry |
| `show <slug\|id\|path>` | full contract, warm-up, errors, executed example |
| `archetype <name>` | every topic sharing an input shape, plus its caveat |
| `domain <id\|slug>` | every topic in a domain, grouped by family |
| `domains` | the thirteen domains with their index URLs |
| `version` | the reference version vs the published one |

Reads `node_modules/fintech-algorithms/docs.json` when the package is installed
anywhere above the working directory; otherwise fetches and caches the published
payload for a day. Set `FINTECH_DOCS_JSON` to point it at a specific file.
Accepts a slug (`rsi`), a catalog id (`D07-F03-A01`), a full path, or a docs URL.

If `show` cannot find the topic it says so rather than guessing — that failure is
the correct answer, not an obstacle to route around.

## Load a reference when

- **`references/archetypes.md`** — mapping user data into an input shape, or
  deciding how much adapter code a task needs.
- **`references/ingestion.md`** — the user has a provider, a CSV, a websocket or
  a broker API and asks how to connect it.
- **`references/recipes.md`** — an end-to-end task: clean a feed, build bars,
  compute a multi-indicator report.
- **`references/pitfalls.md`** — before finalising any numeric answer. Short,
  and every entry is a real failure mode with a real cause.

## Coverage

13 domains: Market Data Engineering (31) · Corporate Actions and Security Master
Data (20) · Index and Benchmark Engineering (40) · Market Breadth and Internals
(28) · Price Action and Candlesticks (38) · Technical Indicators (37) ·
Geometric Chart Patterns (27) · Statistical Time Series (29) · Market
Microstructure (29) · Matching Engines and Venue Logic (21) · Execution and
Transaction Cost Analysis (9) · Digital Assets and On-Chain Finance (10) ·
Earnings and Per-Share Analytics (5).

Not a backtester, an execution system, a portfolio manager, or a source of
market data. It computes quantities, places no orders, and holds no state
between calls.
