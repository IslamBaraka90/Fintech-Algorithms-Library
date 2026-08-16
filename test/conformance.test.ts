/**
 * Conformance — every topic that ships machine-checkable numbers in the
 * edufintech catalog must reproduce them.
 *
 * These are the same values the published article walks the reader through and
 * the same values the standalone per-algorithm repo asserts, so a green run
 * means the package, the article and the repo agree on the arithmetic.
 *
 * The catalog stores verified numbers in three shapes. `scripts/sync.mjs` copies
 * each fixture verbatim and records which one applies in `_manifest.json`:
 *
 *   A  { input, expected }                      — call entry(input), compare fields
 *   B  { rows, expected: { status, value } }    — call entry(rows | rows.at(-1), ...params)
 *   C  { bars, checkpoints } or scenarios[]     — call entry(<price series by
 *                                                 parameter name>), compare each
 *                                                 checkpoint at its index
 *
 * Fixtures are never edited here. Tests run straight off `src/` via Node's
 * type-stripping — no build required.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

interface ManifestTopic {
  id: string;
  path: string;
  entry: string;
  archetype: string;
  fixture: string | null;
  convention: "A" | "B" | "C" | "D" | "none";
  entryParams: string[];
  fixtureKeys: string[];
}

const manifest = JSON.parse(readFileSync(join(HERE, "_manifest.json"), "utf8")) as {
  topicCount: number;
  topics: ManifestTopic[];
};

/**
 * Fields a catalog fixture states in different units from the implementation.
 * Excluded here rather than "corrected" on either side, because the catalog's
 * own test does not assert them and the right unit is an editorial decision.
 *
 * D04-F04-A06: the fixture writes `breadth_separation: -0.13` (per unit) while
 * the implementation returns -130 (scaled by `breadth_scale: 1000`). The
 * catalog's own suite asserts only `status` and `confirmation_date`.
 */
const KNOWN_FIXTURE_DISCREPANCIES: Record<string, string[]> = {
  "D04-F04-A06": ["breadth_separation"],
};

const runnable = manifest.topics.filter((t) => t.fixture && t.convention !== "none");
const loadFixture = (t: ManifestTopic) =>
  JSON.parse(readFileSync(join(HERE, "fixtures", t.fixture as string), "utf8")) as Record<string, unknown>;

const loadEntry = async (t: ManifestTopic) => {
  const mod = (await import(`../src/${t.path}/index.ts`)) as Record<string, unknown>;
  const fn = mod.run ?? mod[t.entry];
  assert.equal(typeof fn, "function", `${t.id} exposes no callable entry (${t.entry})`);
  return fn as (...args: unknown[]) => unknown;
};

/** Numeric comparison that tolerates the catalog's published rounding. */
function closeEnough(actual: unknown, expected: unknown, label: string): void {
  if (expected === null) {
    assert.ok(actual === null || actual === undefined, `${label}: expected null, got ${String(actual)}`);
    return;
  }
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", `${label}: expected a number, got ${typeof actual}`);
    assert.ok(
      Math.abs((actual as number) - expected) < 1e-6,
      `${label}: expected ${expected}, got ${String(actual)}`,
    );
    return;
  }
  assert.deepStrictEqual(actual, expected, label);
}

/**
 * Assert a published expected value recursively. Object fixtures may document
 * a deliberate subset; arrays are complete ordered values.
 */
function expectedSubset(actual: unknown, expected: unknown, label: string): void {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${label}: expected an array, got ${typeof actual}`);
    assert.equal(actual.length, expected.length, `${label}: array length`);
    expected.forEach((want, index) => expectedSubset(actual[index], want, `${label}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    assert.ok(actual !== null && typeof actual === "object", `${label}: expected an object, got ${typeof actual}`);
    for (const [field, want] of Object.entries(expected as Record<string, unknown>)) {
      assert.ok(Object.hasOwn(actual as object, field), `${label}: missing field \`${field}\``);
      expectedSubset((actual as Record<string, unknown>)[field], want, `${label}.${field}`);
    }
    return;
  }
  closeEnough(actual, expected, label);
}

const flattenedName = (name: string) => name.toLowerCase().replace(/[-_]/g, "");

