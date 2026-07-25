# Handoff — `fintech-algorithms`

Everything you need to test the library, consume it from another repo, and keep it in sync
as you publish new tutorials.

---

## 0. What you have

A standalone git repo at `library-repos/Fintech-Algorithms-Library/`, containing:

| Path | What it is | Hand-written? |
|---|---|---|
| `scripts/sync.mjs` | The generator. Reads the edufintech catalog, emits the whole package. | ✅ yes |
| `src/_shared/` | Vendored `indexEngine.ts` shared by 40 index topics. | generated |
| `src/<domain>/<family>/<topic>/` | 114 topic modules (`impl.ts` + `index.ts`). | generated |
| `src/_registry.ts`, `src/_modules.ts`, `src/index.ts` | Registry, lazy loader map, root entry. | generated |
| `test/*.test.ts` | The three test layers. | ✅ yes |
| `test/fixtures/` | 93 worked-example fixtures copied from the catalog. | generated |
| `package.json` `exports` | 114 subpaths + root. | generated |

**Rule:** everything under `src/` except `src/_shared/` is generated. Never hand-edit it.
Fix the catalog implementation in `algorithms/domains/…` and re-run `npm run sync`.

### Current state

- **114 topics** across 7 domains and 22 families
- **`tsc` builds clean** — 0 errors, 232 `.js` + 232 `.d.ts` emitted
- **161 tests pass, 0 fail**
- **Zero runtime dependencies**; only devDependency is TypeScript

---

## 1. Prerequisites

- **Node ≥ 22** — required. The tests run TypeScript directly via
  `--experimental-strip-types`, so there is no build step in the inner loop.
- **TypeScript ≥ 5.7** — only for `npm run build`. The repo declares `typescript@^5.9.3` as a
  devDependency. `rewriteRelativeImportExtensions` (5.7+) is what turns the `.ts` import
  specifiers into `.js` on emit.

```bash
node --version   # must print v22 or higher
```

---

## 2. First run — three commands

```bash
cd library-repos/Fintech-Algorithms-Library
```

**Install** (only TypeScript; everything else is dependency-free):

```bash
npm install
```

**Test** — no build needed, runs straight off `src/`:

```bash
npm test
```

Expected tail:

```
# tests 161
# suites 3
# pass 161
# fail 0
```

**Build** (only needed to produce `dist/` for publishing or packing):

```bash
npm run build
```

If `npm install` is awkward offline, you can build with the TypeScript already in the
monorepo:

```bash
node ../../video-studio/node_modules/typescript/bin/tsc -p tsconfig.json
```

---

## 3. Understand what the tests actually prove

Three layers, deliberately different in strength. Read this before trusting a green run.

### Layer 1 — conformance (41 topics)

`test/conformance.test.ts` runs every topic that ships a `{ input, expected }` worked example
and asserts the output reproduces it exactly.

These are the same numbers the published article walks the reader through and the same
numbers the standalone per-algorithm repo asserts. **A green run means the package, the
article and the repo agree on the arithmetic.** This is the strongest guarantee in the repo.

`expected` is asserted as a *subset* of the result — some fixtures document only the fields
the article discusses, not the whole payload.

### Layer 2 — module contract (all 114 topics)

`test/registry.test.ts` proves, for every topic: the module loads, `run()` is callable and is
genuinely an alias of the declared entry function, every function the registry advertises
actually exists, and the module's own `meta` agrees with the registry.

This is the safety net on the **generator**. If `sync.mjs` mis-detects an entry point or drops
an export, it fails here rather than in your project.

### Layer 3 — structural invariants (6 tests)

No duplicate ids or subpaths; every topic has a `package.json` exports entry; every subpath
matches its article URL; lookup helpers behave; `load()` rejects unknown ids.

### What is NOT covered — read this

**73 of 114 topics have no machine-checkable numeric assertion in this repo.** They are
proven to load and expose a callable entry, but their arithmetic is not verified here,
because their catalog `worked-example.json` uses a bespoke shape rather than
`{ input, expected }`.

Those topics still have their own tests in the catalog (`algorithms/domains/**/tests/`) — this
repo simply cannot consume them yet. Closing that gap is item 1 in the backlog below.

---

## 4. Explore the library

