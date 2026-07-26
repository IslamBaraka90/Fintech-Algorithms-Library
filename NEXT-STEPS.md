# Follow-up prompt — get `fintech-algorithms` to a publishable 1.0

Paste everything from **"START OF PROMPT"** onward into a fresh session opened at
`C:\Users\islam\Node\edufintech`.

---

## START OF PROMPT

You are continuing work on `fintech-algorithms`, a generated npm package at
`library-repos/Fintech-Algorithms-Library` inside the `edufintech` monorepo. Read
`README.md`, `HANDOFF.md` and `scripts/sync.mjs` before changing anything.

### What the package is

A TypeScript library of **154 fintech algorithm topics**, generated from the
teaching catalog at `algorithms/domains/**` by `scripts/sync.mjs`. Everything under
`src/` except `src/_shared/` is generated — **never hand-edit it**. Fix the catalog
implementation and re-run `npm run sync`.

Locked design decisions (do not revisit without asking):

- Each topic is a **subpath module whose path equals its article URL path**, e.g.
  `fintech-algorithms/technical-indicators/momentum/williams-r`. This is why the
  63 topics that all export `calculate` never collide.
- The **root export carries metadata only** (registry + lookup helpers + lazy
  `load`/`runner`), never algorithm code.
- **No data provider, no `node:fs`, no runtime dependencies, ever.** Algorithms
  take plain arrays and plain objects. A user's provider adapter is their own code.
- Every topic module re-exports its implementation, plus a uniform `run` alias for
  its primary function and a `meta` object.
- No demos or examples in the package; worked applications live in their own repos
  (see `library-repos/Fintech-Market-Breadth-Dashboard`).

### Current state — verified, do not re-derive

- **154 topics**, 7 domains, 27 families. 3 catalog topics are skipped for having
  no TypeScript implementation: `D46-F01-A06`, `D46-F01-A07`, `D46-F02-A01`.
- `npm run build` (tsc) is **clean, 0 errors**.
- `npm test` reports **201 passing, 0 failing** — but see Task 1: that green is
  partly false.
- Conformance coverage is **41/154**.
- Version `0.1.0`. **Never published.** The npm name `fintech-algorithms` was
  checked and is **available** (so is `@fintechbuilder/algorithms`).
- No git remote configured. Latest commit `4a2275e`.
- ⚠️ The `edufintech` monorepo's `.git/` directory is **empty** — the catalog is
  not under version control. Catalog edits have no undo. Consider fixing that
  first; ask before running `git init` there.

### Tasks, in priority order

---

#### Task 1 — Fix 13 wrong `run()` aliases (BLOCKS PUBLISHING)

The newest catalog families ship **one shared implementation file per family**,
copied into every topic folder in that family:

| Family | Shared file | Topic folders holding a copy |
|---|---|--:|
| `D07-F03` momentum | `momentum.ts` | 8 |
| `D07-F04` volatility and channels | `volatility_channels.ts` | 6 |
| `D07-F05` volume indicators | `volume.ts` | 6 |

`chooseEntry()` in `scripts/sync.mjs` therefore falls through to `functions[0]`, so
every momentum topic reports `rsi()` and every volume topic reports `obv()`. These
13 topics currently expose the **wrong function** as `run()` and as `meta.entry`:

| Topic | Slug | `run()` calls | Should call |
|---|---|---|---|
| D07-F03-A02 | stochastic-oscillator | `rsi` | `stochastic` |
| D07-F03-A03 | stochastic-rsi | `rsi` | `stochastic_rsi` |
| D07-F03-A04 | williams-r | `rsi` | `williams_r` |
| D07-F03-A06 | ultimate-oscillator | `rsi` | `ultimate_oscillator` |
| D07-F03-A08 | connors-rsi | `rsi` | `connors_rsi` |
| D07-F04-A02 | atr | `true_range` | `average_true_range` |
| D07-F04-A04 | keltner-channels | `true_range` | `keltner_channels` |
| D07-F04-A06 | bollinger-bandwidth | `bollinger_bands` | `bollinger_bandwidth` |
| D07-F05-A02 | accumulation-distribution-line | `obv` | `accumulation_distribution_line` |
| D07-F05-A03 | chaikin-money-flow | `obv` | `chaikin_money_flow` |
| D07-F05-A04 | money-flow-index | `obv` | `money_flow_index` |
| D07-F05-A05 | volume-price-trend | `obv` | `volume_price_trend` |
| D07-F05-A06 | force-index | `obv` | `force_index` |

**The authoritative entry name is recoverable from the catalog itself.** Each
topic's own test at `<topic>/tests/*.test.ts` imports the module under an alias and
invokes exactly one of its exported functions. Intersecting the implementation's
exported function names with the names invoked in that test resolves all 28 D07
topics correctly. All 28 catalog suites pass, so those calls are trustworthy.