/** Bind Convention A's named input object to a multi-argument entry function. */
function conventionAArgs(topic: ManifestTopic, input: unknown): unknown[] {
  const cloned = structuredClone(input);
  if (topic.entryParams.length <= 1 || cloned === null || typeof cloned !== "object" || Array.isArray(cloned)) {
    return [cloned];
  }

  const named = cloned as Record<string, unknown>;
  const supplied = Object.entries(named);
  const hasDeclaredName = topic.entryParams.some((name) =>
    supplied.some(([key]) => flattenedName(key) === flattenedName(name)),
  );
  if (!hasDeclaredName) return [cloned];

  const args = topic.entryParams.map((name) => {
    if (Object.hasOwn(named, name)) return named[name];
    return supplied.find(([key]) => flattenedName(key) === flattenedName(name))?.[1];
  });
  while (args.length && args.at(-1) === undefined) args.pop();
  return args;
}

/**
 * Bind Convention D's input object to its entry.
 *
 * D differs from A in one case that matters. A single-parameter entry is often
 * handed a wrapper object holding exactly one key — `normalizeEvents(events)`
 * against `{ "events": [...] }` — where A would pass the wrapper itself. When
 * there is one parameter and one key, the key is the argument.
 *
 * The unwrap deliberately does NOT require the key to match the parameter name.
 * Plenty of entries name a parameter for what it is locally (`seriesRaw`) while
 * the fixture names it for what it holds, and a name check would silently pass
 * the wrapper instead — which fails as a confusing type error rather than as a
 * binding problem.
 */
/**
 * Reviewed bindings for topics whose parameter names and fixture keys share no
 * derivable relationship.
 *
 * Every one of these was checked against the implementation by hand. They are
 * here rather than in a cleverer matcher on purpose: `tickRaw` against keys
 * holding both `tick_size` and `max_distance_ticks` has two plausible answers,
 * and a matcher that picks one is guessing. A wrong argument does not announce
 * itself — it surfaces later as an implementation that looks broken.
 *
 * Keep this list short. If it grows, the naming convention in the catalog is the
 * thing to fix, not this map.
 */
const REVIEWED_BINDINGS: Record<string, readonly string[]> = {
  // `multipleRaw` → wall_multiple, `thresholdRaw` → concentration_threshold:
  // the fixture qualifies each name, the parameter does not.
  "D11-F05-A06": ["levels", "wall_multiple", "minimum_share", "concentration_threshold"],
  // `tickRaw` would also match max_distance_ticks; `binRaw` sits inside
  // time_bin_seconds. Both ambiguous, both fixed here.
  "D11-F05-A08": ["snapshots", "tick_size", "time_bin_seconds", "max_distance_ticks"],
  // The collar bounds are `low`/`high` in the signature and `collar_*` in the
  // fixture, and `orders` arrives first in the signature but last in the object.
  "D12-F02-A03": ["orders", "previous_close", "tick_size", "collar_low", "collar_high"],
  "D12-F02-A04": ["orders", "closing_reference", "tick_size", "collar_low", "collar_high"],
  // `targetIdRaw` → target_order_id.
  "D12-F04-A04": ["orders", "target_order_id"],
  // Taken from the family dispatcher's own call, which is the authoritative
  // statement of this argument order.
  "D12-F01-A04": ["incoming_quantity", "price", "lot_size", "fifo_fraction", "resting_orders"],
  // `initialRaw` → initial_display_quantity and `displaySizeRaw` → display_size
  // are each a prefix of the other's key; order is the only thing that separates them.
  "D12-F04-A05": [
    "total_quantity",
    "initial_display_quantity",
    "display_size",
    "fills",
    "starting_priority_sequence",
  ],
};

