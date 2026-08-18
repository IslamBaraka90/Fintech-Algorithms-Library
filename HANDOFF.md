# Handoff — `fintech-algorithms`

How to run the library, consume it from another project, keep it in step with the
catalog, and publish it. If you are contributing rather than operating, read
[CONTRIBUTING.md](CONTRIBUTING.md) instead — it covers the four routes in.

---

## 0. What this is

A generated package. The catalog at `edufintech/algorithms/domains/**` is the
single source of truth; [`scripts/sync.mjs`](scripts/sync.mjs) reads it and emits
almost everything here.

| Path | What it is | Hand-written? |
|---|---|---|
| `scripts/` | The generator, the docs builder, the example capture | yes |
| `test/*.test.ts` | The four test layers | yes |
| `bench/` | Benchmark runner and recorded ratios | yes |
| `optimised/` | Hand-written implementations that ship instead of the catalog's | yes |
| `skills/` | The agent skill that ships inside the package | yes |
| `src/**` | Every topic module, the registry, the loader map, vendored engines | generated |
| `test/fixtures/` | Fixtures copied from the catalog | generated |
| `docs.json` | The reference payload the docs site builds from | generated |
| `package.json` exports | One subpath per topic, plus the root | generated |

**Everything under `src/` is generated, including `src/_shared/`.** `sync.mjs`
deletes `src/` and `test/fixtures/` before it writes, so a hand edit there is
gone on the next run. Fix the catalog and re-sync.

### Current state

- **675 topics** across 17 domains and 82 families
- **601 verified** — arithmetic replayed and asserted on every build; 74 at
  `contract`, where the signature is checked but nothing asserts the numbers
- **675 / 675** carry a validated `api:` contract
- **675 / 675** carry an executed worked example
- **1,288 tests pass**, `tsc` builds clean, zero runtime dependencies
- Published: `0.12.0`. `main` is ahead of it — see [CHANGELOG.md](CHANGELOG.md).

---

## 1. Prerequisites

- **Node >= 22.12.** The tests run TypeScript directly via
  `--experimental-strip-types`, so there is no build step in the inner loop. The
  floor is 22.12 rather than 22 because the package's `require` condition
  resolves to an ES module, and `require(esm)` is only unflagged from 22.12.
- **TypeScript >= 5.7**, for `npm run build` only.
  `rewriteRelativeImportExtensions` is what turns `.ts` specifiers into `.js` on
  emit.

```bash
node --version
```

---

## 2. First run

```bash
npm install
npm test
```

Expected tail:

```
# tests 1288
# pass 1288
# fail 0
```

**Only `npm run sync` needs the catalog.** Tests, coverage, benchmarks and the
build all run from a plain clone, because `src/`, the fixtures and the manifest
are committed. That is what lets someone verify the package without access to
the catalog.

| Command | What it does |
|---|---|
| `npm test` | All four layers |
| `npm run build` | `tsc` into `dist/` |
| `npm run verify` | Build then test |
| `npm run coverage` | The suite with Node's coverage reporter |
| `npm run bench` | Overrides against their references; `--all` for the library |
| `npm run sync` | Regenerate everything from the catalog |
| `npm pack` | Build and produce a consumable tarball |

---

## 3. What the tests actually prove

Four layers, deliberately different in strength.

1. **Conformance** replays each topic's fixture and asserts the output. This is
   what `verified` means — and it is worth being precise: the expected values are
   computed in the catalog by a Python implementation written alongside the
   TypeScript, so this is **cross-language parity, not an independent
   third-party figure**. It catches transcription and generation errors. It would
   not catch both implementations sharing a misreading of the source.
2. **Module contract** — every topic loads, `run()` really aliases the declared
   entry, the registry agrees with each module's own `meta`, and every entry
   corresponds to its topic's slug. This is the safety net on the generator.
3. **Structural invariants** — no duplicate ids or subpaths, every topic has an
   exports entry, every subpath matches its documentation URL.
