# Changelog

All notable changes to `fintech-algorithms` are recorded here.

The package is pre-1.0. Breaking changes go in the minor version, additive and
corrective changes in the patch — so `0.11.0 → 0.12.0` can break you and
`0.12.0 → 0.12.1` cannot.

## 0.13.0 — 2026-08-17

The catalog and the package finally hold the same set. 675 topics across 17
domains, with nothing skipped and nothing held back — the first release where
every algorithm that exists is also one you can install. Nothing is removed:
every subpath published in `0.12.0` still resolves.

| | `0.12.0` | `0.13.0` |
|---|--:|--:|
| Topics | 324 | **675** |
| Domains | 13 | **17** |
| Topics whose arithmetic is asserted on every build | 158 | **601** |
| Topics with a validated `api` contract | 324 / 324 | **675 / 675** |
| Topics with an executed worked example | 324 | **675** |

Technical Indicators is the headline for most people: it shipped 37 of its 137
topics in `0.12.0` and now ships all 137. ALMA, T3, VIDYA, FRAMA, TRIX, Klinger,
the Hilbert and Ehlers cycle tools and the rest are installable for the first
time.

### One thing that can break you

`matching-engines-and-venue-logic/continuous-matching/hybrid-pro-rata-time-matching`
was publishing its family's `calculate(topicId, inputs)` dispatcher as its entry
point, because its slug carries a trailing word its function does not. It now
publishes `hybridProRataTime(incoming, price, lot, fraction, resting)`.

`calculate` is still exported from that subpath, so an import of it keeps
working. What changed is `run`, which now aliases the topic's own function.
If you called `run("D12-F01-A04", inputs)` there, call `calculate` instead — or
better, the named function.

### New

- **Financial Mathematics, Statistics, and Data Foundations** — 120 topics, from
  means and percentiles through distributions, inference, regression, and risk
  and performance statistics. This is the base layer the rest of the library is
  meant to build on, so it lives at the short subpath `foundations/…`. It is
  deliberately absent from the README's algorithm index, which catalogues the
  market-facing topics; it ships, it is documented, and it is in the agent skill.
- **Fundamental Analysis and Valuation** — 52 topics. Discounted cash flow,
  dividend discount and Gordon growth, residual income, economic value added,
  relative valuation, and the distress and earnings-quality models: Altman Z,
  Piotroski F, Beneish M, Ohlson O, Dechow-Dichev, modified Jones. Plus
  integrated and sector-specific equity scoring.
- **Model Validation and Backtesting** — 10 topics. ROC and PR curves, Brier
  score, log loss, calibration and expected calibration error, gains and lift,
  cost-sensitive thresholds, score migration, slice validation, rare-event bounds.
- **Credit Risk and Default** — 7 topics. Logistic and probit PD models,
  through-the-cycle and point-in-time PD, Merton and Bharath-Shumway distance to
  default, Campbell-Hilscher-Szilagyi distress probability.
- **Geometric chart patterns** gains its continuation structures and pattern
  matching families — triangles, flags, pennants, wedges, DTW and matrix profile.
- **152 topics that could not ship now do.** They carried an adapter rather than
  an implementation: a file that started a Python process, piped its input across
  as JSON and returned the answer. Correct, and unusable in a package that
  promises zero dependencies and has to run in a browser. The shared runtime
  behind them is now native TypeScript, and parity was measured rather than
  assumed — 298 full-series cases and three exact EPS cases compared against the
  Python reference observation by observation, 42,435 values, worst relative
  error 1.31e-15. This is what completes Technical Indicators, and it also brings
  the Hilbert and Ehlers cycle analytics, the pivot and market-structure
  families, and the last three EPS topics.

### Verification

The count nearly triples, and the description of it changes with it. These
expected values are computed in the catalog by a Python implementation written
alongside the TypeScript rather than derived from it, which makes the check
**cross-language parity, not an independent third-party figure**. It catches
transcription and generation errors — the failure mode that has actually
occurred here — and it would not catch both implementations sharing a misreading
of the source. The README and the agent skill now say so in those words.