function conventionDArgs(topic: ManifestTopic, input: unknown): unknown[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return [structuredClone(input)];
  const named = structuredClone(input) as Record<string, unknown>;
  const keys = Object.keys(named);

  const reviewed = REVIEWED_BINDINGS[topic.id];
  if (reviewed) return reviewed.map((key) => named[key]);

  if (topic.entryParams.length === 1) {
    const only = topic.entryParams[0];
    // One parameter, one key: the key is the argument.
    if (keys.length === 1) return [named[keys[0]]];
    /*
     * One recorded parameter, but the fixture supplies that parameter's key
     * alongside others. That is the signature `fn(thing, { options })` — the
     * generator records only `thing`, because a destructured parameter has no
     * name to record. Bind the named key, then hand the whole object over as the
     * options bag: it holds every destructured key, and the extras are ignored.
     */
    if (Object.hasOwn(named, only)) return [named[only], named];
    // The parameter is not one of the keys, so the object itself is the argument.
    return [named];
  }

  /*
   * Several families name a parameter for the fact that it is unvalidated —
   * `bidsRaw`, `tickRaw`, `incomingRaw` — while the fixture names the same thing
   * for what it holds: `bids`, `tick_size`, `incoming_order`. Neither is wrong,
   * and an exact-name matcher binds none of them.
   *
   * So: drop a trailing `Raw`, flatten case and separators, then accept an exact
   * match or one name being a prefix of the other. `tickRaw` finds `tick_size`
   * and `incomingRaw` finds `incoming_order` without either side renaming.
   */
  const stem = (name: string) => name.replace(/Raw$/, "").toLowerCase().replace(/[-_]/g, "");
  const matches = (param: string, key: string) => {
    const p = stem(param);
    const k = stem(key);
    return p === k || k.startsWith(p) || p.startsWith(k);
  };

  const args = topic.entryParams.map((param) => {
    if (Object.hasOwn(named, param)) return named[param];
    const exact = keys.find((key) => stem(key) === stem(param));
    if (exact) return named[exact];
    const loose = keys.filter((key) => matches(param, key));
    // Only bind on a prefix when it is unambiguous — two candidates means the
    // guess would be a coin flip, and a wrong argument reads as a broken
    // implementation rather than a binding problem.
    return loose.length === 1 ? named[loose[0]] : undefined;
  });

  if (args.every((value) => value === undefined)) return [named];
  while (args.length && args.at(-1) === undefined) args.pop();
  return args;
}