4. **Differential**, for overrides only — where a topic ships from `optimised/`,
   the catalog version is emitted beside it and both are run against the recorded
   arguments and prefixes of every array argument. Values must be deeply equal and
   thrown errors must match in class and message.

74 topics ship no expected values at all. That gap is stated per topic rather
than averaged away.

---

## 4. Consuming it from another project

From npm:

```bash
npm install fintech-algorithms
```

```ts
import { topics } from "fintech-algorithms";
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";
```

To validate an unreleased change, install the tarball rather than using
`npm link` — a symlink hides packaging mistakes that the real `exports` map and
`files` list would catch:

```bash
npm pack
npm install /path/to/fintech-algorithms-0.13.0.tgz
```

npm caches tarballs by path, so bump the version or use `--force` if a change
does not appear. Check what actually ships with `npm pack --dry-run`; `files`
covers `dist`, `src`, `docs.json`, `skills`, `CHANGELOG.md`, `README.md` and
`LICENSE`. Shipping `src` is deliberate — it makes the generated code readable
from inside a consuming project, and it is what lets declaration maps resolve.

---

## 5. The recurring loop: catalog change to package

```bash
npm run sync        # regenerate src/, fixtures, README blocks, docs.json
npm run examples    # execute each catalog test and capture its worked example
npm run docs        # fold the captured examples into docs.json
npm run verify      # build, then all four test layers
```

`npm run sync -- --check` generates into memory and fails if the checked-in
output would change. That is what CI runs to prove the package is in step with
the catalog.

Read the run summary rather than skimming it. It prints what was **skipped** and
why — a topic held out by the purity gate, or one missing a TypeScript
implementation — and what was **held back** by `DOMAINS_NOT_READY`. Both are
currently empty, and a number appearing there is the signal.

---

## 6. Publishing

**Releases come from CI, never a laptop.** Pushing a `v*` tag is the only
trigger.

```bash
npm run verify
npm version minor
git push origin main --follow-tags
```

The workflow re-verifies, packs, smoke-tests the tarball from both ESM and
CommonJS, publishes with a provenance attestation, creates a GitHub Release from
this version's `CHANGELOG.md` section, and asks the reference site to rebuild.

A tag whose version has no changelog section **fails** rather than publishing
empty notes. Writing the entry is part of releasing.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_UNKNOWN_FILE_EXTENSION` on `.ts` | Node below 22 | upgrade Node |
| `ERR_REQUIRE_ESM` when requiring the package | Node 22.0 to 22.11 | upgrade to 22.12 |
| `Cannot find module 'fintech-algorithms/...'` in a consuming repo | stale tarball | `npm pack` here, reinstall there |
| `sync.mjs` says "Catalog not found" | repo moved out of `library-repos/` | pass `--content-root`, or set `FINTECH_CONTENT_ROOT` |
| A topic vanished after `npm run sync` | it was skipped | read the skip list the run prints — usually a missing implementation, or the purity gate |
| `gen-docs` says a topic did not parse | a metadata field is the wrong type | fix it in the catalog; the error names the topic and the field |
| Sync fails on a shared-implementation collision | a family routes several topics through one `calculate(topicId, ...)` | give each topic its own slug-named export |
| `bench --check` fails | an override lost its advantage | either the optimisation broke or the reference caught up; both matter |
| Windows: `Filename too long` on clone | path depth | clone nearer the drive root, or `git config core.longpaths true` |

---

## 8. Where things live

| | |
|---|---|
| Catalog (private) | `edufintech/algorithms/domains/**` |
| Planning | `edufintech/planning/fintech-algorithms/` — roadmap, backlog, decisions |
| Package | this repository |
| Reference site | docs.thefintechbuilder.com — builds from `docs.json` on `main` |
| Articles | thefintechbuilder.com — builds from the catalog |
| npm | `fintech-algorithms` |

A documentation URL and an import path are the same string: swap
`https://docs.thefintechbuilder.com/` for `fintech-algorithms/` and drop the
trailing slash. A test fails if that stops being true.