Most of the jump comes from reading two fixture shapes the generator did not
recognise. 102 topics already carried a separate input and expected-output pair
on disk while nothing asserted their numbers, and the 152 ported topics carry a
richer contract again: the warm-up index, every value in the final observation,
and a causality property — that running over a prefix of the bars reproduces
exactly the prefix of the full series, which is what catches an implementation
that has quietly looked ahead. No expected value was authored to close either gap.

### Contributing

`src/` is still generated and still overwritten on every sync, but there are now
two routes for work that used to have none.

- **`optimised/`** — a topic can ship a hand-written implementation from the
  repository instead of the catalog's. The catalog version is emitted beside it
  and a differential test asserts the two return identical values and throw
  identical errors, so an optimisation is reviewable by machine. `npm run bench`
  reports the ratio and CI fails if a recorded one regresses. The first is a
  3.5x rewrite of `calculateSma`.
- **A proposal route for new algorithms.** Assigning a topic its id stays with
  the maintainer; everything after that is a normal pull request, and it can ship
  before the article exists.

See [CONTRIBUTING.md](CONTRIBUTING.md).

### Fixed

- Ninety foundations topics would have published truncated subpaths —
  `count-sum-minimu`, `look-ahead-leaka` — because their folder names were capped
  at 28 characters and no slug was declared.
- Optional parameters were being dropped from the *middle* of published
  signatures, so a caller reading `match(query, candidate, normalize)` and
  passing three arguments was setting `radius`. Seven topics were affected.
- Arrow-form entry points recorded no parameters at all, publishing ten topics as
  zero-argument functions.
- `engines.node` is now `>=22.12`. The `require` condition resolves to an ES
  module and `require(esm)` is only unflagged from 22.12, so anyone on 22.0–22.11
  was inside the declared range and getting a hard failure.
- The bundled lookup CLI reads the `docs.json` beside it before reaching for the
  network, instead of answering from a different version of the library.

### Internal

- A purity gate refuses any implementation that reaches a `node:` builtin,
  directly or through a shared module, and it now checks the whole import graph
  rather than one level. It is what caught the 152 adapter-backed topics before
  they could ship; they were ported rather than exempted, and the gate stays.
- `gen-docs.mjs` counts registry entries independently of the regex that parses
  them. Three times a topic had failed to match on one malformed field and
  vanished from the payload with no symptom.
- Relative imports that climb out of a topic directory are vendored into
  `src/_shared/` generically, replacing a hardcoded case per engine.

## 0.12.0 — 2026-08-06

The library gains no algorithms in this release and loses none: 324 topics
before, 324 after. What changed is the surface in front of them. Every entry
point now has one spelling, every subpath exports exactly its own function, and
every topic carries a validated input contract.

**If you are upgrading from 0.11.0, read the two tables below.** 23 functions
were renamed and 110 re-exports were removed; both fail loudly at import time
rather than silently at run time, but both fail.

### Breaking — entry points renamed to camelCase

23 entry points were still snake_case, inherited from the reference
implementations they were generated from. TypeScript consumers had to remember
which of the 324 were the exceptions. They are now camelCase like the other 301.