describe("conformance: catalog worked examples", () => {
  test("the catalog still ships fixtures to check", () => {
    assert.ok(runnable.length > 0, "no runnable fixtures found — did scripts/sync.mjs run?");
  });

  // --- Convention A --------------------------------------------------------

  describe("A · { input, expected }", () => {
    for (const topic of runnable.filter((t) => t.convention === "A")) {
      test(`${topic.id} — ${topic.path}`, async () => {
        const fixture = loadFixture(topic) as { input: unknown; expected: unknown };
        const run = await loadEntry(topic);
        // conventionAArgs clones input to guard against implementations that mutate it.
        const actual = run(...conventionAArgs(topic, fixture.input));
        expectedSubset(actual, fixture.expected, topic.id);
      });
    }
  });

  // --- Convention B --------------------------------------------------------

  // --- Convention D --------------------------------------------------------

  /**
   * A separate `canonical-input.json` and `expected-output.json` in the topic's
   * datasets, combined by the generator into the same `{ input, expected }`
   * shape A uses.
   *
   * These expected values are computed in the catalog from the Python
   * `family_core.py`, while the TypeScript being tested here comes from a
   * separately authored template. That makes this a cross-language parity check
   * rather than an independent published figure — worth stating plainly, because
   * it bounds what a green run proves: two implementations of one understanding
   * agree. It catches transcription and generator-transformation errors, which
   * is what has actually gone wrong here, and it would not catch both languages
   * sharing a misreading of the source material.
   */
  describe("D · { canonical-input, expected-output }", () => {
    for (const topic of runnable.filter((t) => t.convention === "D")) {
      test(`${topic.id} — ${topic.path}`, async () => {
        const fixture = loadFixture(topic) as { input: unknown; expected: unknown };
        const run = await loadEntry(topic);
        const actual = run(...conventionDArgs(topic, fixture.input));
        expectedSubset(actual, fixture.expected, topic.id);
      });
    }
  });

  /**
   * Row-based fixtures. Some topics consume the whole series, others only the
   * final row; the shape of `expected` says which — a per-session metric (TRIN,
   * up/down volume ratio) is evaluated on one row.
   */
  describe("B · { rows, expected }", () => {
    for (const topic of runnable.filter((t) => t.convention === "B")) {
      test(`${topic.id} — ${topic.path}`, async () => {
        const fixture = loadFixture(topic) as {
          rows: unknown[];
          parameters?: Record<string, unknown>;
          expected: Record<string, unknown>;
        };
        const run = await loadEntry(topic);
        const params = fixture.parameters ?? {};

        // Bind declared parameters after the first (the rows argument) by name.
        const extras = topic.entryParams.slice(1).map((name) => params[name] ?? params[name.replace(/_/g, "")]);
        while (extras.length && extras.at(-1) === undefined) extras.pop();

        const attempts: Array<() => unknown> = [
          () => run(structuredClone(fixture.rows), ...extras),
          () => run(structuredClone(fixture.rows.at(-1)), ...extras),
        ];

        let actual: Record<string, unknown> | null = null;
        let lastError: unknown = null;
        for (const attempt of attempts) {
          try {
            const result = attempt() as Record<string, unknown>;
            // Accept the call whose result carries the fields we must compare.
            if (result && typeof result === "object" && Object.keys(fixture.expected).some((k) => k in result)) {
              actual = result;
              break;
            }
          } catch (error) {
            lastError = error;
          }
        }
        assert.ok(actual, `${topic.id}: neither rows nor last-row invocation produced the expected fields (${String(lastError)})`);

        // Some topics report a summary plus a detail row list (the divergence
        // detector returns { status, events: [ … ] }) while the fixture states
        // the detail flat. Look one level into the first detail row.
        const detail = Object.values(actual).find(
          (value) => Array.isArray(value) && value.length > 0 && typeof value[0] === "object",
        ) as Array<Record<string, unknown>> | undefined;
        const lookup = (field: string) => (field in actual ? actual[field] : detail?.[0]?.[field]);

        const skip = KNOWN_FIXTURE_DISCREPANCIES[topic.id] ?? [];
        for (const [field, want] of Object.entries(fixture.expected)) {
          if (skip.includes(field)) continue;
          closeEnough(lookup(field), want, `${topic.id}: field \`${field}\``);
        }
      });
    }
  });

  // --- Convention C --------------------------------------------------------

  /** Price-series columns a parameter name can be bound to. */
  const SERIES_PARAMS = new Set(["open", "high", "low", "close", "volume", "values", "price", "prices"]);

  const flatten = flattenedName;

  /**
   * Fixtures express parameters either as an object or as prose — several write
   * `canonical_parameters` as the string "`period=14`". Both reduce to a map.
   */
  function normaliseParameters(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw !== "string") return {};
    const out: Record<string, unknown> = {};
    for (const [, key, value] of raw.matchAll(/([A-Za-z_][\w]*)\s*=\s*([-\d.]+)/g)) {
      out[key] = Number(value);
    }
    return out;
  }

  /**
   * Bind a fixture's `parameters` object to the entry's declared parameters.
   *
   * Names do not always agree — a signature may declare `p` where the fixture
   * writes `period`, or `spanBPeriod` where the fixture writes `span_b_period`.
   * Resolution order: exact name, case/underscore-insensitive name, then
   * positional when the counts line up (fixtures are authored alongside the
   * signature, so declaration order matches). Anything unresolved is left
   * undefined so the implementation's own default applies.
   */
  function bindParameters(entryParams: string[], rawParameters: unknown): Map<string, unknown> {
    const parameters = normaliseParameters(rawParameters);
    const configurable = entryParams.filter((name) => !SERIES_PARAMS.has(name));
    const supplied = Object.entries(parameters);
    const bound = new Map<string, unknown>();
    const usedKeys = new Set<string>();

    for (const name of configurable) {
      if (name in parameters) {
        bound.set(name, parameters[name]);
        usedKeys.add(name);
        continue;
      }
      const match = supplied.find(([key]) => flatten(key) === flatten(name) && !usedKeys.has(key));
      if (match) {
        bound.set(name, match[1]);
        usedKeys.add(match[0]);
      }
    }

    const stillUnbound = configurable.filter((name) => !bound.has(name));
    const stillUnused = supplied.filter(([key]) => !usedKeys.has(key));
    if (stillUnbound.length > 0 && stillUnbound.length === stillUnused.length) {
      stillUnbound.forEach((name, i) => bound.set(name, stillUnused[i][1]));
    }
    return bound;
  }

  interface Case {
    label: string;
    bars: Array<Record<string, number>>;
    checkpoints: Array<Record<string, unknown>>;
    /** Full expected series per output field, when the fixture publishes them. */
    expected: Record<string, unknown[]> | null;
    parameters: Record<string, unknown>;
  }

  /** Normalise both C layouts — flat, and scenarios[] — into one case list. */
  function casesOf(fixture: Record<string, unknown>): Case[] {
    if (Array.isArray(fixture.bars) && Array.isArray(fixture.checkpoints)) {
      return [
        {
          label: "default",
          bars: fixture.bars as Array<Record<string, number>>,
          checkpoints: fixture.checkpoints as Array<Record<string, unknown>>,
          expected: null,
          parameters: (fixture.canonical_parameters ?? fixture.parameters ?? {}) as Record<string, unknown>,
        },
      ];
    }
    const scenarios = (fixture.scenarios ?? []) as Array<Record<string, unknown>>;
    return scenarios
      .map((scenario, index) => {
        const expected = scenario.expected;
        const seriesExpected =
          expected && typeof expected === "object" && !Array.isArray(expected)
            ? (Object.fromEntries(
                Object.entries(expected as Record<string, unknown>).filter(([, value]) => Array.isArray(value)),
              ) as Record<string, unknown[]>)
            : null;
        return {
          label: String(scenario.id ?? `scenario-${index}`),
          bars: (scenario.observations ?? scenario.bars ?? []) as Array<Record<string, number>>,
          checkpoints: (scenario.checkpoints ?? []) as Array<Record<string, unknown>>,
          expected: seriesExpected && Object.keys(seriesExpected).length > 0 ? seriesExpected : null,
          parameters: (scenario.parameters ?? {}) as Record<string, unknown>,
        };
      })
      .filter((c) => c.bars.length > 0 && (c.checkpoints.length > 0 || c.expected));
  }

  describe("C · { bars, checkpoints }", () => {
    for (const topic of runnable.filter((t) => t.convention === "C")) {
      test(`${topic.id} — ${topic.path}`, async () => {
        const fixture = loadFixture(topic);
        const run = await loadEntry(topic);
        const cases = casesOf(fixture);
        assert.ok(cases.length > 0, `${topic.id}: no runnable cases in the fixture`);

        let comparisons = 0;
        for (const testCase of cases) {
          // Bind each declared parameter: price series by column name, anything
          // else from the fixture's own parameters, else the function's default.
          const bound = bindParameters(topic.entryParams, testCase.parameters);
          const args = topic.entryParams.map((name) => {
            if (SERIES_PARAMS.has(name)) {
              const column = name === "values" || name === "price" || name === "prices" ? "close" : name;
              return testCase.bars.map((bar) => bar[column]);
            }
            return bound.get(name);
          });
          while (args.length && args.at(-1) === undefined) args.pop();

          const result = run(...args) as Record<string, Array<number | null>>;
          assert.ok(result && typeof result === "object", `${topic.id}/${testCase.label}: expected an object result`);

          // Prefer the full published series when the fixture has one — it
          // checks every observation rather than a handful of marked indices.
          if (testCase.expected) {
            for (const [field, wantSeries] of Object.entries(testCase.expected)) {
              const series = result[field];
              if (series === undefined) continue;
              assert.ok(Array.isArray(series), `${topic.id}: \`${field}\` is not a series`);
              assert.equal(
                series.length,
                wantSeries.length,
                `${topic.id}/${testCase.label}: \`${field}\` length`,
              );
              for (let i = 0; i < wantSeries.length; i++) {
                closeEnough(series[i], wantSeries[i], `${topic.id}/${testCase.label}: ${field}@${i}`);
                comparisons++;
              }
            }
          }

          for (const checkpoint of testCase.checkpoints) {
            const index = checkpoint.index as number;
            for (const [field, want] of Object.entries(checkpoint)) {
              if (typeof want !== "number" && want !== null) continue; // narrative fields
              if (field === "index") continue;
              const series = result[field];
              if (series === undefined) continue; // documented but not returned by this entry
              assert.ok(Array.isArray(series), `${topic.id}: \`${field}\` is not a series`);
              closeEnough(series[index], want, `${topic.id}/${testCase.label}: ${field}@${index}`);
              comparisons++;
            }
          }
        }
        assert.ok(comparisons > 0, `${topic.id}: fixture produced no comparable checkpoint fields`);
      });
    }
  });
});
