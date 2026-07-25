/**
 * Conformance — every topic that ships a `{ input, expected }` worked example in
 * the edufintech catalog must reproduce that example exactly.
 *
 * These fixtures are the same values the published article and the standalone
 * per-algorithm repo assert against, so a green run here means the package, the
 * article, and the repo agree on the arithmetic.
 *
 * Fixtures are copied verbatim by `scripts/sync.mjs`; never edit them here.
 * Tests run straight off `src/` via Node's type-stripping — no build required.
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
  hasInputExpected: boolean;
}

const manifest = JSON.parse(readFileSync(join(HERE, "_manifest.json"), "utf8")) as {
  topicCount: number;
  topics: ManifestTopic[];
};

const conformance = manifest.topics.filter((t) => t.hasInputExpected && t.fixture);

describe("conformance: catalog worked examples", () => {
  test("the catalog still ships fixtures to check", () => {
    assert.ok(
      conformance.length > 0,
      "no { input, expected } fixtures found — did scripts/sync.mjs run?",
    );
  });

  for (const topic of conformance) {
    test(`${topic.id} — ${topic.path}`, async () => {
      const fixture = JSON.parse(
        readFileSync(join(HERE, "fixtures", topic.fixture as string), "utf8"),
      ) as { input: unknown; expected: Record<string, unknown> };

      const mod = (await import(`../src/${topic.path}/index.ts`)) as Record<string, unknown>;
      const run = mod.run;
      assert.equal(typeof run, "function", `${topic.id} exposes no callable run()`);

      // structuredClone guards against an implementation mutating its input and
      // making a later assertion pass for the wrong reason.
      const actual = (run as (input: unknown) => Record<string, unknown>)(
        structuredClone(fixture.input),
      );

      assert.ok(
        actual !== null && typeof actual === "object",
        `${topic.id} returned ${typeof actual}, expected an object`,
      );

      // `expected` is asserted as a subset: some fixtures document only the
      // fields the article walks through, not the full result payload.
      for (const [field, want] of Object.entries(fixture.expected)) {
        assert.deepStrictEqual(
          actual[field],
          want,
          `${topic.id}: field \`${field}\` does not match the worked example`,
        );
      }
    });
  }
});