Rewrite `chooseEntry()` to try, in order:

1. **The function invoked by the topic's own test file** (highest confidence).
2. `snake_case(slug)` — covers `williams_r`, `money_flow_index`, `force_index`.
3. The slug's **initials** — covers `rsi`, `cci`, `tsi`, `obv`, `adx`, `ppo`.
4. Slug with a trailing generic noun dropped (`oscillator`, `index`, `line`,
   `bands`, `channels`) — covers `stochastic-oscillator` → `stochastic`.
5. The existing camelCase / verb-prefix heuristics.
6. **Fail loudly.** If nothing resolves, `sync.mjs` must exit non-zero listing the
   unresolved topics. Silently guessing `functions[0]` is what produced this bug.

Also emit a warning when several topics in one family resolve to the same entry —
that is the fingerprint of this failure.

#### Task 2 — Make the test suite able to catch Task 1

`test/registry.test.ts` asserts `mod.run === mod[t.entry]`. Both sides come from
the same detection, so it only ever proves self-consistency and passed happily with
all 13 defects in place. Add an assertion that ties the entry to the topic's
**identity**, not to itself: for every topic, `meta.entry` must match the slug under
one of the rules in Task 1, or appear on an explicit reviewed allow-list in the
repo. A new mis-detection must turn the suite red.

#### Task 3 — De-duplicate the shared family implementations

`momentum.ts`, `volatility_channels.ts` and `volume.ts` are each vendored 8/6/6
times, so ~20 copies of three file bodies ship in the package. Extend the
`src/_shared/` mechanism already used for `indexEngine.ts`: when N topics in a
family share one implementation body, emit it once under
`src/_shared/<family>.ts` and have each topic's `index.ts` re-export only its own
entry (plus the types it needs) from there. Keep the public subpath API byte-identical —
this is an internal layout change and must not alter any import path or export name.
Verify with a diff of the emitted `package.json` `exports` map before and after.

#### Task 4 — Raise conformance coverage from 41/154

Only 41 topics have a `{ input, expected }` worked example that the harness can
run. The rest are unverified arithmetic in this package (they do have passing tests
in the catalog, which this repo cannot consume). Three fixture conventions exist:

| Convention | Shape | Where |
|---|---|---|
| A | `{ topicId, input, expected }` | the 41 already covered |
| B | `{ label, parameters, rows, expected }` in `datasets/canonical-fixture.json` | D04-F04, D04-F05 |
| C | `{ topic_id, parameters, checkpoints }` + `datasets/<slug>-fixtures.json` with `bars` | all 27 new D07 topics |

Add adapters for B and C to `test/conformance.test.ts` and have `sync.mjs` record
which convention each topic uses in `test/_manifest.json`. Convention C is the
biggest single win — 27 topics, each with a `bars` array and `checkpoints` carrying
per-index expected values. Target: **120+/154 verified**. Report the honest number.

#### Task 5 — Refresh the docs, then publish

`README.md` still says 114 topics, 7 domains, 22 families, 161 tests — all stale.
Regenerate those numbers from the registry rather than hand-editing, so they cannot
drift again. Then:

1. `npm run verify` must be fully green.
2. `npm pack --dry-run` — check the file list.
3. Install the tarball into a scratch project and confirm a subpath import plus
   `runner("D07-F03-A04")` returns `williams_r`, not `rsi`.
4. Bump to `1.0.0` only once Tasks 1–4 are done. **Ask before `npm publish`** and
   before creating the GitHub repo — both are public and irreversible.

### How to work

- Verify claims by running things; do not assert a fix works without evidence.
- After any change to `scripts/sync.mjs`: `npm run sync && npm run build && npm test`,
  and confirm `node scripts/sync.mjs --check` reports in-sync.
- When the catalog itself is wrong, fix it in `algorithms/domains/**` so the
  articles and the standalone repos benefit — then re-sync. Past examples: duplicate
  interface members in `treasuryShare.ts`, `\Z` in a regex, extensionless imports in
  D04-F04/F05 tests. Note in your summary whenever you change the catalog, since it
  has no version control.
- Do not add a data provider, a demo, or a runtime dependency to this package.

## END OF PROMPT

---

## Appendix — quick commands

```bash
cd library-repos/Fintech-Algorithms-Library
node scripts/sync.mjs --check     # is the package in step with the catalog?
npm run sync                       # regenerate src/ from the catalog
npm run build                      # tsc -> dist/
npm test                           # conformance + module + structural
```

Inspect a topic's real surface:

```bash
grep -nE "^export (function|const|type|interface)" \
  src/technical-indicators/momentum/williams-r/impl.ts
```

Reproduce the Task 1 defect list:

```bash
node --experimental-strip-types -e 'import { topic } from "./src/index.ts"; console.log(topic("D07-F03-A04"))'
```
