/**
 * Structural guarantees that hold for all 114 topics, including the 73 without a
 * machine-checkable worked example.
 *
 * This is the safety net for the generator: if `scripts/sync.mjs` mis-detects an
 * entry point, drops a subpath from the exports map, or emits metadata that
 * disagrees with the registry, it fails here rather than in a user's project.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { topics, topic, byDomain, byFamily, byArchetype, load, runner } from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};

describe("registry", () => {
  test("is non-empty and internally consistent", () => {
    assert.ok(topics.length > 0, "registry is empty");
    const ids = new Set(topics.map((t) => t.id));
    assert.equal(ids.size, topics.length, "duplicate topic ids in registry");
    const paths = new Set(topics.map((t) => t.path));
    assert.equal(paths.size, topics.length, "duplicate subpaths in registry");
  });

  test("every topic has a package.json exports subpath", () => {
    const missing = topics.filter((t) => !Object.hasOwn(pkg.exports, `./${t.path}`));
    assert.deepStrictEqual(
      missing.map((t) => t.id),
      [],
      "topics missing from the exports map — re-run npm run sync",
    );
  });

  test("subpath mirrors the article URL", () => {
    for (const t of topics) {
      assert.ok(
        t.articleUrl.endsWith(`/${t.path}/`),
        `${t.id}: subpath \`${t.path}\` does not match article URL \`${t.articleUrl}\``,
      );
    }
  });

  /**
   * Ties each entry point to the topic's IDENTITY rather than to itself.
   *
   * The `run === mod[entry]` assertion below cannot catch a mis-detection,
   * because both sides come from the same detection pass — it passed happily
   * while 13 topics pointed at the wrong function (every momentum topic at
   * `rsi`, every volume topic at `obv`). This test fails instead.
   */
  test("every entry point corresponds to its topic slug", () => {
    // Split an identifier into lowercase word stems: camelCase, snake_case and
    // kebab-case all reduce to the same token set. Stemming to 4 characters lets
    // "validator"/"validate" and "detector"/"detect" match.
    const stems = (name: string): Set<string> =>
      new Set(
        name
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .split(/[-_\s]+/)
          .map((word) => word.toLowerCase())
          .filter((word) => word.length > 2)
          .map((word) => word.slice(0, 4)),
      );

    /**
     * An entry corresponds to its topic if it shares a word stem with the slug.
     * That is loose enough for descriptive names the catalog legitimately uses
     * (hampel-bad-tick-filter -> hampelFilter, stale-quote-detector ->
     * detectStaleQuotes) and strict enough to catch the real failure, where a
     * topic ends up on a completely unrelated function (williams-r -> rsi).
     */
    const corresponds = (slug: string, entry: string): boolean => {
      const slugStems = stems(slug);
      for (const stem of stems(entry)) if (slugStems.has(stem)) return true;

      // Whole-word containment, for names the camelCase splitter fragments —
      // "calculateMcClellanValues" becomes Mc + Clellan, losing "mcclellan".
      const flatEntry = entry.toLowerCase().replace(/[-_]/g, "");
      if (slug.split("-").some((word) => word.length > 3 && flatEntry.includes(word))) return true;

      // Initialisms: relative-strength-index -> rsi, on-balance-volume -> obv.
      const initials = slug.split("-").map((part) => part[0]).join("");
      return entry.toLowerCase() === initials || flatEntry === slug.replace(/-/g, "");
    };

    // Deliberate, reviewed exceptions: the export name shares no word with the
    // slug because one side is an abbreviation of the other, or because the
    // topic is one of several built on a shared generic verb.
    const reviewed: Record<string, string> = {
      "D01-F01-A01": "constructBars", "D01-F01-A02": "constructBars", "D01-F01-A03": "constructBars",
      "D01-F01-A04": "constructBars", "D01-F01-A05": "constructBars", "D01-F01-A06": "constructBars",
      "D01-F01-A07": "constructBars",
      "D01-F03-A05": "classifyIntervalPair",
      "D01-F04-A02": "validateClockProfile",
      "D01-F04-A03": "consensus",
      "D01-F04-A05": "asOfSnapshot",
      "D02-F04-A02": "guardSurvivorship",
      "D04-F03-A04": "evaluateSnapshot", "D04-F03-A05": "evaluateSnapshot", "D04-F03-A06": "evaluateSnapshot",
      "D07-F01-A04": "calculateRma",
      "D07-F04-A02": "average_true_range", // slug is the initialism ATR

      // Structural VAR. The module exports nine functions, and the topic's own
      // catalog test invokes fitRecursiveSVAR() and nothing else — the highest
      // confidence signal available. SVAR is the abbreviation the slug spells
      // out, which the camelCase splitter cannot recover.
      "D09-F03-A02": "fitRecursiveSVAR",

      // Three state-and-regime models whose authors each named their single
      // export runFilter. These are NOT the shared-implementation bug: the three
      // files are distinct, and each exports exactly one function, so detection
      // cannot pick the wrong one. Only the name is generic.
      "D09-F04-A04": "runFilter",
      "D09-F04-A05": "runFilter",
      "D09-F04-A06": "runFilter",
    };

    const offenders: string[] = [];
    for (const t of topics) {
      if (t.entry === "calculate") continue; // the catalog's generic convention
      if (reviewed[t.id] === t.entry) continue;
      if (corresponds(t.slug, t.entry)) continue;
      offenders.push(`${t.id} (${t.slug}) exposes ${t.entry}()`);
    }

    assert.deepStrictEqual(
      offenders,
      [],
      "entry points that do not correspond to their topic slug — a mis-detection, " +
        "or a new reviewed exception that belongs in this test's `reviewed` map",
    );
  });

  /**
   * Two topics generated from the SAME catalog file must not resolve to the same
   * function — that is the exact fingerprint of the shared-implementation bug.
   */
  test("topics sharing an implementation expose distinct entry points", () => {
    const byFamilyEntry = new Map<string, string[]>();
    for (const t of topics) {
      // Same family + same entry + more than one topic is only suspicious when
      // the family is one of the known shared-file families.
      const key = `${t.familyId}::${t.entry}`;
      byFamilyEntry.set(key, [...(byFamilyEntry.get(key) ?? []), t.id]);
    }
    const sharedFileFamilies = ["D07-F03", "D07-F04", "D07-F05"];
    const clashes = [...byFamilyEntry.entries()]
      .filter(([key, ids]) => ids.length > 1 && sharedFileFamilies.includes(key.split("::")[0]))
      .map(([key, ids]) => `${key} claimed by ${ids.join(", ")}`);

    assert.deepStrictEqual(clashes, [], "topics from a shared implementation file collapsed onto one entry point");
  });

  test("lookup helpers agree with the registry", () => {
    const sample = topics[0];
    assert.equal(topic(sample.id)?.id, sample.id);
    assert.equal(topic("D00-F00-A00"), undefined);

    const d07 = byDomain("D07");
    assert.ok(d07.length > 0 && d07.every((t) => t.domainId === "D07"));

    const f0101 = byFamily("D01-F01");
    assert.ok(f0101.length > 0 && f0101.every((t) => t.familyId === "D01-F01"));

    const shapes = new Set(topics.map((t) => t.archetype));
    for (const shape of shapes) {
      assert.ok(byArchetype(shape).length > 0, `no topics for archetype ${shape}`);
    }
  });

  test("load() rejects an unknown id", async () => {
    await assert.rejects(() => load("D99-F99-A99"), /unknown topic id/);
  });
});

describe("every topic module", () => {
  for (const t of topics) {
    test(`${t.id} — ${t.path}`, async () => {
      const mod = (await load(t.id)) as Record<string, unknown>;

      assert.equal(typeof mod.run, "function", `${t.id}: run() is not callable`);
      assert.equal(
        typeof mod[t.entry],
        "function",
        `${t.id}: declared entry \`${t.entry}\` is not an exported function`,
      );
      assert.equal(mod.run, mod[t.entry], `${t.id}: run is not an alias of ${t.entry}`);

      const meta = mod.meta as Record<string, unknown>;
      assert.equal(meta.id, t.id, `${t.id}: module meta.id disagrees with the registry`);
      assert.equal(meta.path, t.path, `${t.id}: module meta.path disagrees with the registry`);
      assert.equal(meta.entry, t.entry, `${t.id}: module meta.entry disagrees with the registry`);

      for (const name of t.exports) {
        assert.equal(
          typeof mod[name],
          "function",
          `${t.id}: registry lists \`${name}\` but the module does not export it as a function`,
        );
      }

      const fn = await runner(t.id);
      assert.equal(typeof fn, "function");
    });
  }
});