| Old symbol | New symbol | Import it from |
| --- | --- | --- |
| `accumulation_distribution_line` | `accumulationDistributionLine` | `fintech-algorithms/technical-indicators/volume-indicators/accumulation-distribution-line` |
| `average_true_range` | `averageTrueRange` | `fintech-algorithms/technical-indicators/volatility-and-channels/atr` |
| `bollinger_bands` | `bollingerBands` | `fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bands` |
| `bollinger_bandwidth` | `bollingerBandwidth` | `fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bandwidth` |
| `chaikin_money_flow` | `chaikinMoneyFlow` | `fintech-algorithms/technical-indicators/volume-indicators/chaikin-money-flow` |
| `connors_rsi` | `connorsRsi` | `fintech-algorithms/technical-indicators/momentum/connors-rsi` |
| `directional_movement` | `directionalMovement` | `fintech-algorithms/technical-indicators/trend-systems/directional-movement` |
| `donchian_channels` | `donchianChannels` | `fintech-algorithms/technical-indicators/volatility-and-channels/donchian-channels` |
| `double_bottom` | `doubleBottom` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/double-bottom` |
| `double_top` | `doubleTop` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/double-top` |
| `force_index` | `forceIndex` | `fintech-algorithms/technical-indicators/volume-indicators/force-index` |
| `head_and_shoulders` | `headAndShoulders` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/head-and-shoulders` |
| `inverse_head_and_shoulders` | `inverseHeadAndShoulders` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/inverse-head-and-shoulders` |
| `keltner_channels` | `keltnerChannels` | `fintech-algorithms/technical-indicators/volatility-and-channels/keltner-channels` |
| `money_flow_index` | `moneyFlowIndex` | `fintech-algorithms/technical-indicators/volume-indicators/money-flow-index` |
| `parabolic_sar` | `parabolicSar` | `fintech-algorithms/technical-indicators/trend-systems/parabolic-sar` |
| `stochastic_rsi` | `stochasticRsi` | `fintech-algorithms/technical-indicators/momentum/stochastic-rsi` |
| `triple_bottom` | `tripleBottom` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/triple-bottom` |
| `triple_top` | `tripleTop` | `fintech-algorithms/geometric-chart-patterns/reversal-structures/triple-top` |
| `true_range` | `trueRange` | `fintech-algorithms/technical-indicators/volatility-and-channels/true-range` |
| `ultimate_oscillator` | `ultimateOscillator` | `fintech-algorithms/technical-indicators/momentum/ultimate-oscillator` |
| `volume_price_trend` | `volumePriceTrend` | `fintech-algorithms/technical-indicators/volume-indicators/volume-price-trend` |
| `williams_r` | `williamsR` | `fintech-algorithms/technical-indicators/momentum/williams-r` |

No other entry point changed. The 301 that were already camelCase are untouched.

### Breaking — subpaths no longer re-export their siblings

28 subpaths used to re-export the other functions in their family: importing
`.../momentum/rsi` also gave you `williams_r`, `connors_rsi`, `stochastic_rsi`
and `ultimate_oscillator`. 110 such re-exports have been removed.

**Why.** A subpath is meant to be one function. Re-exporting siblings meant the
same symbol had several valid import paths, so no import told you which module
you actually depended on, and every family member was pulled in whether or not
it was used.

**The fix.** Import each function from its own subpath — the third column of the
table above. The symbol did not disappear; it stopped being in more than one
place.

Every removed re-export is one of the 23 renamed functions, so a call site
touched by this is usually touched by the rename too:

| Symbol | Was also exported by | Now only at |
| --- | --- | --- |
| `accumulationDistributionLine` | 5 sibling subpaths | `technical-indicators/volume-indicators/accumulation-distribution-line` |
| `averageTrueRange` | 1 sibling subpath | `technical-indicators/volatility-and-channels/atr` |
| `bollingerBands` | 1 sibling subpath | `technical-indicators/volatility-and-channels/bollinger-bands` |
| `chaikinMoneyFlow` | 5 sibling subpaths | `technical-indicators/volume-indicators/chaikin-money-flow` |
| `connorsRsi` | 7 sibling subpaths | `technical-indicators/momentum/connors-rsi` |
| `doubleBottom` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/double-bottom` |
| `doubleTop` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/double-top` |
| `forceIndex` | 5 sibling subpaths | `technical-indicators/volume-indicators/force-index` |
| `headAndShoulders` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/head-and-shoulders` |
| `inverseHeadAndShoulders` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/inverse-head-and-shoulders` |
| `moneyFlowIndex` | 5 sibling subpaths | `technical-indicators/volume-indicators/money-flow-index` |
| `stochasticRsi` | 7 sibling subpaths | `technical-indicators/momentum/stochastic-rsi` |
| `tripleBottom` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/triple-bottom` |
| `tripleTop` | 5 sibling subpaths | `geometric-chart-patterns/reversal-structures/triple-top` |
| `trueRange` | 2 sibling subpaths | `technical-indicators/volatility-and-channels/true-range` |
| `ultimateOscillator` | 7 sibling subpaths | `technical-indicators/momentum/ultimate-oscillator` |
| `volumePriceTrend` | 5 sibling subpaths | `technical-indicators/volume-indicators/volume-price-trend` |
| `williamsR` | 7 sibling subpaths | `technical-indicators/momentum/williams-r` |

