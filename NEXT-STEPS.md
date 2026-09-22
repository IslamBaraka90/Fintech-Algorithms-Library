# State and what is left

## Where the package stands

| | |
|---|---|
| Topics | **717** · 19 domains · 90 families |
| Verified arithmetic | **623 / 717** replayed and asserted on every build |
| `api:` contracts | **717 / 717** |
| Worked examples | **717 / 717**, every one executed |
| Build | `tsc` clean |
| Tests | **1,352 pass, 0 fail** |
| Published | `0.13.1` on npm; `main` is ahead — see [CHANGELOG.md](CHANGELOG.md) |
| Held back | none |

**The catalog and the package now hold the same set.** Every domain either ships
or is refused by a gate that prints its reason, and nothing is currently refused.
That is a first, and it is the thing that makes the release worth cutting.

## Ready to release

`0.13.2` is written and waiting for a tag. It adds the Portfolio Construction
domain. Nothing is removed or renamed, so it is a patch by the rule at the top
of the changelog.

```bash
npm run verify
npm version patch
git push origin main --follow-tags
```

That is the only trigger. CI re-verifies, packs, smoke-tests the tarball from
ESM and CommonJS, publishes with provenance, creates a GitHub Release from the
changelog section, and asks the reference site to rebuild.

## What is actually left

**Verification, the honest gap.** 94 topics ship no expected values, so nothing
asserts their arithmetic. They split into two different problems. In `D01-F02`,
`F03` and `F04` the only oracle is assertion code inside the catalog's own tests
rather than data that can be copied, so closing those needs numbers authored
against a published source. D14 is the opposite case and the cheaper one: all 20
topics have expected numbers already, sitting in each topic's `tests/fixtures/`
in two or three shapes the conformance harness does not read. Teaching it those
shapes, or moving them to `datasets/` in one the generator already knows, buys
20 topics without authoring a single figure.

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