```bash
node --experimental-strip-types -e '
  import { topics, byDomain, byArchetype } from "./src/index.ts";
  console.log(`${topics.length} topics`);
  for (const d of [...new Set(topics.map(t => t.domainId))].sort())
    console.log(` ${d} ${String(byDomain(d).length).padStart(3)}  ${byDomain(d)[0].domain}`);
'
```

Prints the inventory by domain. Swap in `byArchetype` or `byFamily` to slice it differently;
see section 6 for locating a specific topic and its call signature.

To inspect one topic's real signature:

```bash
grep -nE "^export (function|const|type|interface)" src/technical-indicators/trend-smoothing/ema/impl.ts
```

---

## 5. No demos live here — by design

This repo ships the library and nothing else: no demos, no examples, no sample data, no
provider credentials. Applications built *with* the library live in their own repository so
they can carry their own dependencies, secrets and release cycle without any of it leaking
into a package that other people install.

If you want to see the six synthetic demos that were originally scaffolded here, they are
preserved in git history at commit `fa0b6fc` (`git show fa0b6fc:demos/05-bring-your-own-data.ts`).

---

## 6. Finding what you need

The library has 114 topics; these three commands answer "what exists and how do I call it".

1. **Search the registry** for a topic by name, domain or shape:
   ```bash
   node --experimental-strip-types -e '
     import { topics } from "./src/index.ts";
     for (const t of topics.filter(t => /breadth|advance/i.test(t.title + t.family)))
       console.log(t.id, t.path, t.entry + "()");
   '
   ```
2. **Read the real signature** — the types are the documentation:
   ```bash
   grep -nE "^export (function|const|type|interface)" \
     src/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter/impl.ts
   ```
3. **Start from a fixture** — a call with verified output beats guessing at a shape:
   ```bash
   cat test/fixtures/D01-F02-A02.json
   ```

Step 3 is the shortcut. Any topic with a fixture gives you a working invocation you can paste
straight into a consuming project.

---

## 7. Consuming the library from another repo

Until the package is on npm, consume it as a tarball. This is strictly better than `npm link`
for validating a release: it exercises the real `exports` map and the real `files` list, so it
catches packaging mistakes that a symlink hides.

**In this repo:**

```bash
npm pack
```

`prepack` runs the build automatically, producing `fintech-algorithms-0.1.0.tgz`.

**In the consuming repo:**

```bash
npm install /path/to/fintech-algorithms-0.1.0.tgz
```

That writes a `file:` dependency into its `package.json`. Re-run both commands after any
library change — npm caches tarballs by path, so bump `version` or use
`npm install --force` if a change does not appear.

Then import exactly as a public consumer would:

```ts
import { topics } from "fintech-algorithms";
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";
```

Once published to npm this becomes `npm install fintech-algorithms` with no other change.

Verify the packaged file list before shipping:

Verify the packaged file list before shipping:

```bash
npm pack --dry-run
```

`files` is set to `dist`, `src`, `README.md`, `LICENSE`. Shipping `src` is deliberate — it makes
the generated code readable from inside a consuming project.

---

## 8. The recurring loop: new tutorial → package

This is the workflow that keeps the package current, and it is the reason the generator
exists. After you publish a new topic in the catalog:

```bash
# 1. Regenerate — picks up the new topic automatically
npm run sync

# 2. Confirm it landed
node --experimental-strip-types -e 'import {topic} from "./src/index.ts"; console.log(topic("<your-topic-id>"))'

# 3. Verify
npm run build && npm test

# 4. Commit — package.json exports and src/ will both have changed
git add -A && git commit -m "sync: add <topic-id> <title>"
```

There is **no manual step** — `sync.mjs` discovers any directory matching `D##-F##-A##-*`
with a `metadata.yaml` and a TypeScript implementation.

Add this as step 9.5 to the `fintech-algorithm-repo` skill so it happens on every build.

### Keeping it honest in CI

```bash
node scripts/sync.mjs --check
```

Exits non-zero and lists the drifting files if the checked-in output no longer matches the
catalog. Wire this into CI so the package can never silently fall behind.

---

## 9. Publish to npm

Not done yet — deliberately, because it is outward-facing and irreversible.

