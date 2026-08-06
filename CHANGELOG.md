# Changelog

All notable changes to `fintech-algorithms` are recorded here.

The package is pre-1.0. Breaking changes go in the minor version, additive and
corrective changes in the patch — so `0.11.0 → 0.12.0` can break you and
`0.12.0 → 0.12.1` cannot.

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
