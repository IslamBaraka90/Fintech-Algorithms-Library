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