1. **Claim the name.** `npm view fintech-algorithms` — if it is taken, switch to a scope
   (`@fintechbuilder/algorithms`) in `package.json`, then re-pack for any consuming repo.
2. `npm run verify` — must be fully green.
3. `npm pack --dry-run` — confirm the file list.
4. `npm publish --access public`.
5. Push the repo to GitHub as `Fintech-Algorithms-Library` and add it to
   `library-repos/manifest.yaml` with `kind: "package"`.

---

## 10. Backlog — known gaps, in priority order

Honest list. None of these block testing or consuming the library today.

1. **73 topics lack numeric verification here.** Normalize their catalog
   `worked-example.json` to `{ topicId, input, expected }` — 54 already use `topicId`, 24 use
   `topic_id`, and the rest use bespoke keys. Each one normalized converts a "loads OK" test
   into a real arithmetic assertion. Highest value work available.
2. **3 catalog topics have no TypeScript implementation** and are therefore absent from the
   package: `D46-F01-A06` (bonus-issue EPS restatement), `D46-F01-A07` (rights-issue bonus
   factor), `D46-F02-A01` (if-converted convertible debt). Python-only today.
3. **`strict: false`.** Many catalog entry points are deliberately `(data: unknown)`. Turning
   strict on is worth doing per-domain, starting with D07 and D01-F01 which are already
   well-typed.
4. **No `api:` contract in `metadata.yaml`.** Input/output shapes live only in the code today.
   Adding a declared `api:` block per topic would let `sync.mjs` generate typed wrappers,
   runtime validation and API docs instead of re-exporting loosely-typed functions.
5. **Python parity.** This package is TypeScript only. The same generator design works for a
   PyPI `fintech-algorithms` built from `implementations/python/`.
6. **Tree-shaking caveat.** `src/_modules.ts` statically lists all 114 dynamic imports so
   `load()` works in both source and dist mode. Bundler users who import a subpath directly
   are unaffected; only the root `load()` path pulls the map.

---

## 11. Catalog changes made during this build

`tsc` surfaced 23 pre-existing type errors in the catalog. All were fixed **at the source** in
`algorithms/domains/…`, so the articles and the standalone repos benefit too. **Every fix is
type-level with zero runtime change** — the conformance suite passing afterwards confirms the
arithmetic is untouched.

| File | Defect | Fix |
|---|---|---|
| `D46-F02-A03…/treasuryShare.ts` | `TreasuryShareInput` declared 8 members **twice** (`as_of`, 4 × `average_market_price_*`, `assumed_proceeds_policy`, `instrument_terms_source`, `terms_event_policy`) | removed the duplicates |
| `D46-F02-A03…/treasuryShare.ts` | Result literal emitted 8 fields absent from `TreasuryShareResult` | declared them on the interface |
| `D03…/shared/indexEngine.ts` | `new Set()` inferred `Set<unknown>`, used as an array index | `new Set<number>()` |
| `D03…/shared/indexEngine.ts` | `reduce` accumulator inferred `unknown` | `reduce<number>(…)` |
| `D04-F03-A02/high_low_ratio.ts`, `D04-F03-A03/high_low_index.ts` | `const MODE = "ratio"` narrowed to a literal, making the template's other branches a type error | widened to `"net" \| "ratio" \| "index"` |

The `treasuryShare.ts` duplicates mean that file had **never been type-checked** before now.
Worth a look at whether its Python sibling has the same drift.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_UNKNOWN_FILE_EXTENSION` on `.ts` | Node < 22 | upgrade Node |
| `Cannot find module 'fintech-algorithms/...'` in a consuming repo | stale or missing tarball | `npm pack` here, then re-install it there |
| `sync.mjs` says "Catalog not found" | Repo moved out of `library-repos/` | `node scripts/sync.mjs --content-root /path/to/edufintech` or set `FINTECH_CONTENT_ROOT` |
| `rewriteRelativeImportExtensions` unknown option | TypeScript < 5.7 | `npm install -D typescript@^5.9.3` |
| Tests pass but `npm run build` fails | A catalog implementation has a type error | fix it in the catalog, then `npm run sync` |
| A topic vanished after `npm run sync` | Its `metadata.yaml` or TS implementation was removed/renamed | check the skip list `sync.mjs` prints |
