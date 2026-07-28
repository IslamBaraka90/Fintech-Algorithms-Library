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

The table below marks which is which. It is an honest split, not a marketing
number: `✓` means the arithmetic is asserted, `–` means the module is proven to
load and expose a callable entry point but its output is not checked here.

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

Import each from `fintech-algorithms/<path>`. `✓` marks arithmetic asserted
against the article's published worked example.

<!-- topics:start -->
### D01 — Market Data Engineering

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Time Bars | Bar Construction | `market-data-engineering/bar-construction/time-bars` | – |
| Tick Bars | Bar Construction | `market-data-engineering/bar-construction/tick-bars` | – |
| Volume Bars | Bar Construction | `market-data-engineering/bar-construction/volume-bars` | – |
| Dollar Bars | Bar Construction | `market-data-engineering/bar-construction/dollar-bars` | – |
| Tick-Imbalance Bars | Bar Construction | `market-data-engineering/bar-construction/tick-imbalance-bars` | – |
| Volume-Imbalance Bars | Bar Construction | `market-data-engineering/bar-construction/volume-imbalance-bars` | – |
| Tick-Run Bars | Bar Construction | `market-data-engineering/bar-construction/tick-run-bars` | – |
| OHLC Consistency Validator | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/ohlc-consistency-validator` | – |
| Hampel Bad-Tick Filter | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter` | – |
| Median Absolute Deviation Outlier Filter | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter` | – |
| Stale-Quote Detector | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/stale-quote-detector` | – |
| Duplicate-Trade Resolver | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/duplicate-trade-resolver` | – |
| Crossed/Locked Market Detector | Cleaning and Validation | `market-data-engineering/cleaning-and-validation/crossed-locked-market-detector` | – |
| Previous-Tick Interpolation | Time Synchronization | `market-data-engineering/time-synchronization/previous-tick-interpolation` | – |
| Linear Quote Interpolation | Time Synchronization | `market-data-engineering/time-synchronization/linear-quote-interpolation` | – |
| Refresh-Time Sampling | Time Synchronization | `market-data-engineering/time-synchronization/refresh-time-sampling` | – |
| Exchange-Calendar Alignment | Time Synchronization | `market-data-engineering/time-synchronization/exchange-calendar-alignment` | – |
| Asynchronous Return Alignment | Time Synchronization | `market-data-engineering/time-synchronization/asynchronous-return-alignment` | – |
| Missing-Bar Gap Classifier | Data Quality | `market-data-engineering/data-quality/missing-bar-gap-classifier` | – |
| Feed-Latency Monitor | Data Quality | `market-data-engineering/data-quality/feed-latency-monitor` | – |
| Price-Source Consensus Check | Data Quality | `market-data-engineering/data-quality/price-source-consensus-check` | – |
| Schema-Drift Detector: Catch Structural and Semantic Contract Changes | Data Quality | `market-data-engineering/data-quality/schema-drift-detector` | – |
| Point-in-Time Availability Guard | Data Quality | `market-data-engineering/data-quality/point-in-time-availability-guard` | – |

### D02 — Corporate Actions and Security Master Data

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Backward Split Adjustment | Adjustment Factors | `corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment` | ✓ |
| Forward Split Adjustment: carry later observations onto an earlier share basis | Adjustment Factors | `corporate-actions-and-security-master-data/adjustment-factors/forward-split-adjustment` | – |
| Cash-Dividend Total-Return Adjustment: From Price Drop to Exact Return | Adjustment Factors | `corporate-actions-and-security-master-data/adjustment-factors/cash-dividend-total-return-adjustment` | – |
| CRSP Cumulative Price Adjustment: Respect the Vendor Basis, Sign, and Gaps | Adjustment Factors | `corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-price-adjustment` | – |
| CRSP Cumulative Share/Volume Adjustment | Adjustment Factors | `corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-share-volume-adjustment` | – |
| Rights-Issue TERP Adjustment | Complex Distributions | `corporate-actions-and-security-master-data/complex-distributions/rights-issue-terp-adjustment` | – |
| Spin-Off Price Adjustment: Separate Parent Price from Distributed Value | Complex Distributions | `corporate-actions-and-security-master-data/complex-distributions/spin-off-price-adjustment` | – |
| Stock-Dividend Adjustment: Convert Price and Quantity Bases Without Inventing Value | Complex Distributions | `corporate-actions-and-security-master-data/complex-distributions/stock-dividend-adjustment` | – |
| Special-Dividend Adjustment: Preserve Return Meaning Across the Ex-Date | Complex Distributions | `corporate-actions-and-security-master-data/complex-distributions/special-dividend-adjustment` | – |
| Return-of-Capital Adjustment: Keep Price, Return, and Tax Views Separate | Complex Distributions | `corporate-actions-and-security-master-data/complex-distributions/return-of-capital-adjustment` | – |
| Permanent Security Identifier Mapping: Scoped, Effective-Dated Crosswalks | Identity Continuity | `corporate-actions-and-security-master-data/identity-continuity/permanent-security-identifier-mapping` | – |
| Ticker-Change Chain Resolution | Identity Continuity | `corporate-actions-and-security-master-data/identity-continuity/ticker-change-chain-resolution` | – |
| Share-Class Relationship Mapping: Same Issuer Does Not Mean Same Security | Identity Continuity | `corporate-actions-and-security-master-data/identity-continuity/share-class-relationship-mapping` | – |
| Merger Predecessor/Successor Mapping: Preserve Identity and Entitlements Without Inventing Continuity | Identity Continuity | `corporate-actions-and-security-master-data/identity-continuity/merger-predecessor-successor-mapping` | – |
| Delisting Return Reconstruction: Separate Observed Proceeds from Estimates | Identity Continuity | `corporate-actions-and-security-master-data/identity-continuity/delisting-return-reconstruction` | – |
| Historical Constituent Reconstruction: Rebuild the Roster Without Looking Ahead | Point-in-Time Universe | `corporate-actions-and-security-master-data/point-in-time-universe/historical-constituent-reconstruction` | – |
| Survivorship-Bias Guard: Keep Historical Failures in the Test | Point-in-Time Universe | `corporate-actions-and-security-master-data/point-in-time-universe/survivorship-bias-guard` | – |
| IPO Availability Timestamping: Separate Listing Events from Research Knowledge | Point-in-Time Universe | `corporate-actions-and-security-master-data/point-in-time-universe/ipo-availability-timestamping` | – |
| Filing-Revision Versioning | Point-in-Time Universe | `corporate-actions-and-security-master-data/point-in-time-universe/filing-revision-versioning` | – |

### D03 — Index and Benchmark Engineering

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Base-Date/Base-Value Initialization | Index Initialization and Continuity | `index-and-benchmark-engineering/index-initialization-and-continuity/base-date-base-value-initialization` | ✓ |
| Index Divisor Initialization | Index Initialization and Continuity | `index-and-benchmark-engineering/index-initialization-and-continuity/index-divisor-initialization` | ✓ |
| Divisor Continuity Adjustment | Index Initialization and Continuity | `index-and-benchmark-engineering/index-initialization-and-continuity/divisor-continuity-adjustment` | ✓ |
| Corporate-Action Divisor Bridge | Index Initialization and Continuity | `index-and-benchmark-engineering/index-initialization-and-continuity/corporate-action-divisor-bridge` | ✓ |
| Intraday Index-Level Calculation | Index Initialization and Continuity | `index-and-benchmark-engineering/index-initialization-and-continuity/intraday-index-level-calculation` | ✓ |
| Price-Weighted Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/price-weighted-index` | ✓ |
| Total-Market-Cap Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/total-market-cap-index` | ✓ |
| Free-Float Market-Cap Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/free-float-market-cap-index` | ✓ |
| Capped Free-Float Market-Cap Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/capped-free-float-market-cap-index` | ✓ |
| Modified Market-Cap Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/modified-market-cap-index` | ✓ |
| Equal-Weight Index | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/equal-weight-index` | ✓ |
| Iterative Cap Redistribution | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/iterative-cap-redistribution` | ✓ |
| Group-Level Capping | Weighting and Capping | `index-and-benchmark-engineering/weighting-and-capping/group-level-capping` | ✓ |
| Fundamental-Weighted Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/fundamental-weighted-index` | ✓ |
| Dividend-Yield-Weighted Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/dividend-yield-weighted-index` | ✓ |
| Factor-Score-Weighted Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/factor-score-weighted-index` | ✓ |
| Minimum-Volatility Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/minimum-volatility-index` | ✓ |
| Equal-Risk-Contribution Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/equal-risk-contribution-index` | ✓ |
| Thematic-Tilt Index | Alternative Weighting | `index-and-benchmark-engineering/alternative-weighting/thematic-tilt-index` | ✓ |
| Price-Return Index | Return Variants | `index-and-benchmark-engineering/return-variants/price-return-index` | ✓ |
| Gross Total-Return Index | Return Variants | `index-and-benchmark-engineering/return-variants/gross-total-return-index` | ✓ |
| Net Total-Return Index | Return Variants | `index-and-benchmark-engineering/return-variants/net-total-return-index` | ✓ |
| Excess-Return Index | Return Variants | `index-and-benchmark-engineering/return-variants/excess-return-index` | ✓ |
| Dividend-Point Index | Return Variants | `index-and-benchmark-engineering/return-variants/dividend-point-index` | ✓ |
| Currency-Converted Index | Return Variants | `index-and-benchmark-engineering/return-variants/currency-converted-index` | ✓ |
| Currency-Hedged Index | Return Variants | `index-and-benchmark-engineering/return-variants/currency-hedged-index` | ✓ |
| Leveraged Daily-Reset Index | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/leveraged-daily-reset-index` | ✓ |
| Inverse Daily-Reset Index | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/inverse-daily-reset-index` | ✓ |
| Volatility-Control Index | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/volatility-control-index` | ✓ |
| Fixed-Decrement Index | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/fixed-decrement-index` | ✓ |
| Percentage-Decrement Index | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/percentage-decrement-index` | ✓ |
| Index-of-Indices | Strategy Indices | `index-and-benchmark-engineering/strategy-indices/index-of-indices` | ✓ |
| Eligibility Screen | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/eligibility-screen` | ✓ |
| Liquidity Screen | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/liquidity-screen` | ✓ |
| Free-Float Factor Calculation | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/free-float-factor-calculation` | ✓ |
| IPO Fast-Entry Rule | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/ipo-fast-entry-rule` | ✓ |
| Reconstitution Algorithm | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/reconstitution-algorithm` | ✓ |
| Rebalancing Algorithm | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/rebalancing-algorithm` | ✓ |
| Turnover Buffer Rule | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/turnover-buffer-rule` | ✓ |
| Index Replication-Cost Estimator | Governance and Maintenance | `index-and-benchmark-engineering/governance-and-maintenance/index-replication-cost-estimator` | ✓ |

### D04 — Market Breadth and Internals

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Net Advances: Count Participation Without Hiding Data Gaps | Advance/Decline Breadth | `market-breadth-and-internals/advance-decline-breadth/net-advances` | – |
| Advance/Decline Ratio: Advancing Issues per Declining Issue | Advance/Decline Breadth | `market-breadth-and-internals/advance-decline-breadth/advance-decline-ratio` | – |
| Cumulative Advance/Decline Line: Recompute History Without Looking Ahead | Advance/Decline Breadth | `market-breadth-and-internals/advance-decline-breadth/cumulative-advance-decline-line` | – |
| Normalized Advance/Decline Line: Cumulative (A-D)/(A+D) Breadth | Advance/Decline Breadth | `market-breadth-and-internals/advance-decline-breadth/normalized-advance-decline-line` | – |
| Absolute Breadth Index | Advance/Decline Breadth | `market-breadth-and-internals/advance-decline-breadth/absolute-breadth-index` | – |
| Traditional McClellan Oscillator: Compare Fast and Slow Raw Breadth | McClellan Family | `market-breadth-and-internals/mcclellan-family/traditional-mcclellan-oscillator` | – |
| Ratio-Adjusted McClellan Oscillator | McClellan Family | `market-breadth-and-internals/mcclellan-family/ratio-adjusted-mcclellan-oscillator` | – |
| Traditional McClellan Summation Index | McClellan Family | `market-breadth-and-internals/mcclellan-family/traditional-mcclellan-summation-index` | – |
| Ratio-Adjusted Summation Index (RASI) | McClellan Family | `market-breadth-and-internals/mcclellan-family/ratio-adjusted-summation-index-rasi` | – |
| McClellan Volume Oscillator | McClellan Family | `market-breadth-and-internals/mcclellan-family/mcclellan-volume-oscillator` | – |
| McClellan Volume Summation Index | McClellan Family | `market-breadth-and-internals/mcclellan-family/mcclellan-volume-summation-index` | – |
| New Highs–New Lows | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/new-highs-new-lows` | – |
| High-Low Ratio | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/high-low-ratio` | – |
| High-Low Index | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/high-low-index` | – |
| Percent Above 20-Day MA | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/percent-above-20-day-ma` | – |
| Percent Above 50-Day MA | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/percent-above-50-day-ma` | – |
| Percent Above 200-Day MA | High/Low and Trend Breadth | `market-breadth-and-internals/high-low-and-trend-breadth/percent-above-200-day-ma` | – |
| Zweig Breadth Thrust | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/zweig-breadth-thrust` | ✓ |
| Arms Index (TRIN) | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/arms-index-trin` | ✓ |
| Advance/Decline Volume Line | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/advance-decline-volume-line` | ✓ |
| Upside/Downside Volume Ratio | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/upside-downside-volume-ratio` | ✓ |
| Cumulative TICK | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/cumulative-tick` | ✓ |
| Breadth-Divergence Detector | Thrust and Pressure | `market-breadth-and-internals/thrust-and-pressure/breadth-divergence-detector` | ✓ |
| Top-N Index Contribution | Concentration and Diffusion | `market-breadth-and-internals/concentration-and-diffusion/top-n-index-contribution` | ✓ |
| Herfindahl Constituent Concentration | Concentration and Diffusion | `market-breadth-and-internals/concentration-and-diffusion/herfindahl-constituent-concentration` | ✓ |
| Effective Number of Constituents | Concentration and Diffusion | `market-breadth-and-internals/concentration-and-diffusion/effective-number-of-constituents` | ✓ |
| Sector Diffusion Index | Concentration and Diffusion | `market-breadth-and-internals/concentration-and-diffusion/sector-diffusion-index` | ✓ |
| Factor Diffusion Index | Concentration and Diffusion | `market-breadth-and-internals/concentration-and-diffusion/factor-diffusion-index` | ✓ |

### D06 — Price Action and Candlesticks

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Candle Anatomy | Candle Foundations | `price-action-and-candlesticks/candle-foundations/candle-anatomy` | – |
| Scale-Aware Body Classification | Candle Foundations | `price-action-and-candlesticks/candle-foundations/scale-aware-body-classification` | – |

### D07 — Technical Indicators

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Simple Moving Average (SMA): Define the Window Before the Mean | Trend Smoothing | `technical-indicators/trend-smoothing/sma` | – |
| Exponential Moving Average (EMA) | Trend Smoothing | `technical-indicators/trend-smoothing/ema` | – |
| Weighted Moving Average (WMA): Newest-Heavy Linear Smoothing | Trend Smoothing | `technical-indicators/trend-smoothing/wma` | – |
| Wilder RMA: SMA-Seeded Alpha 1/n Smoothing | Trend Smoothing | `technical-indicators/trend-smoothing/wilder-rma` | – |
| Double Exponential Moving Average (DEMA): Reduced Lag and Overshoot | Trend Smoothing | `technical-indicators/trend-smoothing/dema` | – |
| Triple Exponential Moving Average (TEMA): Layered Warm-Up and Signed Weights | Trend Smoothing | `technical-indicators/trend-smoothing/tema` | – |
| Hull MA | Trend Smoothing | `technical-indicators/trend-smoothing/hull-ma` | – |
| Kaufman Adaptive Moving Average (KAMA) | Trend Smoothing | `technical-indicators/trend-smoothing/kama` | – |
| MESA Adaptive Moving Average (MAMA) | Trend Smoothing | `technical-indicators/trend-smoothing/mama` | – |
| MACD: Read the Spreads Before You Read the Signals | Trend Systems | `technical-indicators/trend-systems/macd` | – |
| Percentage Price Oscillator (PPO): Normalize the MACD Spread | Trend Systems | `technical-indicators/trend-systems/percentage-price-oscillator` | ✓ |
| Aroon Up, Down, and Oscillator: Measure Extreme Recency | Trend Systems | `technical-indicators/trend-systems/aroon` | ✓ |
| Directional Movement: From True Range to +DI, −DI, and DX | Trend Systems | `technical-indicators/trend-systems/directional-movement` | ✓ |
| Average Directional Index (ADX): Smooth DX Without Inventing Direction | Trend Systems | `technical-indicators/trend-systems/adx` | ✓ |
| Ichimoku Cloud: Separate Range Midpoints from Plot-Time Displacement | Trend Systems | `technical-indicators/trend-systems/ichimoku-cloud` | ✓ |
| Parabolic SAR: Audit the Stop, Extreme Point, and Acceleration Factor | Trend Systems | `technical-indicators/trend-systems/parabolic-sar` | ✓ |
| Supertrend: Trace ATR Bands, Ratchets, and Direction Flips | Trend Systems | `technical-indicators/trend-systems/supertrend` | ✓ |
| Relative Strength Index (RSI) | Momentum | `technical-indicators/momentum/rsi` | ✓ |
| Stochastic Oscillator | Momentum | `technical-indicators/momentum/stochastic-oscillator` | ✓ |
| Stochastic RSI | Momentum | `technical-indicators/momentum/stochastic-rsi` | ✓ |
| Williams %R | Momentum | `technical-indicators/momentum/williams-r` | ✓ |
| Commodity Channel Index (CCI) | Momentum | `technical-indicators/momentum/cci` | ✓ |
| Ultimate Oscillator | Momentum | `technical-indicators/momentum/ultimate-oscillator` | ✓ |
| True Strength Index (TSI) | Momentum | `technical-indicators/momentum/tsi` | ✓ |
| Connors RSI | Momentum | `technical-indicators/momentum/connors-rsi` | ✓ |
| True Range | Volatility and Channels | `technical-indicators/volatility-and-channels/true-range` | ✓ |
| Average True Range (ATR) | Volatility and Channels | `technical-indicators/volatility-and-channels/atr` | ✓ |
| Bollinger Bands | Volatility and Channels | `technical-indicators/volatility-and-channels/bollinger-bands` | ✓ |
| Keltner Channels | Volatility and Channels | `technical-indicators/volatility-and-channels/keltner-channels` | ✓ |
| Donchian Channels | Volatility and Channels | `technical-indicators/volatility-and-channels/donchian-channels` | ✓ |
| Bollinger BandWidth | Volatility and Channels | `technical-indicators/volatility-and-channels/bollinger-bandwidth` | ✓ |
| On-Balance Volume (OBV) | Volume Indicators | `technical-indicators/volume-indicators/obv` | ✓ |
| Accumulation/Distribution Line | Volume Indicators | `technical-indicators/volume-indicators/accumulation-distribution-line` | ✓ |
| Chaikin Money Flow | Volume Indicators | `technical-indicators/volume-indicators/chaikin-money-flow` | ✓ |
| Money Flow Index | Volume Indicators | `technical-indicators/volume-indicators/money-flow-index` | ✓ |
| Volume Price Trend | Volume Indicators | `technical-indicators/volume-indicators/volume-price-trend` | ✓ |
| Force Index | Volume Indicators | `technical-indicators/volume-indicators/force-index` | ✓ |

### D08 — Geometric Chart Patterns

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Causal Pivot Detection | Pivots and Levels | `geometric-chart-patterns/pivots-and-levels/causal-pivot-detection` | – |
| ZigZag Segmentation | Pivots and Levels | `geometric-chart-patterns/pivots-and-levels/zigzag-segmentation` | – |
| Support/Resistance Clustering | Pivots and Levels | `geometric-chart-patterns/pivots-and-levels/support-resistance-clustering` | – |
| Robust Trendline Fitting | Pivots and Levels | `geometric-chart-patterns/pivots-and-levels/robust-trendline-fitting` | – |
| Double Top | Reversal Structures | `geometric-chart-patterns/reversal-structures/double-top` | – |
| Double Bottom | Reversal Structures | `geometric-chart-patterns/reversal-structures/double-bottom` | – |
| Triple Top | Reversal Structures | `geometric-chart-patterns/reversal-structures/triple-top` | – |
| Triple Bottom | Reversal Structures | `geometric-chart-patterns/reversal-structures/triple-bottom` | – |
| Head and Shoulders | Reversal Structures | `geometric-chart-patterns/reversal-structures/head-and-shoulders` | – |
| Inverse Head and Shoulders | Reversal Structures | `geometric-chart-patterns/reversal-structures/inverse-head-and-shoulders` | – |

### D09 — Statistical Time Series

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| ACF | Diagnostics | `statistical-time-series/diagnostics/acf` | – |
| PACF | Diagnostics | `statistical-time-series/diagnostics/pacf` | – |
| Augmented Dickey-Fuller | Diagnostics | `statistical-time-series/diagnostics/augmented-dickey-fuller` | – |
| KPSS | Diagnostics | `statistical-time-series/diagnostics/kpss` | – |
| Ljung-Box | Diagnostics | `statistical-time-series/diagnostics/ljung-box` | – |
| Zivot-Andrews Break Test | Diagnostics | `statistical-time-series/diagnostics/zivot-andrews-break-test` | – |
| AutoReg | Forecast Models | `statistical-time-series/forecast-models/autoreg` | – |
| ARMA | Forecast Models | `statistical-time-series/forecast-models/arma` | – |
| ARIMA | Forecast Models | `statistical-time-series/forecast-models/arima` | – |
| SARIMA/SARIMAX | Forecast Models | `statistical-time-series/forecast-models/sarima-sarimax` | – |
| Holt-Winters | Forecast Models | `statistical-time-series/forecast-models/holt-winters` | – |
| Theta Forecast | Forecast Models | `statistical-time-series/forecast-models/theta-forecast` | – |
| VAR | Multivariate Systems | `statistical-time-series/multivariate-systems/var` | – |
| Structural VAR | Multivariate Systems | `statistical-time-series/multivariate-systems/structural-var` | – |
| VECM | Multivariate Systems | `statistical-time-series/multivariate-systems/vecm` | – |
| Impulse-Response Analysis | Multivariate Systems | `statistical-time-series/multivariate-systems/impulse-response-analysis` | – |
| Forecast-Error Variance Decomposition | Multivariate Systems | `statistical-time-series/multivariate-systems/forecast-error-variance-decomposition` | – |
| Kalman Filter | State and Regime Models | `statistical-time-series/state-and-regime-models/kalman-filter` | – |
| Extended Kalman Filter | State and Regime Models | `statistical-time-series/state-and-regime-models/extended-kalman-filter` | – |
| Unscented Kalman Filter | State and Regime Models | `statistical-time-series/state-and-regime-models/unscented-kalman-filter` | – |
| Hidden Markov Model | State and Regime Models | `statistical-time-series/state-and-regime-models/hidden-markov-model` | – |
| Markov-Switching Autoregression | State and Regime Models | `statistical-time-series/state-and-regime-models/markov-switching-autoregression` | – |
| Bayesian Change-Point Detection | State and Regime Models | `statistical-time-series/state-and-regime-models/bayesian-change-point-detection` | – |

### D46 — Earnings and Per-Share Analytics

| Algorithm | Family | Import from `fintech-algorithms/…` | Verified |
|---|---|---|:--:|
| Stock-Split/Consolidation EPS Restatement | Earnings and Share Foundations | `earnings-and-per-share-analytics/earnings-and-share-foundations/stock-split-consolidation-eps-restatement` | – |
| Basic EPS | Earnings and Share Foundations | `earnings-and-per-share-analytics/earnings-and-share-foundations/basic-eps` | – |
| If-Converted Convertible-Preference Dilution | Basic and Diluted EPS | `earnings-and-per-share-analytics/basic-and-diluted-eps/if-converted-convertible-preference-dilution` | – |
| Treasury-Share Method for Options/Warrants | Basic and Diluted EPS | `earnings-and-per-share-analytics/basic-and-diluted-eps/treasury-share-method-for-options-warrants` | – |
| Contingently Issuable Shares: Current-Conditions EPS Test | Basic and Diluted EPS | `earnings-and-per-share-analytics/basic-and-diluted-eps/contingently-issuable-share-inclusion` | – |
<!-- topics:end -->

## Contributing

Implementations are generated from a catalog and cannot be patched directly in
this repository — see [CONTRIBUTING.md](CONTRIBUTING.md) for how changes flow,
and for the test, build and release workflow.

## License

MIT © Islam Baraka — [The Fintech Builder](https://thefintechbuilder.com)
