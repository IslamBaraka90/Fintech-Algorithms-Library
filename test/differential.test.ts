/**
 * Differential test — an override must behave exactly like the implementation
 * it replaces.
 *
 * A topic can ship a hand-written implementation from `optimised/` instead of
 * the catalog's. That is how a contributor makes something faster without
 * touching the private catalog, and how the article keeps a version a learner
 * can read while the package ships one tuned for production.
 *
 * The bargain is that the two must be indistinguishable from outside. `sync.mjs`
 * writes the catalog version next to the override as `reference.ts` whenever one
 * ships; this file runs both against the same inputs and asserts they agree.
 *
 * The inputs are the captured example arguments — real calls recorded by
 * `capture-examples.mjs` — plus prefixes of any array argument, which is where
 * a rewritten accumulator or a reused buffer tends to diverge first: warm-up
 * boundaries, the first window, an empty tail.
 *
 * When no topic ships an override, so is this suite. That is the normal state.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

type Manifest = {
  topics: Array<{ id: string; path: string; entry: string; entryParams?: string[] }>;
};

const manifest = JSON.parse(readFileSync(join(HERE, "_manifest.json"), "utf8")) as Manifest;
const examples: Record<string, { args?: unknown[] }> = existsSync(join(HERE, "_examples.json"))
  ? JSON.parse(readFileSync(join(HERE, "_examples.json"), "utf8"))
  : {};

// A topic ships an override exactly when sync emitted a reference beside it.
const overridden = manifest.topics.filter((topic) => existsSync(join(SRC, topic.path, "reference.ts")));

/**
 * Argument sets to compare on. The recorded call comes first; the rest shorten
 * one array argument at a time, so a topic whose warm-up handling differs shows
 * it rather than passing on the one input that was captured.
 */
function inputSets(args: unknown[]): unknown[][] {
  const sets: unknown[][] = [args];
  args.forEach((arg, index) => {
    if (!Array.isArray(arg) || arg.length < 2) return;
    for (const take of [1, 2, Math.ceil(arg.length / 2), arg.length - 1]) {
      if (take < 1 || take >= arg.length) continue;
      const variant = [...args];
      variant[index] = arg.slice(0, take);
      sets.push(variant);
    }
  });
  return sets;
}

/** Errors count as behaviour: same class, same message, or the override is wrong. */
function call(fn: (...a: unknown[]) => unknown, args: unknown[]) {
  try {
    return { ok: true as const, value: fn(...args) };
  } catch (error) {
    return {
      ok: false as const,
      name: (error as Error)?.constructor?.name ?? "Error",
      message: (error as Error)?.message ?? String(error),
    };
  }
}

test("every override behaves exactly like the implementation it replaces", async (t) => {
  if (overridden.length === 0) {
    t.skip("no topic ships an override");
    return;
  }

  for (const topic of overridden) {
    const id = topic.id;
    const shipped = (await import(pathToFileURL(join(SRC, topic.path, "index.ts")).href)) as Record<string, unknown>;
    const reference = (await import(pathToFileURL(join(SRC, topic.path, "reference.ts")).href)) as Record<
      string,
      unknown
    >;

    const shippedFn = shipped[topic.entry];
    const referenceFn = reference[topic.entry];
    assert.equal(typeof shippedFn, "function", `${id}: the shipped module exposes no ${topic.entry}()`);
    assert.equal(typeof referenceFn, "function", `${id}: the reference exposes no ${topic.entry}()`);

    const recorded = examples[id]?.args;
    if (!Array.isArray(recorded)) {
      // Nothing executed this entry, so there is no call to replay. The override
      // still had to pass the entry-point and purity gates in sync.mjs.
      continue;
    }

    for (const args of inputSets(recorded)) {
      const a = call(shippedFn as (...x: unknown[]) => unknown, args);
      const b = call(referenceFn as (...x: unknown[]) => unknown, args);
      const label = `${id} on ${JSON.stringify(args).slice(0, 90)}`;

      assert.equal(a.ok, b.ok, `${label}: one threw and the other did not`);
      if (a.ok && b.ok) {
        assert.deepEqual(a.value, b.value, `${label}: the override returned a different value`);
      } else if (!a.ok && !b.ok) {
        assert.equal(a.name, b.name, `${label}: different error class`);
        assert.equal(a.message, b.message, `${label}: different error message`);
      }
    }
  }
});
