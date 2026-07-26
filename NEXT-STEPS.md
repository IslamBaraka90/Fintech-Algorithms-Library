# State and what's left

## Where the package stands

| | |
|---|---|
| Topics | **154** · 7 domains · 27 families |
| Build | `tsc` clean, 0 errors |
| Tests | **241 pass, 0 fail** |
| Verified arithmetic | **79/154** against the catalog's own published numbers |
| Version | `0.2.0` — never published; the npm name `fintech-algorithms` is available |
| Git | local only, no remote configured |

Nothing here blocks use. The package installs from a tarball and works — the
market-breadth dashboard consumes it that way.

## Recently fixed

- **13 topics exposed the wrong `run()` alias.** The newest catalog families ship
  one shared implementation per family, and entry detection fell through to the
  first exported function, so every momentum topic pointed at `rsi()` and every
  volume topic at `obv()`. Detection now derives the entry from the topic's own
  catalog test, then from slug rules, and **fails the build** rather than guessing.
- **Two new tests** tie each entry to its topic's identity and flag topics that
  share an implementation and collapse onto one function. Both were confirmed to
  fail when the original defect is re-injected.
- **Shared family bodies are hoisted** into `src/_shared/` and re-exported, so
  `momentum.ts` (×8) and `volume.ts` (×6) ship once each. The public `exports` map
  is byte-identical before and after.
- **Conformance rose 41 → 79** with runners for the catalog's other two fixture
  conventions.
- **README statistics are generated** by `scripts/update-readme.mjs`, so the counts
  cannot drift again.

## What's actually left

1. **75 topics have no machine-checkable numbers in this package.** They load and
   expose a callable entry, and they have passing tests in the catalog, but they
   ship no expected values this harness can consume. Closing the gap means adding
   `{ input, expected }` or bar/checkpoint fixtures to those catalog topics — a
   catalog authoring task, not a package task.
2. **3 catalog topics have no TypeScript implementation** and are therefore absent:
   `D46-F01-A06`, `D46-F01-A07`, `D46-F02-A01`.
3. **Publishing.** When ready: `npm run verify`, `npm pack --dry-run` to check the
   file list, decide `0.2.0` vs `1.0.0`, then `npm publish --access public`.
   Creating the GitHub repo and publishing are both public and irreversible.
4. **`strict: false`** in `tsconfig.json`. Many catalog entry points are
   deliberately `(data: unknown)`. Turning strict on is worth doing per-domain,
   starting with D07 and D01-F01, which are already well-typed.

## One catalog discrepancy worth a decision

`D04-F04-A06` (breadth-divergence-detector): the fixture states
`breadth_separation: -0.13` while the implementation returns `-130` — the
`breadth_scale: 1000` factor. The catalog's own test asserts only `status` and
`confirmation_date`, so it never noticed. The conformance suite skips that single
field with a comment rather than picking a side. Decide which unit is canonical
and fix whichever is wrong.

## Working on this repo

Everything under `src/` except `src/_shared/` is generated. Never hand-edit it —
fix the catalog implementation in `algorithms/domains/**` and re-run:

```bash
npm run sync      # regenerate src/ + README stats
npm run build     # tsc -> dist/
npm test          # conformance + module contract + structural
node scripts/sync.mjs --check   # CI gate: is the package in step with the catalog?
```

⚠️ The `edufintech` monorepo's `.git/` directory is empty — the catalog is not
under version control, so catalog edits have no undo.
