# fintech-algorithms

[![npm](https://img.shields.io/npm/v/fintech-algorithms.svg)](https://www.npmjs.com/package/fintech-algorithms)
[![docs](https://img.shields.io/badge/docs-docs.thefintechbuilder.com-0a58c8.svg)](https://docs.thefintechbuilder.com)
[![agent skill](https://img.shields.io/badge/agent%20skill-included-8a3ffc.svg)](https://docs.thefintechbuilder.com/guides/agent-skill/)
[![CI](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/actions/workflows/ci.yml/badge.svg)](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/npm/l/fintech-algorithms.svg)](LICENSE)

**Corporate actions, index construction, market breadth, market microstructure,
matching engines, execution algorithms and technical indicators — as plain
TypeScript functions with zero dependencies.**

📖 **[Documentation → docs.thefintechbuilder.com](https://docs.thefintechbuilder.com)**
— a reference page for every algorithm, with a worked example whose output was
produced by running the code. Start with the
**[quick start](https://docs.thefintechbuilder.com/start/)**.

Split and dividend adjustment factors, capped free-float index weighting,
McClellan breadth internals, dollar and imbalance bars, and the usual moving
averages. Most npm packages in this space stop at indicators; the harder
back-office arithmetic is the reason this one exists.

```bash
npm install fintech-algorithms
```

## Writing this code with an agent? Install the skill first

```bash
npx skills add IslamBaraka90/Fintech-Algorithms-Library
```

**This is the single highest-value thing you can do before asking an agent to
use this library.** 324 algorithms is more API than any model has read, and the
failure mode is not refusal — it is a plausible import path, a plausible
parameter and a plausible field name on the result, none of which exist. The
skill replaces every one of those guesses with a lookup.

It ships in the [Agent Skills](https://agentskills.io) format, so Claude Code,
Codex, Cursor and some seventy other agents load it on demand. It carries the
routing rules for every topic, the five input shapes with executed examples,
the data-ingestion patterns for wiring up a provider, the failure modes that do
not throw — the category that otherwise produces a confident wrong number — and
a lookup script that answers from the installed `docs.json`, offline:

```bash
node <skill-dir>/scripts/lookup.mjs show rsi
# → signature, parameters, warm-up (p leading nulls), errors, executed example
```

The skill is [`skills/fintech-algorithms/`](skills/fintech-algorithms/) here and
also ships inside the npm tarball, version-matched to the `docs.json` beside it,
so a project that already depends on the package already has it.

📘 **[The agent skill → docs.thefintechbuilder.com/guides/agent-skill/](https://docs.thefintechbuilder.com/guides/agent-skill/)**
· Background on how an agent should read this library:
[Using this library from an agent](https://docs.thefintechbuilder.com/guides/ai-agents/).

## Adjust a price history for a 2-for-1 split

```ts
import { calculate } from "fintech-algorithms/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment";

calculate({
  prices: [120, 123, 60, 62],
  volumes: [1000, 1200, 2400, 2000],
  eventIndex: 2,
  postSplitSharesPerPreSplitShare: 2,
});
// adjustedPrices:  [60, 61.5, 60, 62]
// adjustedVolumes: [2000, 2400, 2400, 2000]
```

Pre-split prices are divided and volumes multiplied, so the series is continuous
across the event and returns computed over it are correct.

Indicators work the same way — plain arrays in, plain arrays out:

```ts
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";

calculateEma([10, 13, 16, 19], 3); // → [null, null, 13, 16]
```

`null` marks a warm-up observation where the indicator is not yet defined.

## Bring your own data

**The library ships no data provider.** No Yahoo client, no exchange SDK, no
`node:fs`, no network calls, zero runtime dependencies. Every algorithm takes
plain arrays and plain objects, so the same code runs in Node, the browser, a
Worker, Deno or Bun.

Adapting a provider is a short mapping function that *you* own:

```ts
// Your provider's payload → the library's Trade contract. You own this file.
const toTrades = (payload: ProviderResponse): Trade[] =>
  payload.results.map((r) => ({
    tradeId: r.id,
    timestamp: new Date(r.t).toISOString(),
    session: "S1",
    symbol: r.sym,
    price: r.p,
    volume: r.s,
    currency: "USD",
  }));
```

When a vendor changes their API you edit one adapter; the algorithms never move.

Requires Node ≥ 22.

## Verified against published worked examples

<!-- coverage:start -->
**175 of 351 topics** are verified against the catalog's own published numbers
(134 via `{ input, expected }`, 11 via row fixtures, 30 via bar/checkpoint fixtures).
The remaining 176 are proven to load and expose a callable entry point, but their
arithmetic is not asserted here — those topics ship no machine-readable expected
values in the catalog.
<!-- coverage:end -->

Every algorithm accompanies a published article that walks through a worked
example by hand. Where that article ships machine-readable numbers, the test
suite replays them and asserts the output matches exactly — so a green run means
the package, the article and the standalone repo agree on the arithmetic.

It is an honest split, not a marketing number. Each algorithm's
[reference page](https://docs.thefintechbuilder.com) states
which tier it is in, and every worked example shown there is a fixture the test
suite asserts — so those numbers cannot drift.

## Import paths mirror article URLs

The subpath of every module is exactly the path of its article:

| | |
|---|---|
| Article | `https://thefintechbuilder.com/technical-indicators/trend-smoothing/ema/` |
| Import | `fintech-algorithms/technical-indicators/trend-smoothing/ema` |

One mental model for the site, the standalone repos and the package. It also
means the 63 topics that each export a function named `calculate` never collide —
they live in separate namespaces.

## The five shapes

Every topic is an instance of one of five archetypes:

<!-- shapes:start -->
| Archetype | Signature | Count | Example |
|---|---|--:|---|
| `record-transform` | `(input) → output` | 277 | backward-split-adjustment |
| `series-transform` | `(values, ...params) → (number\|null)[]` | 37 | ema, rsi, macd |
| `row-classify` | `(rows, config?) → verdict[]` | 24 | ohlc-consistency-validator |
| `tape-aggregate` | `(trades, config) → bar[]` | 7 | time-bars, volume-bars |
| `snapshot-evaluate` | `(snapshot, policy) → result` | 6 | price-source-consensus-check |
<!-- shapes:end -->

Classifiers return a verdict per row instead of throwing, so one bad tick cannot
abort a batch.

## The registry

The package root exports **metadata only** — never algorithm code — so importing
it stays light. Use it to enumerate the library, build docs, or dispatch
dynamically.

```ts
import { topics, topic, byDomain, byFamily, byArchetype, load, runner } from "fintech-algorithms";

topics.length;                    // every topic in the catalog
topic("D07-F01-A02")?.path;       // "technical-indicators/trend-smoothing/ema"
byFamily("D01-F01").map(t => t.slug);
                                  // ["time-bars", "tick-bars", "volume-bars", ...]

const run = await runner("D07-F01-A01");
run([1, 2, 3, 4, 5], 3);          // [null, null, 2, 3, 4]
```

Every module also exports a uniform `run` alias for its primary function, plus a
`meta` object carrying its catalog id, domain, family, shape, article URL and
repo URL.

## Coverage

<!-- stats:start -->
**351 topics** · 15 domains · 58 families

| Domain | Topics | Families | Name |
|---|--:|--:|---|
| D01 | 31 | 5 | Market Data Engineering |
| D02 | 20 | 4 | Corporate Actions and Security Master Data |
| D03 | 40 | 6 | Index and Benchmark Engineering |
| D04 | 28 | 5 | Market Breadth and Internals |
| D06 | 38 | 5 | Price Action and Candlesticks |
| D07 | 37 | 5 | Technical Indicators |
| D08 | 37 | 6 | Geometric Chart Patterns |
| D09 | 29 | 5 | Statistical Time Series |
| D11 | 29 | 5 | Market Microstructure |
| D12 | 21 | 4 | Matching Engines and Venue Logic |
| D13 | 9 | 2 | Execution and Transaction Cost Analysis |
| D21 | 7 | 1 | Credit Risk and Default |
| D25 | 10 | 2 | Digital Assets and On-Chain Finance |
| D40 | 10 | 1 | Model Validation and Backtesting |
| D46 | 5 | 2 | Earnings and Per-Share Analytics |
<!-- stats:end -->

## Every algorithm

Each name links to its reference page — signature, worked example, verification
tier, diagrams and source.

**[Full reference for every algorithm →](https://docs.thefintechbuilder.com)**

<!-- topics:start -->
### D01 — Market Data Engineering · 31 topics

**Bar Construction** — [Time Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/time-bars/) · [Tick Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/tick-bars/) · [Volume Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/volume-bars/) · [Dollar Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/dollar-bars/) · [Tick-Imbalance Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/tick-imbalance-bars/) · [Volume-Imbalance Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/volume-imbalance-bars/) · [Tick-Run Bars](https://docs.thefintechbuilder.com/market-data-engineering/bar-construction/tick-run-bars/)

**Cleaning and Validation** — [OHLC Consistency Validator](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator/) · [Hampel Bad-Tick Filter](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter/) · [Median Absolute Deviation Outlier Filter](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter/) · [Stale-Quote Detector](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/stale-quote-detector/) · [Duplicate-Trade Resolver](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver/) · [Crossed/Locked Market Detector](https://docs.thefintechbuilder.com/market-data-engineering/cleaning-and-validation/crossed-locked-market-detector/)

**Time Synchronization** — [Previous-Tick Interpolation](https://docs.thefintechbuilder.com/market-data-engineering/time-synchronization/previous-tick-interpolation/) · [Linear Quote Interpolation](https://docs.thefintechbuilder.com/market-data-engineering/time-synchronization/linear-quote-interpolation/) · [Refresh-Time Sampling](https://docs.thefintechbuilder.com/market-data-engineering/time-synchronization/refresh-time-sampling/) · [Exchange-Calendar Alignment](https://docs.thefintechbuilder.com/market-data-engineering/time-synchronization/exchange-calendar-alignment/) · [Asynchronous Return Alignment](https://docs.thefintechbuilder.com/market-data-engineering/time-synchronization/asynchronous-return-alignment/)

**Data Quality** — [Missing-Bar Gap Classifier](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/missing-bar-gap-classifier/) · [Feed-Latency Monitor](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/feed-latency-monitor/) · [Price-Source Consensus Check](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/price-source-consensus-check/) · [Schema-Drift Detector](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/schema-drift-detector/) · [Point-in-Time Availability Guard](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/point-in-time-availability-guard/) · [Provider Adjustment-Basis Drift Detector](https://docs.thefintechbuilder.com/market-data-engineering/data-quality/provider-adjustment-basis-drift-detector/)

**Order-Book Feed Engineering** — [Trade-and-Quote Event Normalization](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/trade-and-quote-event-normalization/) · [Level-2 Snapshot-and-Delta Reconstruction](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/level-2-snapshot-and-delta-reconstruction/) · [Level-3 Order-by-Order Reconstruction](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/level-3-order-by-order-reconstruction/) · [Sequence-Gap Detection and Recovery](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/sequence-gap-detection-and-recovery/) · [Price-Level Quantity Aggregation](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/price-level-quantity-aggregation/) · [Snapshot/Incremental-Feed Reconciliation](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/snapshot-incremental-feed-reconciliation/) · [Multi-Venue Best-Quote and Book Consolidation](https://docs.thefintechbuilder.com/market-data-engineering/order-book-feed-engineering/multi-venue-best-quote-and-book-consolidation/)


### D02 — Corporate Actions and Security Master Data · 20 topics

**Adjustment Factors** — [Backward Split Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment/) · [Forward Split Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/adjustment-factors/forward-split-adjustment/) · [Cash-Dividend Total-Return Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/adjustment-factors/cash-dividend-total-return-adjustment/) · [CRSP Cumulative Price Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-price-adjustment/) · [CRSP Cumulative Share/Volume Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-share-volume-adjustment/)

**Complex Distributions** — [Rights-Issue TERP Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/complex-distributions/rights-issue-terp-adjustment/) · [Spin-Off Price Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/complex-distributions/spin-off-price-adjustment/) · [Stock-Dividend Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/complex-distributions/stock-dividend-adjustment/) · [Special-Dividend Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/complex-distributions/special-dividend-adjustment/) · [Return-of-Capital Adjustment](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/complex-distributions/return-of-capital-adjustment/)

**Identity Continuity** — [Permanent Security Identifier Mapping](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/identity-continuity/permanent-security-identifier-mapping/) · [Ticker-Change Chain Resolution](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/identity-continuity/ticker-change-chain-resolution/) · [Share-Class Relationship Mapping](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/identity-continuity/share-class-relationship-mapping/) · [Merger Predecessor/Successor Mapping](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/identity-continuity/merger-predecessor-successor-mapping/) · [Delisting Return Reconstruction](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/identity-continuity/delisting-return-reconstruction/)

**Point-in-Time Universe** — [Historical Constituent Reconstruction](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/point-in-time-universe/historical-constituent-reconstruction/) · [Survivorship-Bias Guard](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/point-in-time-universe/survivorship-bias-guard/) · [IPO Availability Timestamping](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/point-in-time-universe/ipo-availability-timestamping/) · [Filing-Revision Versioning](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/point-in-time-universe/filing-revision-versioning/) · [Corporate-Action Status and Effective-Date Reconciliation](https://docs.thefintechbuilder.com/corporate-actions-and-security-master-data/point-in-time-universe/corporate-action-status-and-effective-date-reconciliation/)


### D03 — Index and Benchmark Engineering · 40 topics

**Index Initialization and Continuity** — [Base-Date/Base-Value Initialization](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/index-initialization-and-continuity/base-date-base-value-initialization/) · [Index Divisor Initialization](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/index-initialization-and-continuity/index-divisor-initialization/) · [Divisor Continuity Adjustment](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/index-initialization-and-continuity/divisor-continuity-adjustment/) · [Corporate-Action Divisor Bridge](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/index-initialization-and-continuity/corporate-action-divisor-bridge/) · [Intraday Index-Level Calculation](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/index-initialization-and-continuity/intraday-index-level-calculation/)

**Weighting and Capping** — [Price-Weighted Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/price-weighted-index/) · [Total-Market-Cap Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/total-market-cap-index/) · [Free-Float Market-Cap Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/free-float-market-cap-index/) · [Capped Free-Float Market-Cap Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/capped-free-float-market-cap-index/) · [Modified Market-Cap Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/modified-market-cap-index/) · [Equal-Weight Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/equal-weight-index/) · [Iterative Cap Redistribution](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/iterative-cap-redistribution/) · [Group-Level Capping](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/weighting-and-capping/group-level-capping/)

**Alternative Weighting** — [Fundamental-Weighted Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/fundamental-weighted-index/) · [Dividend-Yield-Weighted Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/dividend-yield-weighted-index/) · [Factor-Score-Weighted Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/factor-score-weighted-index/) · [Minimum-Volatility Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/minimum-volatility-index/) · [Equal-Risk-Contribution Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/equal-risk-contribution-index/) · [Thematic-Tilt Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/alternative-weighting/thematic-tilt-index/)

**Return Variants** — [Price-Return Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/price-return-index/) · [Gross Total-Return Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/gross-total-return-index/) · [Net Total-Return Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/net-total-return-index/) · [Excess-Return Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/excess-return-index/) · [Dividend-Point Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/dividend-point-index/) · [Currency-Converted Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/currency-converted-index/) · [Currency-Hedged Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/return-variants/currency-hedged-index/)

**Strategy Indices** — [Leveraged Daily-Reset Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/leveraged-daily-reset-index/) · [Inverse Daily-Reset Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/inverse-daily-reset-index/) · [Volatility-Control Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/volatility-control-index/) · [Fixed-Decrement Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/fixed-decrement-index/) · [Percentage-Decrement Index](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/percentage-decrement-index/) · [Index-of-Indices](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/strategy-indices/index-of-indices/)

**Governance and Maintenance** — [Eligibility Screen](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/eligibility-screen/) · [Liquidity Screen](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/liquidity-screen/) · [Free-Float Factor Calculation](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/free-float-factor-calculation/) · [IPO Fast-Entry Rule](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/ipo-fast-entry-rule/) · [Reconstitution Algorithm](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/reconstitution-algorithm/) · [Rebalancing Algorithm](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/rebalancing-algorithm/) · [Turnover Buffer Rule](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/turnover-buffer-rule/) · [Index Replication-Cost Estimator](https://docs.thefintechbuilder.com/index-and-benchmark-engineering/governance-and-maintenance/index-replication-cost-estimator/)


### D04 — Market Breadth and Internals · 28 topics

**Advance/Decline Breadth** — [Net Advances](https://docs.thefintechbuilder.com/market-breadth-and-internals/advance-decline-breadth/net-advances/) · [Advance/Decline Ratio](https://docs.thefintechbuilder.com/market-breadth-and-internals/advance-decline-breadth/advance-decline-ratio/) · [Cumulative Advance/Decline Line](https://docs.thefintechbuilder.com/market-breadth-and-internals/advance-decline-breadth/cumulative-advance-decline-line/) · [Normalized Advance/Decline Line](https://docs.thefintechbuilder.com/market-breadth-and-internals/advance-decline-breadth/normalized-advance-decline-line/) · [Absolute Breadth Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/advance-decline-breadth/absolute-breadth-index/)

**McClellan Family** — [Traditional McClellan Oscillator](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/traditional-mcclellan-oscillator/) · [Ratio-Adjusted McClellan Oscillator](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/ratio-adjusted-mcclellan-oscillator/) · [Traditional McClellan Summation Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/traditional-mcclellan-summation-index/) · [Ratio-Adjusted Summation Index (RASI)](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/ratio-adjusted-summation-index-rasi/) · [McClellan Volume Oscillator](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/mcclellan-volume-oscillator/) · [McClellan Volume Summation Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/mcclellan-family/mcclellan-volume-summation-index/)

**High/Low and Trend Breadth** — [New Highs–New Lows](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/new-highs-new-lows/) · [High-Low Ratio](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/high-low-ratio/) · [High-Low Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/high-low-index/) · [Percent Above 20-Day MA](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-20-day-ma/) · [Percent Above 50-Day MA](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-50-day-ma/) · [Percent Above 200-Day MA](https://docs.thefintechbuilder.com/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-200-day-ma/)

**Thrust and Pressure** — [Zweig Breadth Thrust](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/zweig-breadth-thrust/) · [Arms Index (TRIN)](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/arms-index-trin/) · [Advance/Decline Volume Line](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/advance-decline-volume-line/) · [Upside/Downside Volume Ratio](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/upside-downside-volume-ratio/) · [Cumulative TICK](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/cumulative-tick/) · [Breadth-Divergence Detector](https://docs.thefintechbuilder.com/market-breadth-and-internals/thrust-and-pressure/breadth-divergence-detector/)

**Concentration and Diffusion** — [Top-N Index Contribution](https://docs.thefintechbuilder.com/market-breadth-and-internals/concentration-and-diffusion/top-n-index-contribution/) · [Herfindahl Constituent Concentration](https://docs.thefintechbuilder.com/market-breadth-and-internals/concentration-and-diffusion/herfindahl-constituent-concentration/) · [Effective Number of Constituents](https://docs.thefintechbuilder.com/market-breadth-and-internals/concentration-and-diffusion/effective-number-of-constituents/) · [Sector Diffusion Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/concentration-and-diffusion/sector-diffusion-index/) · [Factor Diffusion Index](https://docs.thefintechbuilder.com/market-breadth-and-internals/concentration-and-diffusion/factor-diffusion-index/)


### D06 — Price Action and Candlesticks · 38 topics

**Candle Foundations** — [Candle Anatomy](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candle-foundations/candle-anatomy/) · [Scale-Aware Body Classification](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candle-foundations/scale-aware-body-classification/) · [Shadow-to-Body Ratio](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candle-foundations/shadow-to-body-ratio/) · [Gap Classification](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candle-foundations/gap-classification/) · [Trend-Context Filter](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candle-foundations/trend-context-filter/)

**Single-Candle Patterns** — [Doji](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/doji/) · [Dragonfly Doji](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/dragonfly-doji/) · [Gravestone Doji](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/gravestone-doji/) · [Marubozu](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/marubozu/) · [Spinning Top](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/spinning-top/) · [Hammer](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/hammer/) · [Hanging Man](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/hanging-man/) · [Inverted Hammer](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/inverted-hammer/) · [Shooting Star](https://docs.thefintechbuilder.com/price-action-and-candlesticks/single-candle-patterns/shooting-star/)

**Two-Candle Patterns** — [Bullish Engulfing](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/bullish-engulfing/) · [Bearish Engulfing](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/bearish-engulfing/) · [Bullish Harami](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/bullish-harami/) · [Bearish Harami](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/bearish-harami/) · [Piercing Line](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/piercing-line/) · [Dark Cloud Cover](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/dark-cloud-cover/) · [Tweezer Top](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/tweezer-top/) · [Tweezer Bottom](https://docs.thefintechbuilder.com/price-action-and-candlesticks/two-candle-patterns/tweezer-bottom/)

**Multi-Candle Patterns** — [Morning Star](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/morning-star/) · [Evening Star](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/evening-star/) · [Three White Soldiers](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/three-white-soldiers/) · [Three Black Crows](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/three-black-crows/) · [Three Inside Up/Down](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/three-inside-up-down/) · [Three Outside Up/Down](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/three-outside-up-down/) · [Abandoned Baby](https://docs.thefintechbuilder.com/price-action-and-candlesticks/multi-candle-patterns/abandoned-baby/)

**Candlestick Scanning and Context** — [Unified Candlestick Pattern Registry](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/unified-candlestick-pattern-registry/) · [Candlestick Pattern Occurrence Contract](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/candlestick-pattern-occurrence-contract/) · [Market-Wide Candlestick Pattern Scanner](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/market-wide-candlestick-pattern-scanner/) · [Contextual Candlestick Confidence Score](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/contextual-candlestick-confidence-score/) · [Support/Resistance Pattern Context](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/support-resistance-pattern-context/) · [Trend, Volatility, and Volume Pattern Context](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/trend-volatility-and-volume-pattern-context/) · [Overlapping-Pattern Conflict Resolver](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/overlapping-pattern-conflict-resolver/) · [Candlestick Confirmation and Invalidation State Machine](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/candlestick-confirmation-and-invalidation-state-machine/) · [Candlestick Scanner Ranking and Deduplication](https://docs.thefintechbuilder.com/price-action-and-candlesticks/candlestick-scanning-and-context/candlestick-scanner-ranking-and-deduplication/)


### D07 — Technical Indicators · 37 topics

**Trend Smoothing** — [Simple Moving Average (SMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/sma/) · [Exponential Moving Average (EMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/ema/) · [Weighted Moving Average (WMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/wma/) · [Wilder RMA](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/wilder-rma/) · [Double Exponential Moving Average (DEMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/dema/) · [Triple Exponential Moving Average (TEMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/tema/) · [Hull MA](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/hull-ma/) · [Kaufman Adaptive Moving Average (KAMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/kama/) · [MESA Adaptive Moving Average (MAMA)](https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/mama/)

**Trend Systems** — [MACD](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/macd/) · [Percentage Price Oscillator (PPO)](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/percentage-price-oscillator/) · [Aroon Up, Down, and Oscillator](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/aroon/) · [Directional Movement](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/directional-movement/) · [Average Directional Index (ADX)](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/adx/) · [Ichimoku Cloud](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/ichimoku-cloud/) · [Parabolic SAR](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/parabolic-sar/) · [Supertrend](https://docs.thefintechbuilder.com/technical-indicators/trend-systems/supertrend/)

**Momentum** — [Relative Strength Index (RSI)](https://docs.thefintechbuilder.com/technical-indicators/momentum/rsi/) · [Stochastic Oscillator](https://docs.thefintechbuilder.com/technical-indicators/momentum/stochastic-oscillator/) · [Stochastic RSI](https://docs.thefintechbuilder.com/technical-indicators/momentum/stochastic-rsi/) · [Williams %R](https://docs.thefintechbuilder.com/technical-indicators/momentum/williams-r/) · [Commodity Channel Index (CCI)](https://docs.thefintechbuilder.com/technical-indicators/momentum/cci/) · [Ultimate Oscillator](https://docs.thefintechbuilder.com/technical-indicators/momentum/ultimate-oscillator/) · [True Strength Index (TSI)](https://docs.thefintechbuilder.com/technical-indicators/momentum/tsi/) · [Connors RSI](https://docs.thefintechbuilder.com/technical-indicators/momentum/connors-rsi/)

**Volatility and Channels** — [True Range](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/true-range/) · [Average True Range (ATR)](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/atr/) · [Bollinger Bands](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/bollinger-bands/) · [Keltner Channels](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/keltner-channels/) · [Donchian Channels](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/donchian-channels/) · [Bollinger BandWidth](https://docs.thefintechbuilder.com/technical-indicators/volatility-and-channels/bollinger-bandwidth/)

**Volume Indicators** — [On-Balance Volume (OBV)](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/obv/) · [Accumulation/Distribution Line](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/accumulation-distribution-line/) · [Chaikin Money Flow](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/chaikin-money-flow/) · [Money Flow Index](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/money-flow-index/) · [Volume Price Trend](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/volume-price-trend/) · [Force Index](https://docs.thefintechbuilder.com/technical-indicators/volume-indicators/force-index/)


### D08 — Geometric Chart Patterns · 37 topics

**Pivots and Levels** — [Causal Pivot Detection](https://docs.thefintechbuilder.com/geometric-chart-patterns/pivots-and-levels/causal-pivot-detection/) · [ZigZag Segmentation](https://docs.thefintechbuilder.com/geometric-chart-patterns/pivots-and-levels/zigzag-segmentation/) · [Support/Resistance Clustering](https://docs.thefintechbuilder.com/geometric-chart-patterns/pivots-and-levels/support-resistance-clustering/) · [Robust Trendline Fitting](https://docs.thefintechbuilder.com/geometric-chart-patterns/pivots-and-levels/robust-trendline-fitting/)

**Reversal Structures** — [Double Top](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/double-top/) · [Double Bottom](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/double-bottom/) · [Triple Top](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/triple-top/) · [Triple Bottom](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/triple-bottom/) · [Head and Shoulders](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/head-and-shoulders/) · [Inverse Head and Shoulders](https://docs.thefintechbuilder.com/geometric-chart-patterns/reversal-structures/inverse-head-and-shoulders/)

**Continuation Structures** — [Ascending Triangle](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/ascending-triangle/) · [Descending Triangle](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/descending-triangle/) · [Symmetrical Triangle](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/symmetrical-triangle/) · [Flag](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/flag/) · [Pennant](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/pennant/) · [Rising/Falling Wedge](https://docs.thefintechbuilder.com/geometric-chart-patterns/continuation-structures/rising-falling-wedge/)

**Pattern Matching** — [Normalized Template Matching](https://docs.thefintechbuilder.com/geometric-chart-patterns/pattern-matching/normalized-template-matching/) · [Dynamic-Time-Warping Pattern Match](https://docs.thefintechbuilder.com/geometric-chart-patterns/pattern-matching/dynamic-time-warping-pattern-match/) · [Matrix-Profile Motif Discovery](https://docs.thefintechbuilder.com/geometric-chart-patterns/pattern-matching/matrix-profile-motif-discovery/) · [Shapelet Pattern Classifier](https://docs.thefintechbuilder.com/geometric-chart-patterns/pattern-matching/shapelet-pattern-classifier/)

**Indicator Divergence Detection** — [Price–Indicator Pivot Alignment](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/price-indicator-pivot-alignment/) · [Regular Bullish/Bearish Divergence Detection](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/regular-bullish-bearish-divergence-detection/) · [Hidden Bullish/Bearish Divergence Detection](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/hidden-bullish-bearish-divergence-detection/) · [Multi-Indicator Divergence Adapters](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/multi-indicator-divergence-adapters/) · [Divergence Strength and Quality Scoring](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/divergence-strength-and-quality-scoring/) · [Divergence Confirmation and Invalidation State Machine](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/divergence-confirmation-and-invalidation-state-machine/) · [Multi-Indicator Divergence Confluence](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/multi-indicator-divergence-confluence/) · [Market-Wide Divergence Scanner and Ranking](https://docs.thefintechbuilder.com/geometric-chart-patterns/indicator-divergence-detection/market-wide-divergence-scanner-and-ranking/)

**Level Confluence and Zone Scoring** — [Price-by-Volume Profile Construction](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/price-by-volume-profile-construction/) · [Point of Control, Value Area, HVN, and LVN Detection](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/poc-value-area-hvn-lvn-detection/) · [Fibonacci Retracement and Extension Projection](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/fibonacci-retracement-extension-projection/) · [Psychological Round-Number Level Generation](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/psychological-round-number-level-generation/) · [Multi-Source Support/Resistance Zone Fusion](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/multi-source-support-resistance-zone-fusion/) · [Support/Resistance Zone Strength and Decay Scoring](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/support-resistance-zone-strength-decay-scoring/) · [Support/Resistance Role-Reversal State Machine](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/support-resistance-role-reversal-state-machine/) · [Breakout and Retest Detection](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/breakout-and-retest-detection/) · [Market-Wide Zone-Proximity Scanner and Ranking](https://docs.thefintechbuilder.com/geometric-chart-patterns/level-confluence-and-zone-scoring/market-wide-zone-proximity-scanner-ranking/)


### D09 — Statistical Time Series · 29 topics

**Diagnostics** — [ACF](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/acf/) · [PACF](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/pacf/) · [Augmented Dickey-Fuller](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/augmented-dickey-fuller/) · [KPSS](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/kpss/) · [Ljung-Box](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/ljung-box/) · [Zivot-Andrews Break Test](https://docs.thefintechbuilder.com/statistical-time-series/diagnostics/zivot-andrews-break-test/)

**Forecast Models** — [AutoReg](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/autoreg/) · [ARMA](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/arma/) · [ARIMA](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/arima/) · [SARIMA/SARIMAX](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/sarima-sarimax/) · [Holt-Winters](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/holt-winters/) · [Theta Forecast](https://docs.thefintechbuilder.com/statistical-time-series/forecast-models/theta-forecast/)

**Multivariate Systems** — [VAR](https://docs.thefintechbuilder.com/statistical-time-series/multivariate-systems/var/) · [Structural VAR](https://docs.thefintechbuilder.com/statistical-time-series/multivariate-systems/structural-var/) · [VECM](https://docs.thefintechbuilder.com/statistical-time-series/multivariate-systems/vecm/) · [Impulse-Response Analysis](https://docs.thefintechbuilder.com/statistical-time-series/multivariate-systems/impulse-response-analysis/) · [Forecast-Error Variance Decomposition](https://docs.thefintechbuilder.com/statistical-time-series/multivariate-systems/forecast-error-variance-decomposition/)

**State and Regime Models** — [Kalman Filter](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/kalman-filter/) · [Extended Kalman Filter](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/extended-kalman-filter/) · [Unscented Kalman Filter](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/unscented-kalman-filter/) · [Hidden Markov Model](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/hidden-markov-model/) · [Markov-Switching Autoregression](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/markov-switching-autoregression/) · [Bayesian Change-Point Detection](https://docs.thefintechbuilder.com/statistical-time-series/state-and-regime-models/bayesian-change-point-detection/)

**Decomposition and Cycles** — [STL Decomposition](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/stl-decomposition/) · [Hodrick-Prescott Filter](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/hodrick-prescott-filter/) · [Baxter-King Filter](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/baxter-king-filter/) · [Christiano-Fitzgerald Filter](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/christiano-fitzgerald-filter/) · [Fast Fourier Transform Periodogram](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/fast-fourier-transform-periodogram/) · [Wavelet Decomposition](https://docs.thefintechbuilder.com/statistical-time-series/decomposition-and-cycles/wavelet-decomposition/)


### D11 — Market Microstructure · 29 topics

**Trade Classification** — [Tick Test](https://docs.thefintechbuilder.com/market-microstructure/trade-classification/tick-test/) · [Quote Test](https://docs.thefintechbuilder.com/market-microstructure/trade-classification/quote-test/) · [Lee-Ready Trade Signing](https://docs.thefintechbuilder.com/market-microstructure/trade-classification/lee-ready-trade-signing/) · [Bulk Volume Classification](https://docs.thefintechbuilder.com/market-microstructure/trade-classification/bulk-volume-classification/)

**Liquidity and Spreads** — [Quoted Spread](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/quoted-spread/) · [Effective Spread](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/effective-spread/) · [Realized Spread](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/realized-spread/) · [Roll Spread Estimator](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/roll-spread-estimator/) · [Amihud Illiquidity Ratio](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/amihud-illiquidity-ratio/) · [Corwin-Schultz Spread Estimator](https://docs.thefintechbuilder.com/market-microstructure/liquidity-and-spreads/corwin-schultz-spread-estimator/)

**Order-Flow and Impact** — [Order Flow Imbalance](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/order-flow-imbalance/) · [Queue Imbalance](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/queue-imbalance/) · [Kyle Lambda](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/kyle-lambda/) · [Hasbrouck Price Impact](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/hasbrouck-price-impact/) · [PIN](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/pin/) · [VPIN](https://docs.thefintechbuilder.com/market-microstructure/order-flow-and-impact/vpin/)

**Order-Book Dynamics** — [Order-Book Slope](https://docs.thefintechbuilder.com/market-microstructure/order-book-dynamics/order-book-slope/) · [Depth-Weighted Midprice](https://docs.thefintechbuilder.com/market-microstructure/order-book-dynamics/depth-weighted-midprice/) · [Microprice](https://docs.thefintechbuilder.com/market-microstructure/order-book-dynamics/microprice/) · [Order-Book Resiliency](https://docs.thefintechbuilder.com/market-microstructure/order-book-dynamics/order-book-resiliency/) · [Hawkes Order-Arrival Model](https://docs.thefintechbuilder.com/market-microstructure/order-book-dynamics/hawkes-order-arrival-model/)

**Market-Depth Analytics** — [Cumulative Bid/Ask Depth](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/cumulative-bid-ask-depth/) · [Top-N Depth Imbalance](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/top-n-depth-imbalance/) · [Depth-at-Distance Profile](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/depth-at-distance-profile/) · [Expected Market-Order Fill Price](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/expected-market-order-fill-price/) · [Multi-Level Sweep Cost and Slippage](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/multi-level-sweep-cost-and-slippage/) · [Liquidity-Wall and Concentration Detection](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/liquidity-wall-and-concentration-detection/) · [Depth Depletion and Replenishment](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/depth-depletion-and-replenishment/) · [Market-Depth Heatmap Aggregation](https://docs.thefintechbuilder.com/market-microstructure/market-depth-analytics/market-depth-heatmap-aggregation/)


### D12 — Matching Engines and Venue Logic · 21 topics

**Continuous Matching** — [Price-Time Priority](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/continuous-matching/price-time-priority/) · [Pro-Rata Matching](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/continuous-matching/pro-rata-matching/) · [Size-Time Priority](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/continuous-matching/size-time-priority/) · [Hybrid Pro-Rata/Time Matching](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/continuous-matching/hybrid-pro-rata-time-matching/)

**Auctions** — [Maximum-Executable-Volume Auction](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/auctions/maximum-executable-volume-auction/) · [Minimum-Imbalance Tie-Break](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/auctions/minimum-imbalance-tie-break/) · [Opening-Cross Price](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/auctions/opening-cross-price/) · [Closing-Cross Price](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/auctions/closing-cross-price/) · [Volatility-Auction Reopening](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/auctions/volatility-auction-reopening/)

**Order Controls** — [Tick-Size Validation](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/tick-size-validation/) · [Price-Band Validation](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/price-band-validation/) · [Self-Trade Prevention](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/self-trade-prevention/) · [Cancel-on-Disconnect](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/cancel-on-disconnect/) · [Fat-Finger Limit](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/fat-finger-limit/) · [Circuit-Breaker Trigger](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-controls/circuit-breaker-trigger/)

**Order Lifecycle and Queue State** — [Limit-Order Lifecycle State Machine](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/limit-order-lifecycle-state-machine/) · [Cancel/Replace Priority Rule](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/cancel-replace-priority-rule/) · [Partial-Fill and Residual-Quantity Processing](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/partial-fill-and-residual-quantity-processing/) · [Queue Position and Ahead-Volume Calculation](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/queue-position-and-ahead-volume-calculation/) · [Iceberg/Reserve-Order Replenishment](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/iceberg-reserve-order-replenishment/) · [Marketable-Order Multi-Level Sweep](https://docs.thefintechbuilder.com/matching-engines-and-venue-logic/order-lifecycle-and-queue-state/marketable-order-multi-level-sweep/)


### D13 — Execution and Transaction Cost Analysis · 9 topics

**Schedule-Based Execution** — [TWAP Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/schedule-based-execution/twap-execution/) · [Historical VWAP Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/schedule-based-execution/historical-vwap-execution/) · [Adaptive VWAP Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/schedule-based-execution/adaptive-vwap-execution/) · [Percentage-of-Volume Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/schedule-based-execution/percentage-of-volume-execution/)

**Cost/Risk Optimization** — [Almgren-Chriss Optimal Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/cost-risk-optimization/almgren-chriss-optimal-execution/) · [Implementation-Shortfall Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/cost-risk-optimization/implementation-shortfall-execution/) · [Arrival-Price Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/cost-risk-optimization/arrival-price-execution/) · [Liquidity-Seeking Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/cost-risk-optimization/liquidity-seeking-execution/) · [Opportunistic Dark-Pool Execution](https://docs.thefintechbuilder.com/execution-and-transaction-cost-analysis/cost-risk-optimization/opportunistic-dark-pool-execution/)


### D21 — Credit Risk and Default · 7 topics

**Probability of Default** — [Logistic PD Model](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/logistic-pd-model/) · [Probit PD Model](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/probit-pd-model/) · [Through-the-Cycle PD](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/through-the-cycle-pd/) · [Point-in-Time PD](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/point-in-time-pd/) · [Merton Distance-to-Default](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/merton-distance-to-default/) · [Campbell-Hilscher-Szilagyi Distress Probability](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/campbell-hilscher-szilagyi-distress-probability/) · [Bharath-Shumway Naive Distance-to-Default](https://docs.thefintechbuilder.com/credit-risk-and-default/probability-of-default/bharath-shumway-naive-distance-to-default/)


### D25 — Digital Assets and On-Chain Finance · 10 topics

**AMM Pricing** — [Constant-Product AMM](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/amm-pricing/constant-product-amm/) · [Constant-Sum AMM](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/amm-pricing/constant-sum-amm/) · [StableSwap Invariant](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/amm-pricing/stableswap-invariant/) · [Weighted-Product AMM](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/amm-pricing/weighted-product-amm/) · [Concentrated-Liquidity Position](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/amm-pricing/concentrated-liquidity-position/)

**Liquidity and Liquidation** — [Impermanent-Loss Calculation](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/liquidity-and-liquidation/impermanent-loss-calculation/) · [Liquidity-Provider Fee APR](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/liquidity-and-liquidation/liquidity-provider-fee-apr/) · [Collateral-Health Factor](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/liquidity-and-liquidation/collateral-health-factor/) · [Liquidation-Price Calculation](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/liquidity-and-liquidation/liquidation-price-calculation/) · [Liquidation Waterfall](https://docs.thefintechbuilder.com/digital-assets-and-on-chain-finance/liquidity-and-liquidation/liquidation-waterfall/)


### D40 — Model Validation and Backtesting · 10 topics

**Classification and Score Validation** — [ROC Curve and ROC-AUC](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/roc-curve-and-roc-auc/) · [Precision-Recall Curve and PR-AUC](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/precision-recall-curve-and-pr-auc/) · [Brier Score](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/brier-score/) · [Log Loss](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/log-loss/) · [Reliability Diagram and Expected Calibration Error](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/reliability-diagram-and-expected-calibration-error/) · [Gains, Lift, and Decile Capture](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/gains-lift-and-decile-capture/) · [Cost-Sensitive Threshold Optimization](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/cost-sensitive-threshold-optimization/) · [Score Stability and Migration Matrix](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/score-stability-and-migration-matrix/) · [Slice-Based Validation by Sector, Country, and Regime](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/slice-based-validation-by-sector-country-and-regime/) · [Rare-Event Backtest and Confidence Bounds](https://docs.thefintechbuilder.com/model-validation-and-backtesting/classification-and-score-validation/rare-event-backtest-and-confidence-bounds/)


### D46 — Earnings and Per-Share Analytics · 5 topics

**Earnings and Share Foundations** — [Stock-Split/Consolidation EPS Restatement](https://docs.thefintechbuilder.com/earnings-and-per-share-analytics/earnings-and-share-foundations/stock-split-consolidation-eps-restatement/) · [Basic EPS](https://docs.thefintechbuilder.com/earnings-and-per-share-analytics/earnings-and-share-foundations/basic-eps/)

**Basic and Diluted EPS** — [If-Converted Convertible-Preference Dilution](https://docs.thefintechbuilder.com/earnings-and-per-share-analytics/basic-and-diluted-eps/if-converted-convertible-preference-dilution/) · [Treasury-Share Method for Options/Warrants](https://docs.thefintechbuilder.com/earnings-and-per-share-analytics/basic-and-diluted-eps/treasury-share-method-for-options-warrants/) · [Contingently Issuable Shares](https://docs.thefintechbuilder.com/earnings-and-per-share-analytics/basic-and-diluted-eps/contingently-issuable-share-inclusion/)
<!-- topics:end -->

## Contributing

Implementations are generated from a catalog and cannot be patched directly in
this repository — see [CONTRIBUTING.md](CONTRIBUTING.md) for how changes flow,
and for the test, build and release workflow.

## License

MIT © Islam Baraka — [The Fintech Builder](https://thefintechbuilder.com)