### Added — CommonJS can resolve the package

Every entry in the `exports` map now declares a `require` condition alongside
`import`. Both point at the same ES module: there is no second build, the
tarball is the size it was, and there is no dual-package hazard because there is
only ever one copy of a module's state.

```js
const { calculateEma } = require("fintech-algorithms/technical-indicators/trend-smoothing/ema");
```

Previously this failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` — resolution, not
loading, was the blocker: `import` is not a condition `require()` will match.
`require()` of an ES module needs a runtime that supports it, which recent
Node 22 does; the package's `engines` floor is unchanged at `node >= 22`.
Resolves [#1](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/issues/1).

### Added — the payload describes the surface that serves it

`docs.json` (also published at
[`/reference/payload.json`](https://docs.thefintechbuilder.com/reference/payload.json))
moves to **schema 2.0.0**. A consumer holding only the payload can now find the
machine endpoints and map its own data onto the library without reading prose.

- **`package`** gained `type`, `engines`, `license`, the package's own
  `languages` (TypeScript, and only TypeScript), an `entryPoints` block stating
  that the root export is metadata-only and algorithms are subpath-only, and a
  `machineSurface` block naming `/llms.txt`, `/version.json`,
  `/reference/payload.json` and the per-domain and per-topic route patterns.
  These fields flow into
  [`/version.json`](https://docs.thefintechbuilder.com/version.json) unchanged.
- **`archetypes`** is new: the five input shapes as data — topic count, the
  canonical TypeScript input type, a runnable minimal payload, the validator to
  run at the boundary, and the one mistake each shape invites. This is the
  machine half of [the archetypes guide](https://docs.thefintechbuilder.com/guides/archetypes/).
- **`domains[].slug`** is new, so the URL for a domain no longer has to be
  rediscovered by finding one of its topics and splitting the path.

### Changed — `languages` is now `catalogLanguages` (breaking for payload consumers)

Every topic declared `languages: ["typescript", "python"]`. That is true of the
catalog the package is generated from and false of the package, which ships
TypeScript alone — and an agent reading it would confidently write
`pip install fintech-algorithms`, which does not exist.

The per-topic field is renamed to `catalogLanguages` and is now read from the
catalog's actual `implementations/` directories rather than hard-coded. What
*this package* ships is stated once, as `package.languages`.

### Improved

| | 0.11.0 | 0.12.0 |
| --- | --- | --- |
| Topics with a validated `api` contract | 280 / 324 | **324 / 324** |
| Topics with a fixture-verified worked example | 88 | **158** |
| Topics with any worked example | 279 | **324** |

Every `api` block is checked against the implementation it documents at
generation time — a declared parameter list that disagrees with the function's
real signature fails the build. Contract coverage is now enforced in CI, so a
topic can no longer arrive without one.

### Internal

- The generator refuses to emit a payload whose own structure is inconsistent —
  a domain spanning two path roots, or an archetype with no description.
- `gen-docs.mjs` takes `--strict-contracts`.
- CI smoke-tests the packed tarball from CommonJS as well as ESM.
- `CHANGELOG.md` ships inside the tarball.

## 0.11.0 and earlier

Not recorded. `docs.json` inside each published version is the reliable record
of what that version contained; the payload for any release is available at
`https://unpkg.com/fintech-algorithms@<version>/docs.json`.
