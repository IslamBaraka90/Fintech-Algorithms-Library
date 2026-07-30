# fintech-algorithms

[![npm](https://img.shields.io/npm/v/fintech-algorithms.svg)](https://www.npmjs.com/package/fintech-algorithms)
[![CI](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/actions/workflows/ci.yml/badge.svg)](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/npm/l/fintech-algorithms.svg)](LICENSE)

**Corporate actions, index construction, market breadth, bar construction and
technical indicators — as plain TypeScript functions with zero dependencies.**

Split and dividend adjustment factors, capped free-float index weighting,
McClellan breadth internals, dollar and imbalance bars, and the usual moving
averages. Most npm packages in this space stop at indicators; the harder
back-office arithmetic is the reason this one exists.

```bash
npm install fintech-algorithms
```

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
**79 of 187 topics** are verified against the catalog's own published numbers
(41 via `{ input, expected }`, 11 via row fixtures, 27 via bar/checkpoint fixtures).
The remaining 108 are proven to load and expose a callable entry point, but their
arithmetic is not asserted here — those topics ship no machine-readable expected
values in the catalog.
<!-- coverage:end -->

Every algorithm accompanies a published article that walks through a worked
example by hand. Where that article ships machine-readable numbers, the test
suite replays them and asserts the output matches exactly — so a green run means
the package, the article and the standalone repo agree on the arithmetic.

It is an honest split, not a marketing number. Each algorithm's
[reference page](https://islambaraka90.github.io/fintech-algorithms-docs) states
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
| `record-transform` | `(input) → output` | 122 | backward-split-adjustment |
| `series-transform` | `(values, ...params) → (number\|null)[]` | 37 | ema, rsi, macd |
| `row-classify` | `(rows, config?) → verdict[]` | 15 | ohlc-consistency-validator |
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
**187 topics** · 9 domains · 33 families

| Domain | Topics | Families | Name |
|---|--:|--:|---|
| D01 | 23 | 4 | Market Data Engineering |
| D02 | 19 | 4 | Corporate Actions and Security Master Data |
| D03 | 40 | 6 | Index and Benchmark Engineering |
| D04 | 28 | 5 | Market Breadth and Internals |
| D06 | 2 | 1 | Price Action and Candlesticks |
| D07 | 37 | 5 | Technical Indicators |
| D08 | 10 | 2 | Geometric Chart Patterns |
| D09 | 23 | 4 | Statistical Time Series |
| D46 | 5 | 2 | Earnings and Per-Share Analytics |
<!-- stats:end -->

## Every algorithm

Each name links to its reference page — signature, worked example, verification
tier, diagrams and source.

**[Full reference for all 187 algorithms →](https://islambaraka90.github.io/fintech-algorithms-docs)**

<!-- topics:start -->
### D01 — Market Data Engineering · 23 topics

**Bar Construction** — [Time Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/time-bars/) · [Tick Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/tick-bars/) · [Volume Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/volume-bars/) · [Dollar Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/dollar-bars/) · [Tick-Imbalance Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/tick-imbalance-bars/) · [Volume-Imbalance Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/volume-imbalance-bars/) · [Tick-Run Bars](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/bar-construction/tick-run-bars/)

**Cleaning and Validation** — [OHLC Consistency Validator](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator/) · [Hampel Bad-Tick Filter](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter/) · [Median Absolute Deviation Outlier Filter](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter/) · [Stale-Quote Detector](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/stale-quote-detector/) · [Duplicate-Trade Resolver](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver/) · [Crossed/Locked Market Detector](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/cleaning-and-validation/crossed-locked-market-detector/)

**Time Synchronization** — [Previous-Tick Interpolation](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/time-synchronization/previous-tick-interpolation/) · [Linear Quote Interpolation](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/time-synchronization/linear-quote-interpolation/) · [Refresh-Time Sampling](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/time-synchronization/refresh-time-sampling/) · [Exchange-Calendar Alignment](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/time-synchronization/exchange-calendar-alignment/) · [Asynchronous Return Alignment](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/time-synchronization/asynchronous-return-alignment/)

**Data Quality** — [Missing-Bar Gap Classifier](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/data-quality/missing-bar-gap-classifier/) · [Feed-Latency Monitor](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/data-quality/feed-latency-monitor/) · [Price-Source Consensus Check](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/data-quality/price-source-consensus-check/) · [Schema-Drift Detector](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/data-quality/schema-drift-detector/) · [Point-in-Time Availability Guard](https://islambaraka90.github.io/fintech-algorithms-docs/market-data-engineering/data-quality/point-in-time-availability-guard/)


### D02 — Corporate Actions and Security Master Data · 19 topics

**Adjustment Factors** — [Backward Split Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment/) · [Forward Split Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/adjustment-factors/forward-split-adjustment/) · [Cash-Dividend Total-Return Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/adjustment-factors/cash-dividend-total-return-adjustment/) · [CRSP Cumulative Price Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-price-adjustment/) · [CRSP Cumulative Share/Volume Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-share-volume-adjustment/)

**Complex Distributions** — [Rights-Issue TERP Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/complex-distributions/rights-issue-terp-adjustment/) · [Spin-Off Price Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/complex-distributions/spin-off-price-adjustment/) · [Stock-Dividend Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/complex-distributions/stock-dividend-adjustment/) · [Special-Dividend Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/complex-distributions/special-dividend-adjustment/) · [Return-of-Capital Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/complex-distributions/return-of-capital-adjustment/)

**Identity Continuity** — [Permanent Security Identifier Mapping](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/identity-continuity/permanent-security-identifier-mapping/) · [Ticker-Change Chain Resolution](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/identity-continuity/ticker-change-chain-resolution/) · [Share-Class Relationship Mapping](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/identity-continuity/share-class-relationship-mapping/) · [Merger Predecessor/Successor Mapping](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/identity-continuity/merger-predecessor-successor-mapping/) · [Delisting Return Reconstruction](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/identity-continuity/delisting-return-reconstruction/)

**Point-in-Time Universe** — [Historical Constituent Reconstruction](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/point-in-time-universe/historical-constituent-reconstruction/) · [Survivorship-Bias Guard](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/point-in-time-universe/survivorship-bias-guard/) · [IPO Availability Timestamping](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/point-in-time-universe/ipo-availability-timestamping/) · [Filing-Revision Versioning](https://islambaraka90.github.io/fintech-algorithms-docs/corporate-actions-and-security-master-data/point-in-time-universe/filing-revision-versioning/)


### D03 — Index and Benchmark Engineering · 40 topics

**Index Initialization and Continuity** — [Base-Date/Base-Value Initialization](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/index-initialization-and-continuity/base-date-base-value-initialization/) · [Index Divisor Initialization](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/index-initialization-and-continuity/index-divisor-initialization/) · [Divisor Continuity Adjustment](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/index-initialization-and-continuity/divisor-continuity-adjustment/) · [Corporate-Action Divisor Bridge](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/index-initialization-and-continuity/corporate-action-divisor-bridge/) · [Intraday Index-Level Calculation](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/index-initialization-and-continuity/intraday-index-level-calculation/)

**Weighting and Capping** — [Price-Weighted Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/price-weighted-index/) · [Total-Market-Cap Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/total-market-cap-index/) · [Free-Float Market-Cap Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/free-float-market-cap-index/) · [Capped Free-Float Market-Cap Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/capped-free-float-market-cap-index/) · [Modified Market-Cap Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/modified-market-cap-index/) · [Equal-Weight Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/equal-weight-index/) · [Iterative Cap Redistribution](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/iterative-cap-redistribution/) · [Group-Level Capping](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/weighting-and-capping/group-level-capping/)

**Alternative Weighting** — [Fundamental-Weighted Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/fundamental-weighted-index/) · [Dividend-Yield-Weighted Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/dividend-yield-weighted-index/) · [Factor-Score-Weighted Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/factor-score-weighted-index/) · [Minimum-Volatility Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/minimum-volatility-index/) · [Equal-Risk-Contribution Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/equal-risk-contribution-index/) · [Thematic-Tilt Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/alternative-weighting/thematic-tilt-index/)

**Return Variants** — [Price-Return Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/price-return-index/) · [Gross Total-Return Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/gross-total-return-index/) · [Net Total-Return Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/net-total-return-index/) · [Excess-Return Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/excess-return-index/) · [Dividend-Point Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/dividend-point-index/) · [Currency-Converted Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/currency-converted-index/) · [Currency-Hedged Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/return-variants/currency-hedged-index/)

**Strategy Indices** — [Leveraged Daily-Reset Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/leveraged-daily-reset-index/) · [Inverse Daily-Reset Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/inverse-daily-reset-index/) · [Volatility-Control Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/volatility-control-index/) · [Fixed-Decrement Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/fixed-decrement-index/) · [Percentage-Decrement Index](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/percentage-decrement-index/) · [Index-of-Indices](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/strategy-indices/index-of-indices/)

**Governance and Maintenance** — [Eligibility Screen](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/eligibility-screen/) · [Liquidity Screen](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/liquidity-screen/) · [Free-Float Factor Calculation](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/free-float-factor-calculation/) · [IPO Fast-Entry Rule](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/ipo-fast-entry-rule/) · [Reconstitution Algorithm](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/reconstitution-algorithm/) · [Rebalancing Algorithm](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/rebalancing-algorithm/) · [Turnover Buffer Rule](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/turnover-buffer-rule/) · [Index Replication-Cost Estimator](https://islambaraka90.github.io/fintech-algorithms-docs/index-and-benchmark-engineering/governance-and-maintenance/index-replication-cost-estimator/)


### D04 — Market Breadth and Internals · 28 topics

**Advance/Decline Breadth** — [Net Advances](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/advance-decline-breadth/net-advances/) · [Advance/Decline Ratio](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/advance-decline-breadth/advance-decline-ratio/) · [Cumulative Advance/Decline Line](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/advance-decline-breadth/cumulative-advance-decline-line/) · [Normalized Advance/Decline Line](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/advance-decline-breadth/normalized-advance-decline-line/) · [Absolute Breadth Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/advance-decline-breadth/absolute-breadth-index/)

**McClellan Family** — [Traditional McClellan Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/traditional-mcclellan-oscillator/) · [Ratio-Adjusted McClellan Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/ratio-adjusted-mcclellan-oscillator/) · [Traditional McClellan Summation Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/traditional-mcclellan-summation-index/) · [Ratio-Adjusted Summation Index (RASI)](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/ratio-adjusted-summation-index-rasi/) · [McClellan Volume Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/mcclellan-volume-oscillator/) · [McClellan Volume Summation Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/mcclellan-family/mcclellan-volume-summation-index/)

**High/Low and Trend Breadth** — [New Highs–New Lows](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/new-highs-new-lows/) · [High-Low Ratio](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/high-low-ratio/) · [High-Low Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/high-low-index/) · [Percent Above 20-Day MA](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-20-day-ma/) · [Percent Above 50-Day MA](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-50-day-ma/) · [Percent Above 200-Day MA](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-200-day-ma/)

**Thrust and Pressure** — [Zweig Breadth Thrust](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/zweig-breadth-thrust/) · [Arms Index (TRIN)](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/arms-index-trin/) · [Advance/Decline Volume Line](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/advance-decline-volume-line/) · [Upside/Downside Volume Ratio](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/upside-downside-volume-ratio/) · [Cumulative TICK](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/cumulative-tick/) · [Breadth-Divergence Detector](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/thrust-and-pressure/breadth-divergence-detector/)

**Concentration and Diffusion** — [Top-N Index Contribution](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/concentration-and-diffusion/top-n-index-contribution/) · [Herfindahl Constituent Concentration](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/concentration-and-diffusion/herfindahl-constituent-concentration/) · [Effective Number of Constituents](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/concentration-and-diffusion/effective-number-of-constituents/) · [Sector Diffusion Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/concentration-and-diffusion/sector-diffusion-index/) · [Factor Diffusion Index](https://islambaraka90.github.io/fintech-algorithms-docs/market-breadth-and-internals/concentration-and-diffusion/factor-diffusion-index/)


### D06 — Price Action and Candlesticks · 2 topics

**Candle Foundations** — [Candle Anatomy](https://islambaraka90.github.io/fintech-algorithms-docs/price-action-and-candlesticks/candle-foundations/candle-anatomy/) · [Scale-Aware Body Classification](https://islambaraka90.github.io/fintech-algorithms-docs/price-action-and-candlesticks/candle-foundations/scale-aware-body-classification/)


### D07 — Technical Indicators · 37 topics

**Trend Smoothing** — [Simple Moving Average (SMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/sma/) · [Exponential Moving Average (EMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/ema/) · [Weighted Moving Average (WMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/wma/) · [Wilder RMA](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/wilder-rma/) · [Double Exponential Moving Average (DEMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/dema/) · [Triple Exponential Moving Average (TEMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/tema/) · [Hull MA](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/hull-ma/) · [Kaufman Adaptive Moving Average (KAMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/kama/) · [MESA Adaptive Moving Average (MAMA)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-smoothing/mama/)

**Trend Systems** — [MACD](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/macd/) · [Percentage Price Oscillator (PPO)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/percentage-price-oscillator/) · [Aroon Up, Down, and Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/aroon/) · [Directional Movement](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/directional-movement/) · [Average Directional Index (ADX)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/adx/) · [Ichimoku Cloud](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/ichimoku-cloud/) · [Parabolic SAR](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/parabolic-sar/) · [Supertrend](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/trend-systems/supertrend/)

**Momentum** — [Relative Strength Index (RSI)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/rsi/) · [Stochastic Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/stochastic-oscillator/) · [Stochastic RSI](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/stochastic-rsi/) · [Williams %R](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/williams-r/) · [Commodity Channel Index (CCI)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/cci/) · [Ultimate Oscillator](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/ultimate-oscillator/) · [True Strength Index (TSI)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/tsi/) · [Connors RSI](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/momentum/connors-rsi/)

**Volatility and Channels** — [True Range](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/true-range/) · [Average True Range (ATR)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/atr/) · [Bollinger Bands](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/bollinger-bands/) · [Keltner Channels](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/keltner-channels/) · [Donchian Channels](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/donchian-channels/) · [Bollinger BandWidth](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volatility-and-channels/bollinger-bandwidth/)

**Volume Indicators** — [On-Balance Volume (OBV)](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/obv/) · [Accumulation/Distribution Line](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/accumulation-distribution-line/) · [Chaikin Money Flow](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/chaikin-money-flow/) · [Money Flow Index](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/money-flow-index/) · [Volume Price Trend](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/volume-price-trend/) · [Force Index](https://islambaraka90.github.io/fintech-algorithms-docs/technical-indicators/volume-indicators/force-index/)


### D08 — Geometric Chart Patterns · 10 topics

**Pivots and Levels** — [Causal Pivot Detection](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/pivots-and-levels/causal-pivot-detection/) · [ZigZag Segmentation](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/pivots-and-levels/zigzag-segmentation/) · [Support/Resistance Clustering](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/pivots-and-levels/support-resistance-clustering/) · [Robust Trendline Fitting](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/pivots-and-levels/robust-trendline-fitting/)

**Reversal Structures** — [Double Top](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/double-top/) · [Double Bottom](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/double-bottom/) · [Triple Top](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/triple-top/) · [Triple Bottom](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/triple-bottom/) · [Head and Shoulders](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/head-and-shoulders/) · [Inverse Head and Shoulders](https://islambaraka90.github.io/fintech-algorithms-docs/geometric-chart-patterns/reversal-structures/inverse-head-and-shoulders/)


### D09 — Statistical Time Series · 23 topics

**Diagnostics** — [ACF](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/acf/) · [PACF](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/pacf/) · [Augmented Dickey-Fuller](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/augmented-dickey-fuller/) · [KPSS](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/kpss/) · [Ljung-Box](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/ljung-box/) · [Zivot-Andrews Break Test](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/diagnostics/zivot-andrews-break-test/)

**Forecast Models** — [AutoReg](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/autoreg/) · [ARMA](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/arma/) · [ARIMA](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/arima/) · [SARIMA/SARIMAX](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/sarima-sarimax/) · [Holt-Winters](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/holt-winters/) · [Theta Forecast](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/forecast-models/theta-forecast/)

**Multivariate Systems** — [VAR](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/multivariate-systems/var/) · [Structural VAR](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/multivariate-systems/structural-var/) · [VECM](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/multivariate-systems/vecm/) · [Impulse-Response Analysis](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/multivariate-systems/impulse-response-analysis/) · [Forecast-Error Variance Decomposition](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/multivariate-systems/forecast-error-variance-decomposition/)

**State and Regime Models** — [Kalman Filter](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/kalman-filter/) · [Extended Kalman Filter](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/extended-kalman-filter/) · [Unscented Kalman Filter](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/unscented-kalman-filter/) · [Hidden Markov Model](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/hidden-markov-model/) · [Markov-Switching Autoregression](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/markov-switching-autoregression/) · [Bayesian Change-Point Detection](https://islambaraka90.github.io/fintech-algorithms-docs/statistical-time-series/state-and-regime-models/bayesian-change-point-detection/)


### D46 — Earnings and Per-Share Analytics · 5 topics

**Earnings and Share Foundations** — [Stock-Split/Consolidation EPS Restatement](https://islambaraka90.github.io/fintech-algorithms-docs/earnings-and-per-share-analytics/earnings-and-share-foundations/stock-split-consolidation-eps-restatement/) · [Basic EPS](https://islambaraka90.github.io/fintech-algorithms-docs/earnings-and-per-share-analytics/earnings-and-share-foundations/basic-eps/)

**Basic and Diluted EPS** — [If-Converted Convertible-Preference Dilution](https://islambaraka90.github.io/fintech-algorithms-docs/earnings-and-per-share-analytics/basic-and-diluted-eps/if-converted-convertible-preference-dilution/) · [Treasury-Share Method for Options/Warrants](https://islambaraka90.github.io/fintech-algorithms-docs/earnings-and-per-share-analytics/basic-and-diluted-eps/treasury-share-method-for-options-warrants/) · [Contingently Issuable Shares](https://islambaraka90.github.io/fintech-algorithms-docs/earnings-and-per-share-analytics/basic-and-diluted-eps/contingently-issuable-share-inclusion/)
<!-- topics:end -->

## Contributing

Implementations are generated from a catalog and cannot be patched directly in
this repository — see [CONTRIBUTING.md](CONTRIBUTING.md) for how changes flow,
and for the test, build and release workflow.

## License

MIT © Islam Baraka — [The Fintech Builder](https://thefintechbuilder.com)
