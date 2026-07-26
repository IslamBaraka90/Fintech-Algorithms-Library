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
  convention: "A" | "B" | "C" | "none";
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

describe("conformance: catalog worked examples", () => {
  test("the catalog still ships fixtures to check", () => {
    assert.ok(runnable.length > 0, "no runnable fixtures found — did scripts/sync.mjs run?");
  });

  // --- Convention A --------------------------------------------------------

  describe("A · { input, expected }", () => {
    for (const topic of runnable.filter((t) => t.convention === "A")) {
      test(`${topic.id} — ${topic.path}`, async () => {
        const fixture = loadFixture(topic) as { input: unknown; expected: Record<string, unknown> };
        const run = await loadEntry(topic);
        // structuredClone guards against an implementation mutating its input.
        const actual = run(structuredClone(fixture.input)) as Record<string, unknown>;
        assert.ok(actual !== null && typeof actual === "object", `${topic.id} returned ${typeof actual}`);
        // `expected` is asserted as a subset: some fixtures document only the
        // fields the article walks through, not the whole payload.
        for (const [field, want] of Object.entries(fixture.expected)) {
          assert.deepStrictEqual(actual[field], want, `${topic.id}: field \`${field}\``);
        }
      });
    }
  });

  // --- Convention B --------------------------------------------------------

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

  const flatten = (name: string) => name.toLowerCase().replace(/[-_]/g, "");

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
