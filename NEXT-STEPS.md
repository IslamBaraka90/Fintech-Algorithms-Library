# State and what is left

## Where the package stands

| | |
|---|---|
| Topics | **675** · 17 domains · 82 families |
| Verified arithmetic | **601 / 675** replayed and asserted on every build |
| `api:` contracts | **675 / 675** |
| Worked examples | **675 / 675**, every one executed |
| Build | `tsc` clean |
| Tests | **1,288 pass, 0 fail** |
| Published | `0.12.0` on npm; `main` is ahead — see [CHANGELOG.md](CHANGELOG.md) |
| Held back | none |

**The catalog and the package now hold the same set.** Every domain either ships
or is refused by a gate that prints its reason, and nothing is currently refused.
That is a first, and it is the thing that makes the release worth cutting.

## Ready to release

`0.13.0` is written and waiting for a tag. It takes the library from 324 topics
to 675, completes Technical Indicators for the first time, and carries one
behaviour change on a single published subpath — documented in the changelog.

```bash
npm run verify
npm version minor
git push origin main --follow-tags
```

That is the only trigger. CI re-verifies, packs, smoke-tests the tarball from
ESM and CommonJS, publishes with provenance, creates a GitHub Release from the
changelog section, and asks the reference site to rebuild.

## What is actually left

**Verification, the honest gap.** 74 topics ship no expected values, so nothing
asserts their arithmetic. They are mostly in `D01-F02`, `F03` and `F04`, where
the only oracle is assertion code inside the catalog's own tests rather than data
that can be copied. Closing this needs numbers authored against a published
source, not more tooling. It is the highest-value catalog work remaining.

**Say what `verified` means, everywhere it appears.** The expected values are
computed in the catalog by a Python implementation written alongside the
TypeScript. That is cross-language parity — it catches transcription and
generation errors, and would not catch both implementations sharing a
misreading. The README, the skill and this repository now word it that way;
anything written elsewhere should match.

**`D00` typing.** The foundations engine takes and returns `Record<string, any>`.
Its 120 contracts describe the keys each topic really reads, which is honest, but
a caller gets no help from the type. Narrowing it is not free: the engine
validates at family scope before it branches, so a narrow per-topic interface
would typecheck calls that then throw. Worth doing deliberately or not at all.

**Two calling conventions.** Topics that predate the native port take plain
arrays and return bare records; the 152 ported ones take `{ bars, parameters }`
and return an envelope with `series`, `latest` and `ready_at`. Both are correct
and both are fixed by their fixtures. It is a documented split rather than a bug,
but it is the kind of thing that should be resolved in a major version rather
than left to surprise people.

**Package size.** 17 MB unpacked across roughly 5,400 files, because `src/` ships
alongside `dist/`. That is what makes declaration maps resolve to real sources.
Worth an explicit decision at some point rather than drift.

## Where planning lives

Engineering plans are deliberately outside this repository, at
`edufintech/planning/fintech-algorithms/` — `ROADMAP.md`, `BACKLOG.md` and
`DECISIONS.md`. This file is the public summary; those are the working documents.
