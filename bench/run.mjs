#!/usr/bin/env node
/**
 * bench/run.mjs — measure a topic, and measure an override against the
 * implementation it replaces.
 *
 * This exists because "this is faster" is otherwise unfalsifiable. An override
 * under `optimised/` is a second implementation to maintain forever, so it has
 * to earn that by beating the reference on a number both sides can reproduce.
 *
 * Every call uses the arguments `capture-examples.mjs` recorded from the
 * topic's own test, so nothing here invents a workload.
 *
 *   node bench/run.mjs                     every topic that ships an override
 *   node bench/run.mjs rsi                 one topic, by slug, id or subpath
 *   node bench/run.mjs --all               every topic with a captured example
 *   node bench/run.mjs rsi --ms 2000       spend longer per measurement
 *
 * Numbers are comparable within one run on one machine and nowhere else. Quote
 * the ratio between two implementations, never the absolute ops/sec.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const argv = process.argv.slice(2);

const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const BUDGET_MS = flag("--ms", 750);
const ALL = argv.includes("--all");
const target = argv.find((a) => !a.startsWith("--") && Number.isNaN(Number(a)));

const manifest = JSON.parse(readFileSync(join(REPO, "test", "_manifest.json"), "utf8"));
const examplesPath = join(REPO, "test", "_examples.json");
if (!existsSync(examplesPath)) {
  console.error("  test/_examples.json is missing — run `npm run examples` first.");
  process.exit(1);
}
const examples = JSON.parse(readFileSync(examplesPath, "utf8"));


const overridden = new Set(
  manifest.topics.filter((t) => existsSync(join(REPO, "src", t.path, "reference.ts"))).map((t) => t.id),
);

/** Time `fn(...args)` for a fixed budget and report calls per second. */
function measure(fn, args) {
  // Warm up so the first measured call is not paying for optimisation.
  for (let i = 0; i < 20; i++) {
    try { fn(...args); } catch { return null; }
  }
  let calls = 0;
  const started = process.hrtime.bigint();
  const deadline = started + BigInt(BUDGET_MS) * 1_000_000n;
  let now;
  do {
    for (let i = 0; i < 50; i++) fn(...args);
    calls += 50;
    now = process.hrtime.bigint();
  } while (now < deadline);
  const seconds = Number(now - started) / 1e9;
  return { opsPerSecond: calls / seconds, calls, seconds };
}

const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0);

function select() {
  const withExample = manifest.topics.filter((t) => Array.isArray(examples[t.id]?.args));
  if (target) {
    const q = target.toLowerCase();
    const hit = withExample.filter(
      (t) => t.id.toLowerCase() === q || t.path.toLowerCase().endsWith("/" + q) || t.path.toLowerCase() === q,
    );
    if (!hit.length) {
      console.error(`  no topic with a captured example matches "${target}"`);
      process.exit(1);
    }
    return hit;
  }
  if (ALL) return withExample;
  const only = withExample.filter((t) => overridden.has(t.id));
  if (!only.length) {
    console.error(
      "  No topic ships an override yet, so there is nothing to compare.\n" +
        "  Run `node bench/run.mjs --all` to measure the library, or name a topic.",
    );
    process.exit(0);
  }
  return only;
}

const chosen = select();
console.log(`\n  fintech-algorithms — bench`);
console.log(`  ${chosen.length} topic(s) · ${BUDGET_MS}ms per measurement · node ${process.version}\n`);
console.log(`  ${"topic".padEnd(46)} ${"shipped".padStart(10)} ${"reference".padStart(11)}   change`);
console.log(`  ${"-".repeat(46)} ${"-".repeat(10)} ${"-".repeat(11)}   ------`);

let compared = 0;
for (const topic of chosen) {
  const args = examples[topic.id].args;
  const shipped = await import(pathToFileURL(join(REPO, "src", topic.path, "index.ts")).href);
  const fn = shipped[topic.entry];
  if (typeof fn !== "function") continue;

  const a = measure(fn, args);
  if (!a) continue;

  let line = `  ${topic.path.slice(-46).padEnd(46)} ${fmt(a.opsPerSecond).padStart(10)}`;

  if (overridden.has(topic.id)) {
    const reference = await import(pathToFileURL(join(REPO, "src", topic.path, "reference.ts")).href);
    const refFn = reference[topic.entry];
    const b = typeof refFn === "function" ? measure(refFn, args) : null;
    if (b) {
      compared++;
      const ratio = a.opsPerSecond / b.opsPerSecond;
      const verdict = ratio >= 1 ? `${ratio.toFixed(2)}x faster` : `${(1 / ratio).toFixed(2)}x SLOWER`;
      line += ` ${fmt(b.opsPerSecond).padStart(11)}   ${verdict}`;
    }
  } else {
    line += ` ${"—".padStart(11)}`;
  }
  console.log(line);
}

if (compared) {
  console.log(
    `\n  ${compared} override(s) compared against their reference.` +
      `\n  A ratio under about 1.2x rarely justifies a second implementation to maintain.\n`,
  );
} else {
  console.log("");
}
