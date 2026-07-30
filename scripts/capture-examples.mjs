#!/usr/bin/env node
/**
 * Record a real, executed worked example for every topic.
 *
 * Why this exists: 146 of 187 reference pages had no example at all, because the
 * package only prints the clean `{ input, expected }` fixtures — 41 of them. The
 * remaining topics are not undocumentable; their inputs simply live in the
 * catalog rather than in a shape the conformance harness happens to consume.
 *
 * Every topic in the catalog has a test that calls its entry function with
 * authored input. This runs that test with the implementation instrumented (see
 * `lib/capture-hook.mjs`) and records the arguments and the return value of the
 * first call. Nothing is invented and nothing is transcribed by hand: the
 * example on the page is the function's own output.
 *
 * One child process per topic, so a topic whose test crashes or hangs cannot
 * take the run with it. Output is `test/_examples.json`, consumed by
 * `gen-docs.mjs` and committed like every other generated artefact.
 *
 * Usage:
 *   node scripts/capture-examples.mjs [--content-root <path>] [--only D07-F01]
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const CONTENT_ROOT = resolve(
  arg("--content-root", process.env.FINTECH_CONTENT_ROOT ?? resolve(REPO, "..", "..")),
);
const DOMAINS = join(CONTENT_ROOT, "algorithms", "domains");
const ONLY = arg("--only", null);
const OUT = join(REPO, "test", "_examples.json");
const HOOK = pathToFileURL(join(REPO, "scripts", "lib", "capture-hook.mjs")).href;

const manifest = JSON.parse(readFileSync(join(REPO, "test", "_manifest.json"), "utf8"));

const subdirs = (p) => {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
};

/** id → catalog topic directory. */
const catalog = new Map();
for (const domain of subdirs(DOMAINS)) {
  for (const family of subdirs(join(DOMAINS, domain))) {
    for (const topic of subdirs(join(DOMAINS, domain, family))) {
      const m = /^(D\d{2}-F\d{2}-A\d{2})-/.exec(topic);
      if (m) catalog.set(m[1], join(DOMAINS, domain, family, topic));
    }
  }
}
if (catalog.size === 0) {
  console.error(`capture-examples: no catalog at ${DOMAINS}`);
  process.exit(1);
}

const pick = (dir, sub, ext) => {
  const d = join(dir, sub);
  if (!existsSync(d)) return null;
  const f = readdirSync(d).filter((x) => x.endsWith(ext)).sort();
  return f.length ? join(d, f[0]) : null;
};

/**
 * Call the package's own entry with arguments a sibling really received.
 *
 * Only for the generated thin wrappers — `double_top(close)` beside the shared
 * `detectReversal(close, pattern, overrides)`. The catalog never declares those,
 * so they cannot be instrumented there; the data is identical either way.
 */
async function deriveFromPackage(topic, siblingArgs) {
  try {
    const mod = await import(pathToFileURL(join(REPO, "src", topic.path, "index.ts")).href);
    const fn = mod[topic.entry];
    if (typeof fn !== "function") return null;
    const args = siblingArgs.slice(0, fn.length || 1);
    return { args, value: fn(...args), derived: true };
  } catch {
    return null;
  }
}

const tmp = mkdtempSync(join(tmpdir(), "fa-capture-"));
const results = {};
let captured = 0;
const skipped = [];

for (const topic of manifest.topics) {
  if (ONLY && !topic.id.startsWith(ONLY)) continue;

  const dir = catalog.get(topic.id);
  if (!dir) {
    skipped.push(`${topic.id}: not in catalog`);
    continue;
  }
  const impl = pick(dir, join("implementations", "typescript"), ".ts");
  const test = pick(dir, "tests", ".test.ts");
  if (!impl || !test) {
    skipped.push(`${topic.id}: ${!impl ? "no implementation" : "no test"}`);
    continue;
  }

  const outFile = join(tmp, `${topic.id}.json`);
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--import", `data:text/javascript,
      import { register } from "node:module";
      register(${JSON.stringify(HOOK)});`, test],
    {
      env: {
        ...process.env,
        CAPTURE_IMPL_URL: pathToFileURL(impl).href,
        CAPTURE_ENTRY: topic.entry,
        CAPTURE_SCOPE: pathToFileURL(DOMAINS).href,
        CAPTURE_OUT: outFile,
      },
      timeout: 30_000,
      encoding: "utf8",
    },
  );

  if (!existsSync(outFile)) {
    // The catalog has no wrapper to instrument for these — sync.mjs generates
    // the per-topic entry into the package. Finish against the published module
    // using the arguments the shared implementation was actually handed.
    if (existsSync(`${outFile}.sibling`)) {
      const { args } = JSON.parse(readFileSync(`${outFile}.sibling`, "utf8"));
      const derived = await deriveFromPackage(topic, args);
      if (derived) {
        results[topic.id] = derived;
        captured++;
        continue;
      }
    }
    const why = run.error?.message ?? (run.stderr || "").split("\n").find((l) => l.trim()) ?? "entry never called";
    skipped.push(`${topic.id}: ${why.slice(0, 100)}`);
    continue;
  }

  try {
    const { args, value, derived } = JSON.parse(readFileSync(outFile, "utf8"));
    results[topic.id] = { args, value, ...(derived ? { derived: true } : {}) };
    captured++;
  } catch (e) {
    skipped.push(`${topic.id}: unreadable capture — ${e.message.slice(0, 60)}`);
  }
}

rmSync(tmp, { recursive: true, force: true });

const sorted = Object.fromEntries(Object.keys(results).sort().map((k) => [k, results[k]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n", "utf8");

console.log(`  captured ${captured} executed examples, ${skipped.length} without one`);
for (const s of skipped.slice(0, 15)) console.log(`    - ${s}`);
if (skipped.length > 15) console.log(`    …and ${skipped.length - 15} more`);
