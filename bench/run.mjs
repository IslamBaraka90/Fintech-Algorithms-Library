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
 *   node bench/run.mjs --save              record the ratios in bench/results.json
 *   node bench/run.mjs --check             fail if a recorded ratio has regressed
 *
 * Only RATIOS are recorded. Absolute ops/sec belong to the machine that
 * produced them and mean nothing anywhere else, but a ratio is measured for both
 * implementations in the same process on the same hardware, so runner noise
 * moves both sides together. That is what makes `--check` safe to run in CI on
 * a shared runner, and why bench/results.json stores no timings.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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
const SAVE = argv.includes("--save");
const CHECK = argv.includes("--check");
const target = argv.find((a) => !a.startsWith("--") && Number.isNaN(Number(a)));

const RESULTS = join(HERE, "results.json");
/**
 * How far a ratio may drift below its recorded value before `--check` fails.
 * Generous on purpose: a shared CI runner is noisy, and this gate exists to
 * catch an override that stopped being worth its second implementation, not to
 * police a few percent.
 */
const REGRESSION_TOLERANCE = 0.75;

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

const ROUNDS = 5;

/** Time `fn(...args)` for `budgetMs` and report calls per second. */
function measure(fn, args, budgetMs) {
  let calls = 0;
  const started = process.hrtime.bigint();
  const deadline = started + BigInt(Math.max(1, Math.round(budgetMs))) * 1_000_000n;
  let now;
  do {
    for (let i = 0; i < 50; i++) fn(...args);
    calls += 50;
    now = process.hrtime.bigint();
  } while (now < deadline);
  return calls / (Number(now - started) / 1e9);
}

function warmUp(fn, args) {
  // Enough iterations for V8 to have tiered the function up before it counts.
  try {
    for (let i = 0; i < 2000; i++) fn(...args);
    return true;
  } catch {
    return false;
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Compare two implementations by alternating them in short rounds and taking
 * the median ratio.
 *
 * Measuring one fully and then the other produced ratios that moved between
 * 2.7x and 5.0x on the same code, because whichever ran second met a different
 * JIT and GC state. Interleaving puts both through the same conditions, and the
 * median discards the round where a collection landed mid-measurement. The
 * ratio is the only output — absolute throughput still belongs to the machine.
 */
function compare(shippedFn, referenceFn, args) {
  if (!warmUp(shippedFn, args) || !warmUp(referenceFn, args)) return null;
  const per = BUDGET_MS / ROUNDS;
  const ratios = [];
  let shippedOps = 0;
  let referenceOps = 0;
  for (let round = 0; round < ROUNDS; round++) {
    // Alternate the order too, so neither position is systematically favoured.
    const first = round % 2 === 0;
    const a = first ? measure(shippedFn, args, per) : null;
    const b = measure(referenceFn, args, per);
    const a2 = first ? a : measure(shippedFn, args, per);
    shippedOps = Math.max(shippedOps, a2);
    referenceOps = Math.max(referenceOps, b);
    ratios.push(a2 / b);
  }
  return { ratio: median(ratios), shippedOps, referenceOps, spread: Math.max(...ratios) - Math.min(...ratios) };
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

const recorded = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : { overrides: {} };
const measured = {};
const regressions = [];

let compared = 0;
for (const topic of chosen) {
  const args = examples[topic.id].args;
  const shipped = await import(pathToFileURL(join(REPO, "src", topic.path, "index.ts")).href);
  const fn = shipped[topic.entry];
  if (typeof fn !== "function") continue;

  let line = `  ${topic.path.slice(-46).padEnd(46)}`;

  if (overridden.has(topic.id)) {
    const reference = await import(pathToFileURL(join(REPO, "src", topic.path, "reference.ts")).href);
    const refFn = reference[topic.entry];
    const result = typeof refFn === "function" ? compare(fn, refFn, args) : null;
    if (!result) continue;
    compared++;
    const { ratio, shippedOps, referenceOps, spread } = result;
    measured[topic.id] = { path: topic.path, ratio: Number(ratio.toFixed(2)) };

    const verdict = ratio >= 1 ? `${ratio.toFixed(2)}x faster` : `${(1 / ratio).toFixed(2)}x SLOWER`;
    line += ` ${fmt(shippedOps).padStart(10)} ${fmt(referenceOps).padStart(11)}   ${verdict}  ±${spread.toFixed(2)}`;

    const before = recorded.overrides?.[topic.id]?.ratio;
    if (before !== undefined) {
      line += `  (was ${before.toFixed(2)}x)`;
      if (ratio < before * REGRESSION_TOLERANCE) {
        regressions.push(`${topic.id} ${topic.path}: ${before.toFixed(2)}x → ${ratio.toFixed(2)}x`);
      }
    } else {
      line += `  (new)`;
    }
  } else {
    if (!warmUp(fn, args)) continue;
    line += ` ${fmt(measure(fn, args, BUDGET_MS)).padStart(10)} ${"—".padStart(11)}`;
  }
  console.log(line);
}

if (compared) {
  console.log(
    `\n  ${compared} override(s) compared against their reference.` +
      `\n  A ratio under about 1.2x rarely justifies a second implementation to maintain.`,
  );
} else {
  console.log("");
}

if (SAVE) {
  mkdirSync(HERE, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(measured).sort().map((k) => [k, measured[k]]));
  writeFileSync(
    RESULTS,
    JSON.stringify(
      {
        note:
          "Ratios only — an override against the reference it replaces, both measured in " +
          "the same process. Absolute timings are not recorded because they describe a " +
          "machine rather than the code. Regenerate with `npm run bench -- --save`.",
        overrides: sorted,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`  wrote bench/results.json — ${Object.keys(sorted).length} override(s)\n`);
}

if (CHECK) {
  const known = Object.keys(recorded.overrides ?? {});
  const missing = known.filter((id) => !(id in measured));
  if (missing.length) {
    console.error(`\n  ${missing.length} recorded override(s) were not measured: ${missing.join(", ")}`);
    console.error(`  Either the override was removed — rerun with --save — or the run is incomplete.\n`);
    process.exit(1);
  }
  if (regressions.length) {
    console.error(`\n  REGRESSED — an override lost more than ${Math.round((1 - REGRESSION_TOLERANCE) * 100)}% of its advantage:\n`);
    for (const line of regressions) console.error(`    ${line}`);
    console.error(
      `\n  Either the optimisation stopped working, or the reference got faster and the\n` +
        `  override is no longer worth maintaining. Both are worth knowing.\n`,
    );
    process.exit(1);
  }
  console.log(`  no regressions against bench/results.json\n`);
} else if (!SAVE) {
  console.log("");
}
