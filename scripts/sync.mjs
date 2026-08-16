#!/usr/bin/env node
/**
 * sync.mjs — generate the `fintech-algorithms` package from the edufintech catalog.
 *
 * The catalog at `<content-root>/algorithms/domains/**` is the single source of
 * truth. This script is the wall between the teaching monorepo and the published
 * library: it copies each topic's TypeScript implementation into a subpath module
 * whose path mirrors the article URL, then regenerates the registry, the
 * package.json `exports` map, and the conformance fixtures.
 *
 * Everything under `src/` except `src/_shared/` is generated. Never hand-edit it —
 * edit the catalog implementation and re-run `npm run sync`.
 *
 * Usage:
 *   node scripts/sync.mjs [--content-root <path>] [--check]
 *
 *   --check   Generate into memory and fail (exit 1) if the checked-in output
 *             would change. Use in CI to prove the package is in sync.
 *
 * Zero runtime dependencies by design — the repo must stand alone.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes("--check");

function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const CONTENT_ROOT = resolve(
  argValue("--content-root", process.env.FINTECH_CONTENT_ROOT ?? resolve(REPO, "..", "..")),
);
const DOMAINS_DIR = join(CONTENT_ROOT, "algorithms", "domains");

if (!existsSync(DOMAINS_DIR)) {
  console.error(
    `\n  Catalog not found at ${DOMAINS_DIR}\n\n` +
      `  Point the script at your edufintech checkout:\n` +
      `    node scripts/sync.mjs --content-root /path/to/edufintech\n` +
      `  or set FINTECH_CONTENT_ROOT.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tiny YAML reader
//
// metadata.yaml files are a flat `key: value` map plus a one-level `repo:` block.
// A 30-line reader keeps this script dependency-free; anything more exotic in the
// catalog should fail loudly rather than be silently half-parsed.
// ---------------------------------------------------------------------------

function unquote(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function readMetadata(file) {
  const out = {};
  let block = null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const top = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (top) {
      const [, key, rest] = top;
      if (rest.trim() === "") {
        block = key;
        out[key] = {};
      } else {
        block = null;
        out[key] = unquote(rest);
      }
      continue;
    }

    const nested = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (nested && block && typeof out[block] === "object") {
      out[block][nested[1]] = unquote(nested[2]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slugs — must match the thefintechbuilder.com article-URL convention exactly:
//   https://thefintechbuilder.com/<domain-slug>/<family-slug>/<topic-slug>/
// ---------------------------------------------------------------------------

function kebab(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function camel(text) {
  const parts = kebab(text).split("-");
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

const TOPIC_DIR_RE = /^D\d{2}-F\d{2}-A\d{2}-/;

/**
 * Domains present in the catalog but deliberately not published yet.
 *
 * The catalog is written ahead of the package: a domain lands there complete
 * enough to validate long before its articles are finished, and publishing a
 * subpath commits us to its API forever. Holding one back is a publishing
 * decision, so it is made here, by id, in the open — not inferred from
 * `status:` in metadata, which marks editorial progress and is carried by
 * plenty of already-published topics.
 *
 * Deleting a line here ships that domain on the next sync. The held-back count
 * is printed in the run summary so this never silently swallows work.
 */
const DOMAINS_NOT_READY = {
  // All 52 articles are written and every topic has a TypeScript test, but five
  // families still route every topic through one `calculate(topicId, …)`
  // dispatcher, so 46 of the 52 resolve to the same entry point. Publishing that
  // would give 46 valuation subpaths the same function. Give each topic its own
  // slug-named export, as D40-F05 and D21-F01 did, and delete this line.
  D18: "46 of 52 topics still share one calculate() dispatcher",
};

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
}

/** Domains skipped by DOMAINS_NOT_READY, with how many topics each held back. */
const heldBack = [];

function discoverTopics() {
  const found = [];
  for (const domainDir of listDirs(DOMAINS_DIR)) {
    const reason = DOMAINS_NOT_READY[domainDir.slice(0, 3)];
    if (reason) {
      const count = listDirs(join(DOMAINS_DIR, domainDir))
        .flatMap((familyDir) => listDirs(join(DOMAINS_DIR, domainDir, familyDir)))
        .filter((topicDir) => TOPIC_DIR_RE.test(topicDir)).length;
      heldBack.push({ domain: domainDir, count, reason });
      continue;
    }
    for (const familyDir of listDirs(join(DOMAINS_DIR, domainDir))) {
      for (const topicDir of listDirs(join(DOMAINS_DIR, domainDir, familyDir))) {
        if (!TOPIC_DIR_RE.test(topicDir)) continue; // skips __pycache__, shared/, etc.
        found.push({
          dir: join(DOMAINS_DIR, domainDir, familyDir, topicDir),
          domainDir,
          familyDir,
          topicDir,
        });
      }
    }
  }
  return found;
}

/**
 * The real implementation file for a topic.
 *
 * `example.ts` is excluded on purpose: those are tutorial demo scripts, and they
 * are the only files in the catalog that touch `node:fs` or use extensionless
 * imports. Keeping them out is what makes the package runtime-agnostic.
 */
function implementationFile(topicDir) {
  const tsDir = join(topicDir, "implementations", "typescript");
  if (!existsSync(tsDir)) return null;
  const candidates = readdirSync(tsDir)
    .filter((name) => name.endsWith(".ts") && name !== "example.ts")
    .sort();
  if (candidates.length === 0) return null;
  return join(tsDir, candidates[0]);
}

// ---------------------------------------------------------------------------
// Source analysis
// ---------------------------------------------------------------------------

const EXPORTED_FN_RE = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;
const EXPORTED_ARROW_RE = /^export\s+const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(/gm;
const EXPORTED_ANY_RE = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_]+)/gm;

/**
 * Parameter names of an exported function, in order.
 *
 * Used to bind a Convention C fixture's `bars` columns to the right positional
 * arguments: a function declared `(high, low, close, p = 14)` gets the three
 * price series plus its own default for `p`.
 */
function signatureParams(source, fnName) {
  // Two declaration forms reach this. Only the first was ever matched, so every
  // topic whose entry is an arrow — the D08 continuation and matching families —
  // recorded an empty parameter list and published a signature that reads as a
  // zero-argument function. An empty list also satisfies the api: contract
  // check, so the documentation would have agreed with itself and both would
  // have been wrong.
  const match =
    source.match(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fnName}\\s*\\(([\\s\\S]*?)\\)\\s*[:{]`)) ??
    source.match(
      new RegExp(
        `export\\s+const\\s+${fnName}\\s*(?::[^=]+?)?=\\s*(?:async\\s+)?(?:<[^>]*>\\s*)?\\(([\\s\\S]*?)\\)\\s*(?::[^=]+?)?=>`,
      ),
    );
  if (!match) return [];
  const raw = match[1];
  if (!raw.trim()) return [];
  // Split on top-level commas only (types may contain commas, e.g. Record<a, b>).
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of raw) {
    if ("([{<".includes(char)) depth++;
    else if (")]}>".includes(char)) depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts
    // `radius?: number` splits to `radius?`, which is not a valid identifier and
    // used to be filtered out — silently deleting an optional parameter from the
    // MIDDLE of the list and shifting every later one left. The published
    // signature then told a caller to pass the fourth argument in third
    // position. Strip the marker instead of losing the parameter.
    .map((part) => part.trim().split(/[:=]/)[0].trim().replace(/\?$/, ""))
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

/** Cheap stable hash of an implementation body, for shared-file detection. */
function hashBody(source) {
  let hash = 5381;
  for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function matchAll(source, re) {
  const names = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(source)) !== null) names.push(m[1]);
  return names;
}

function analyse(source) {
  const functions = [...new Set([...matchAll(source, EXPORTED_FN_RE), ...matchAll(source, EXPORTED_ARROW_RE)])];
  const allNames = [...new Set(matchAll(source, EXPORTED_ANY_RE))];
  return { functions, allNames };
}

/** Trailing nouns that appear in a topic slug but not in its function name. */
const GENERIC_SUFFIXES = ["oscillator", "index", "line", "bands", "channels", "cloud", "ratio", "indicator", "estimator", "detector", "detection", "calculation", "analysis", "model", "test", "rule", "engine", "method"];

/**
 * Reviewed entry points for topics whose module exports two peer functions and
 * whose own test exercises both, so neither the test signal nor the slug rules
 * can choose. Each line is a deliberate judgement about which function IS the
 * topic; the other is a companion diagnostic.
 *
 * Keep this list short. If it starts growing, the naming convention in the
 * catalog is the thing to fix.
 */
/**
 * Topic groups that legitimately share one implementation AND one entry point,
 * because they are the same algorithm applied to different inputs. Listed
 * explicitly so the collision gate stays strict for everything else.
 */
const SHARED_ENTRY_EXEMPT = [
  // Sector and factor diffusion are one diffusion index over different
  // component sets; the function is identical, only the rows differ.
  ["D04-F05-A04", "D04-F05-A05"],
];

/**
 * Exact topic sets whose shared implementation intentionally exposes every
 * topic entry through every peer subpath. New or expanded broad facades must be
 * reviewed here; otherwise sync fails instead of silently widening the public
 * API. D08-F02 is deliberately absent because each reversal subpath is private.
 */
const REVIEWED_SHARED_SURFACES = new Set([
  "D01-F05-A01,D01-F05-A02,D01-F05-A03,D01-F05-A04,D01-F05-A05,D01-F05-A06,D01-F05-A07",
  "D06-F01-A03,D06-F01-A04,D06-F01-A05,D06-F02-A01,D06-F02-A02,D06-F02-A03,D06-F02-A04,D06-F02-A05,D06-F02-A06,D06-F02-A07,D06-F02-A08,D06-F02-A09,D06-F03-A01,D06-F03-A02,D06-F03-A03,D06-F03-A04,D06-F03-A05,D06-F03-A06,D06-F03-A07,D06-F03-A08",
  "D06-F04-A01,D06-F04-A02,D06-F04-A03,D06-F04-A04,D06-F04-A05,D06-F04-A06,D06-F04-A07",
  "D07-F03-A01,D07-F03-A02,D07-F03-A03,D07-F03-A04,D07-F03-A05,D07-F03-A06,D07-F03-A07,D07-F03-A08",
  "D07-F05-A01,D07-F05-A02,D07-F05-A03,D07-F05-A04,D07-F05-A05,D07-F05-A06",
  "D08-F05-A01,D08-F05-A02,D08-F05-A03,D08-F05-A04,D08-F05-A05,D08-F05-A06,D08-F05-A07,D08-F05-A08",
  "D08-F06-A01,D08-F06-A02,D08-F06-A03,D08-F06-A04,D08-F06-A05,D08-F06-A06,D08-F06-A07,D08-F06-A08,D08-F06-A09",
  "D09-F01-A01,D09-F01-A02,D09-F01-A03,D09-F01-A04,D09-F01-A05,D09-F01-A06",
  "D09-F03-A01,D09-F03-A02,D09-F03-A03,D09-F03-A04,D09-F03-A05",
  "D09-F05-A01,D09-F05-A02,D09-F05-A03,D09-F05-A04,D09-F05-A05,D09-F05-A06",
  "D11-F01-A01,D11-F01-A02,D11-F01-A03,D11-F01-A04",
  "D11-F02-A01,D11-F02-A02,D11-F02-A03,D11-F02-A04,D11-F02-A05,D11-F02-A06",
  "D11-F03-A01,D11-F03-A02,D11-F03-A03,D11-F03-A04,D11-F03-A05,D11-F03-A06",
  "D11-F04-A01,D11-F04-A02,D11-F04-A03,D11-F04-A04,D11-F04-A05",
  "D11-F05-A01,D11-F05-A02,D11-F05-A03,D11-F05-A04,D11-F05-A05,D11-F05-A06,D11-F05-A07,D11-F05-A08",
  "D12-F01-A01,D12-F01-A02,D12-F01-A03,D12-F01-A04",
  "D12-F02-A01,D12-F02-A02,D12-F02-A03,D12-F02-A04,D12-F02-A05",
  "D12-F03-A01,D12-F03-A02,D12-F03-A03,D12-F03-A04,D12-F03-A05,D12-F03-A06",
  "D12-F04-A01,D12-F04-A02,D12-F04-A03,D12-F04-A04,D12-F04-A05,D12-F04-A06",
  "D13-F01-A01,D13-F01-A02,D13-F01-A03,D13-F01-A04",
  "D13-F02-A01,D13-F02-A02,D13-F02-A03,D13-F02-A04,D13-F02-A05",
  "D21-F01-A01,D21-F01-A02,D21-F01-A03,D21-F01-A04,D21-F01-A05,D21-F01-A06,D21-F01-A07",
  "D25-F01-A01,D25-F01-A02,D25-F01-A03,D25-F01-A04,D25-F01-A05",
  "D25-F02-A01,D25-F02-A02,D25-F02-A03,D25-F02-A04,D25-F02-A05",
  "D40-F05-A01,D40-F05-A02,D40-F05-A03,D40-F05-A04,D40-F05-A05,D40-F05-A06,D40-F05-A07,D40-F05-A08,D40-F05-A09,D40-F05-A10",
]);

const ENTRY_OVERRIDES = {
  // asOfSnapshot builds the point-in-time view; leakageAudit reports on it.
  "D01-F04-A05": "asOfSnapshot",
  // guardSurvivorship is the guard; compareEqualWeightedReturns illustrates the bias.
  "D02-F04-A02": "guardSurvivorship",
  // The trade-classification family shares one body exporting tickTest, quoteTest
  // and leeReady side by side. `leeReady` is this topic's algorithm; the stem
  // matcher cannot reach it because the slug carries two extra words
  // (lee-ready-trade-signing) that the export name does not.
  "D11-F01-A03": "leeReady",

  // Families below share one implementation whose exports are deliberate
  // abbreviations of the slug — `hodrick-prescott-filter` is exported as
  // `hpFilter`, `level-2-snapshot-and-delta-reconstruction` as `reconstructL2`.
  // No general rule can derive those, and every one of these families also
  // exports a generic `calculate`/`runTopic`, so without an explicit choice the
  // whole family would collapse onto it. Each line below is a reviewed decision.

  // D01-F05 order-book feed engineering
  "D01-F05-A01": "normalizeEvents",
  "D01-F05-A02": "reconstructL2",
  "D01-F05-A03": "reconstructL3",
  "D01-F05-A04": "recoverSequenceStream",
  "D01-F05-A05": "aggregatePriceLevels",
  "D01-F05-A06": "reconcileSnapshotIncrementals",
  "D01-F05-A07": "consolidateVenues",

  // D09-F05 decomposition and cycles
  "D09-F05-A01": "stlDecompose",
  "D09-F05-A02": "hpFilter",
  "D09-F05-A03": "bkFilter",
  "D09-F05-A04": "cfFilter",
  "D09-F05-A05": "fftPeriodogram",
  "D09-F05-A06": "haarWavelet",

  // D11-F05 market-depth analytics
  "D11-F05-A01": "cumulativeDepth",
  "D11-F05-A04": "expectedFillPrice",
  "D11-F05-A05": "sweepCostAndSlippage",
  "D11-F05-A06": "liquidityWallConcentration",
  "D11-F05-A07": "depthDepletionReplenishment",
  "D11-F05-A08": "marketDepthHeatmap",

  // D12-F04 order lifecycle and queue state
  "D12-F04-A01": "limitOrderLifecycle",
  "D12-F04-A03": "partialFillResidual",
  "D12-F04-A04": "queuePositionAheadVolume",
  "D12-F04-A05": "icebergReplenishment",
  "D12-F04-A06": "marketableOrderSweep",

  // D25-F02 DeFi position analytics
  "D25-F02-A02": "feeApr",
  "D25-F02-A03": "healthFactor",
};

/**
 * The function a topic's OWN catalog test invokes.
 *
 * This is the highest-confidence signal available: the newest families ship one
 * shared implementation per family (momentum.ts, volatility_channels.ts,
 * volume.ts) copied into every topic folder, so the file alone cannot say which
 * of its 6-8 exports belongs to this topic — but the topic's test calls exactly
 * one of them, and those suites pass.
 */
function entryFromTest(topicDir, exportedFunctions) {
  const testsDir = join(topicDir, "tests");
  if (!existsSync(testsDir)) return null;
  const source = readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(testsDir, name), "utf8"))
    .join("\n");
  if (!source) return null;

  // Called as `<moduleAlias>.<fn>(` — covers `indicator.williams_r(`, `vc.atr(`.
  const invoked = exportedFunctions.filter((fn) => new RegExp(`\\.\\s*${fn}\\s*\\(`).test(source));
  if (invoked.length === 1) return invoked[0];

  // Fall back to a named import of exactly one exported function.
  const imported = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/implementations\/typescript\//g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
    .filter((name) => exportedFunctions.includes(name));
  const uniqueImported = [...new Set(imported)];
  if (uniqueImported.length === 1) return uniqueImported[0];

  // Ambiguous: several of the module's exports are exercised. Let the slug rules
  // decide rather than guessing between them.
  return null;
}

/**
 * Pick the function that represents "run this topic".
 *
 * Returns null when nothing resolves — the caller treats that as a hard error.
 * An earlier version fell back to `functions[0]`, which silently gave every
 * momentum topic `rsi()` and every volume topic `obv()`.
 */
/**
 * Every name the slug can justify, in decreasing strength of evidence.
 *
 * Trailing generic nouns are dropped one at a time rather than only once:
 * `corwin-schultz-spread-estimator` reaches `corwinSchultzSpread` only after
 * shedding `estimator`, and slugs routinely carry two such words.
 */
function matchBySlug(functions, topicSlug) {
  const has = (name) => (functions.includes(name) ? name : null);

  const direct =
    has(topicSlug.replace(/-/g, "_")) ??
    has(camel(topicSlug)) ??
    // Abbreviation from the slug's initials: relative-strength-index -> rsi.
    has(topicSlug.split("-").map((word) => word[0]).join(""));
  if (direct) return direct;

  let parts = topicSlug.split("-");
  while (parts.length > 1 && GENERIC_SUFFIXES.includes(parts.at(-1))) {
    parts = parts.slice(0, -1);
    const trimmed = has(parts.join("_")) ?? has(camel(parts.join("-")));
    if (trimmed) return trimmed;
  }
  return null;
}

function chooseEntry(functions, topicSlug, topicDir, topicId) {
  if (functions.length === 0) return null;
  if (functions.length === 1) return functions[0];

  const override = ENTRY_OVERRIDES[topicId];
  if (override) {
    if (!functions.includes(override)) {
      throw new Error(`ENTRY_OVERRIDES["${topicId}"] = "${override}" but the module does not export it`);
    }
    return override;
  }

  /*
   * Slug rules run before the test signal, and the order is load-bearing.
   *
   * A name derived from the slug is *evidence*: `amihud-illiquidity-ratio`
   * matching an exported `amihudIlliquidity` can only mean one thing. The test
   * signal is a *heuristic*, and it fails in one specific way — when a family's
   * per-topic tests all call a generic `calculate()` wrapper, it hands the same
   * function to every sibling, and six subpaths silently resolve to one
   * algorithm. That is the momentum/`rsi()` collapse in a new costume.
   *
   * The test signal keeps its job: shared bodies where no slug rule can pick
   * between peer exports. It is just no longer allowed to overrule a name the
   * slug identifies outright.
   */
  const fromSlug = matchBySlug(functions, topicSlug);
  if (fromSlug) return fromSlug;

  const fromTest = entryFromTest(topicDir, functions);
  if (fromTest) return fromTest;

  if (functions.includes("calculate")) return "calculate";

  const byPrefix = functions.find((name) =>
    /^(calculate|construct|classify|validate|detect|resolve|diagnose|evaluate|compute|analyze|analyse|build|align|apply)/.test(name),
  );
  return byPrefix ?? null;
}

/** Coarse shape label — informational metadata, not load-bearing. */
function archetypeFor(meta, entry) {
  if (meta.family_id === "D01-F01") return "tape-aggregate";
  if (meta.domain_id === "D07") return "series-transform";
  if (entry && /^(validate|detect|classify|diagnose|guard|resolve)/.test(entry)) return "row-classify";
  if (entry && /^(evaluate|consensus|asOf|snapshot|compare)/i.test(entry)) return "snapshot-evaluate";
  return "record-transform";
}

// ---------------------------------------------------------------------------
// Output collection — everything is buffered so `--check` can diff without writing
// ---------------------------------------------------------------------------

const outputs = new Map(); // repo-relative posix path -> contents

function emit(relPath, contents) {
  outputs.set(relPath.split("\\").join("/"), contents);
}

const BANNER = (source) =>
  `// GENERATED by scripts/sync.mjs — do not edit.\n` +
  `// Source of truth: ${source}\n` +
  `// Re-run \`npm run sync\` after changing the catalog implementation.\n`;

// ---------------------------------------------------------------------------
// Shared modules and the purity gate
//
// Two rules the catalog cannot enforce for us, both learned from real damage:
//
// 1. A topic implementation must be SELF-CONTAINED. Only the topic's own file is
//    copied into the package, so `import "../../../shared/typescript/foo.ts"`
//    compiles in the catalog and fails in the package. Rather than hardcoding
//    one case per engine — which is how indexEngine and d00Engine were handled,
//    and which silently broke the moment a third appeared — any relative import
//    that climbs out of the topic directory is vendored into src/_shared/ once
//    and the specifier rewritten.
//
// 2. The package is RUNTIME-AGNOSTIC. No `node:` builtins, ever. The catalog
//    contains reference adapters that shell out to Python via
//    `execFileSync` — legitimate for fixture generation and parity testing, and
//    categorically not a TypeScript implementation of an algorithm. They import
//    `node:child_process`, so they are refused here rather than shipped to
//    browsers and edge runtimes that cannot run them.
// ---------------------------------------------------------------------------

/** Relative specifier in an import/export ... from "..." clause. */
const RELATIVE_SPECIFIER_RE = /((?:from|import)\s*)(["'])(\.{1,2}\/[^"']+)\2/g;
const NODE_BUILTIN_RE = /(?:from|import)\s*["']node:([^"']+)["']/g;

/** Catalog path -> { name, source } for every module hoisted into src/_shared/. */
const vendoredModules = new Map();
const vendoredNames = new Set();

function nodeBuiltinsIn(source) {
  return [...new Set([...source.matchAll(NODE_BUILTIN_RE)].map((m) => `node:${m[1]}`))];
}

/** Resolve a specifier to a file on disk, mapping the catalog's `.js` to `.ts`. */
function resolveSpecifier(fromDir, spec) {
  const direct = resolve(fromDir, spec);
  const candidates = spec.endsWith(".js")
    ? [`${direct.slice(0, -3)}.ts`, direct]
    : spec.endsWith(".ts")
      ? [direct]
      : [`${direct}.ts`, join(direct, "index.ts"), direct];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function vendor(absPath) {
  const existing = vendoredModules.get(absPath);
  if (existing) return existing;
  const base = basename(absPath).replace(/\.[tj]s$/, "");
  let name = base;
  let n = 2;
  while (vendoredNames.has(name)) name = `${base}${n++}`;
  vendoredNames.add(name);
  const record = { name, path: absPath, source: readFileSync(absPath, "utf8") };
  vendoredModules.set(absPath, record);
  return record;
}

/**
 * Rewrite a topic's escaping imports to vendored `src/_shared/` modules.
 *
 * Returns `{ impure }` instead when the implementation — or anything it pulls in
 * — reaches for a `node:` builtin. `topicId` is only used to make the refusal
 * message name the topic.
 */
function resolveSharedImports(source, implFile, topicDir, topicId) {
  const own = nodeBuiltinsIn(source);
  if (own.length) {
    return { impure: `imports ${own.join(", ")} — the package is runtime-agnostic` };
  }

  const implDir = dirname(implFile);
  const pending = [];
  let impure = null;

  const rewritten = source.replace(RELATIVE_SPECIFIER_RE, (whole, keyword, quote, spec) => {
    const abs = resolveSpecifier(implDir, spec);
    // Unresolvable, or resolves inside the topic's own directory: leave it be.
    // The former is the catalog's problem and shows up as a compile error; the
    // latter is a sibling file that travels with the topic.
    if (!abs) return whole;
    if (!relativeEscapes(topicDir, abs)) return whole;

    const shared = readFileSync(abs, "utf8");
    const builtins = nodeBuiltinsIn(shared);
    if (builtins.length) {
      impure ??= `depends on ${basename(abs)}, which imports ${builtins.join(", ")} — the package is runtime-agnostic`;
      return whole;
    }
    pending.push(abs);
    return `${keyword}${quote}../../../_shared/__VENDOR__${pending.length - 1}__.ts${quote}`;
  });

  if (impure) return { impure };
  if (!pending.length) return { source };

  // Vendoring is deferred to here so a refusal above leaves src/_shared/ clean.
  let out = rewritten;
  pending.forEach((abs, i) => {
    out = out.replace(`__VENDOR__${i}__`, vendor(abs).name);
  });
  return { source: out };
}

/** True when `abs` lies outside `topicDir`. */
function relativeEscapes(topicDir, abs) {
  const root = resolve(topicDir);
  const target = resolve(abs);
  return !target.startsWith(root + "\\") && !target.startsWith(root + "/");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const topics = [];
const skipped = [];
const warnings = [];
/** Rejected overrides under optimised/ — a hard failure, like the other gates. */
const overrideErrors = [];
/** Topics whose entry point could not be determined — a hard failure. */
const unresolved = [];
/** Implementation bodies awaiting the shared-vs-private decision. */
const pendingImpls = [];

for (const found of discoverTopics()) {
  const metaFile = join(found.dir, "metadata.yaml");
  if (!existsSync(metaFile)) {
    skipped.push({ topic: found.topicDir, reason: "no metadata.yaml" });
    continue;
  }

  const meta = readMetadata(metaFile);
  const implFile = implementationFile(found.dir);
  if (!implFile) {
    skipped.push({ topic: found.topicDir, reason: "no TypeScript implementation" });
    continue;
  }

  // A display name and a URL want different things. `domain:` is a heading —
  // "Financial Mathematics, Statistics, and Data Foundations" is the right thing
  // to read above an article. Kebab-cased it is 52 characters in every import
  // path, every docs URL and every file on disk, which is how one domain pushed
  // the longest path in the package to 174 characters and put Windows consumers
  // within 47 characters of MAX_PATH. `domain_slug:` lets a domain keep the
  // descriptive title and still be short where length is a cost.
  const domainSlug = kebab(meta.domain_slug ?? meta.domain ?? found.domainDir);
  const familySlug = kebab(meta.family_slug ?? meta.family ?? found.familyDir);
  const topicSlug = meta.slug ?? found.topicDir.replace(TOPIC_DIR_RE, "");
  const modulePath = `${domainSlug}/${familySlug}/${topicSlug}`;

  let source = readFileSync(implFile, "utf8");

  // A topic implementation must be self-contained: only the topic's own file is
  // copied, so a relative import that climbs out of the topic directory points
  // at a family- or catalog-level module that would not exist in the package.
  // Those modules are vendored into src/_shared/ and the specifier rewritten.
  const resolved = resolveSharedImports(source, implFile, found.dir, meta.id);
  if (resolved.impure) {
    skipped.push({ topic: found.topicDir, reason: resolved.impure });
    continue;
  }
  source = resolved.source;

  const { functions, allNames } = analyse(source);
  const entry = chooseEntry(functions, topicSlug, found.dir, meta.id);
  if (!entry) {
    unresolved.push({
      id: meta.id,
      slug: topicSlug,
      file: basename(implFile),
      candidates: functions,
    });
  }

  // `export * from "./impl.ts"` would collide with our own `meta` / `run`.
  for (const reserved of ["meta", "run"]) {
    if (allNames.includes(reserved)) {
      warnings.push(`${meta.id}: implementation already exports \`${reserved}\` — module-level alias suppressed`);
    }
  }
  const canAliasRun = entry && !allNames.includes("run");
  const canEmitMeta = !allNames.includes("meta");

  const archetype = archetypeFor(meta, entry);
  const articleUrl =
    meta.article_url ?? `https://thefintechbuilder.com/${domainSlug}/${familySlug}/${topicSlug}/`;
  const repoUrl = meta.repo && typeof meta.repo === "object" ? (meta.repo.url ?? null) : null;

  // Deferred: several topics in a family can share one implementation body, and
  // it is emitted once under src/_shared/ rather than copied per topic. Decided
  // after the loop, when every topic's body is known.
  // A topic may carry a hand-written implementation in this repository that
  // ships instead of the catalog's. The catalog version stays the reference —
  // it is what the article teaches and what the differential test compares
  // against — while the override is free to be faster and harder to read.
  //
  // What an override may NOT do is change the public API, so the entry resolved
  // from the catalog has to exist in it. Anything else would let a contributor
  // move a published subpath's function out from under its callers.
  const overridePath = join(REPO, "optimised", modulePath, "impl.ts");
  let override = null;
  if (existsSync(overridePath)) {
    const overrideSource = readFileSync(overridePath, "utf8");
    const builtins = nodeBuiltinsIn(overrideSource);
    if (builtins.length) {
      overrideErrors.push(`${meta.id}: optimised/${modulePath}/impl.ts imports ${builtins.join(", ")}`);
    } else if (
      entry &&
      !analyse(overrideSource).functions.includes(entry) &&
      // A partial override inherits the rest of the surface from the reference,
      // so the entry can arrive through the star rather than being redeclared.
      !/export\s*\*\s*from\s*["']\.\/reference\.ts["']/.test(overrideSource)
    ) {
      overrideErrors.push(
        `${meta.id}: optimised/${modulePath}/impl.ts neither exports ${entry}() nor re-exports "./reference.ts"`,
      );
    } else {
      override = { source: overrideSource, path: `optimised/${modulePath}/impl.ts` };
    }
  }

  pendingImpls.push({
    id: meta.id,
    modulePath,
    source,
    override,
    // An overridden topic is emitted on its own rather than folded into a shared
    // family body, so it must not join a hoisting group.
    sourceKey: override ? `override:${meta.id}` : hashBody(source),
    fileBase: basename(implFile, ".ts"),
    catalogPath: `algorithms/domains/${found.domainDir}/${found.familyDir}/${found.topicDir}/implementations/typescript/${basename(implFile)}`,
  });

  const indexLines = [
    `/**`,
    ` * ${meta.title ?? topicSlug}`,
    ` *`,
    ` * Topic ${meta.id} · ${meta.domain} / ${meta.family} · difficulty ${meta.difficulty ?? "?"}`,
    ` * Shape: ${archetype}${entry ? ` · entry: ${entry}()` : ""}`,
    ` * Article: ${articleUrl}`,
    repoUrl ? ` * Repo:    ${repoUrl}` : null,
    ` */`,
    BANNER(`algorithms/domains/.../${found.topicDir}`).trimEnd(),
    ``,
    `export * from "./impl.ts";`,
    canAliasRun ? `export { ${entry} as run } from "./impl.ts";` : null,
    ``,
    canEmitMeta ? `export const meta = {` : null,
    canEmitMeta ? `  id: ${JSON.stringify(meta.id)},` : null,
    canEmitMeta ? `  title: ${JSON.stringify(meta.title ?? topicSlug)},` : null,
    canEmitMeta ? `  slug: ${JSON.stringify(topicSlug)},` : null,
    canEmitMeta ? `  domainId: ${JSON.stringify(meta.domain_id ?? "")},` : null,
    canEmitMeta ? `  domain: ${JSON.stringify(meta.domain ?? "")},` : null,
    canEmitMeta ? `  familyId: ${JSON.stringify(meta.family_id ?? "")},` : null,
    canEmitMeta ? `  family: ${JSON.stringify(meta.family ?? "")},` : null,
    canEmitMeta ? `  difficulty: ${Number(meta.difficulty ?? 0)},` : null,
    canEmitMeta ? `  archetype: ${JSON.stringify(archetype)},` : null,
    canEmitMeta ? `  entry: ${JSON.stringify(entry ?? "")},` : null,
    canEmitMeta ? `  path: ${JSON.stringify(modulePath)},` : null,
    canEmitMeta ? `  articleUrl: ${JSON.stringify(articleUrl)},` : null,
    canEmitMeta ? `  repoUrl: ${JSON.stringify(repoUrl)},` : null,
    canEmitMeta ? `} as const;` : null,
    ``,
  ].filter((line) => line !== null);

  emit(`src/${modulePath}/index.ts`, indexLines.join("\n"));

  // --- Conformance fixture -------------------------------------------------
  //
  // The catalog carries verified numbers in three shapes. Each is copied
  // verbatim and labelled so test/conformance.test.ts can pick a runner:
  //
  //   A  examples/worked-example.json   { input, expected }
  //   B  datasets/canonical-fixture.json { rows, expected: { status, value } }
  //   C  datasets/<slug>-fixtures.json   { bars, checkpoints: [{ index, ...}] }
  const readJson = (path) => {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    try {
      return { raw, parsed: JSON.parse(raw) };
    } catch {
      warnings.push(`${meta.id}: ${basename(path)} is not valid JSON — fixture skipped`);
      return null;
    }
  };

  let fixture = null;
  const worked = readJson(join(found.dir, "examples", "worked-example.json"));

  if (worked && Object.hasOwn(worked.parsed, "input") && Object.hasOwn(worked.parsed, "expected")) {
    fixture = { file: `${meta.id}.json`, convention: "A", keys: Object.keys(worked.parsed) };
    emit(`test/fixtures/${meta.id}.json`, worked.raw);
  } else {
    const datasetDir = join(found.dir, "datasets");
    const candidates = existsSync(datasetDir)
      ? readdirSync(datasetDir).filter((name) => name.endsWith(".json"))
      : [];
    // Prefer the topic-specific <slug>-fixtures.json over anything else.
    const ordered = [
      ...candidates.filter((name) => name === `${topicSlug}-fixtures.json`),
      ...candidates.filter((name) => name === "canonical-fixture.json"),
      ...candidates.filter((name) => name.endsWith("-fixtures.json")),
    ];
    for (const name of ordered) {
      const data = readJson(join(datasetDir, name));
      if (!data) continue;
      const { parsed } = data;
      // C comes in two layouts: a flat { bars, checkpoints }, or scenarios[]
      // each carrying { parameters, observations, checkpoints }. Both are copied
      // verbatim; test/conformance.test.ts normalises them into one case list.
      const flatC = Array.isArray(parsed.bars) && Array.isArray(parsed.checkpoints);
      const scenarioC =
        Array.isArray(parsed.scenarios) &&
        parsed.scenarios.some(
          (scenario) =>
            Array.isArray(scenario?.observations ?? scenario?.bars) && Array.isArray(scenario?.checkpoints),
        );
      if (flatC || scenarioC) {
        fixture = { file: `${meta.id}.json`, convention: "C", keys: Object.keys(parsed) };
        emit(`test/fixtures/${meta.id}.json`, data.raw);
        break;
      }
      if (Array.isArray(parsed.rows) && parsed.expected && typeof parsed.expected === "object") {
        fixture = { file: `${meta.id}.json`, convention: "B", keys: Object.keys(parsed) };
        emit(`test/fixtures/${meta.id}.json`, data.raw);
        break;
      }
    }
    // Nothing runnable, but keep the worked example around for reference.
    if (!fixture && worked) {
      fixture = { file: `${meta.id}.json`, convention: "none", keys: Object.keys(worked.parsed) };
      emit(`test/fixtures/${meta.id}.json`, worked.raw);
    }
  }

  // Parameter names of the entry function, so a Convention C run can bind
  // bars.close / bars.high / … to the right positional arguments.
  const entryParams = entry ? signatureParams(source, entry) : [];

  topics.push({
    id: meta.id,
    title: meta.title ?? topicSlug,
    slug: topicSlug,
    domainId: meta.domain_id ?? "",
    domain: meta.domain ?? "",
    familyId: meta.family_id ?? "",
    family: meta.family ?? "",
    difficulty: Number(meta.difficulty ?? 0),
    status: meta.status ?? "",
    archetype,
    entry: entry ?? "",
    exports: functions,
    path: modulePath,
    articleUrl,
    repoUrl,
    fixture,
    entryParams,
    // Internal only (stripped before the registry is emitted): hash of the
    // implementation BODY, so the collision gate can tell a genuinely shared
    // implementation apart from a shared naming convention. Keyed on the body
    // rather than the filename, because identical bodies also appear under
    // different names (sector- and factor-diffusion-index).
    sourceKey: hashBody(source),
  });
}

topics.sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------------
// Entry-point integrity gates
//
// These exist because the generator once silently defaulted to functions[0],
// which gave 13 topics the wrong `run()` alias — every momentum topic pointed at
// rsi(), every volume topic at obv(). Guessing is now a build failure.
// ---------------------------------------------------------------------------

if (unresolved.length > 0) {
  console.error(`\n  FAILED: could not determine the entry point for ${unresolved.length} topic(s).\n`);
  for (const item of unresolved) {
    console.error(`    ${item.id}  ${item.slug}  (${item.file})`);
    console.error(`      candidates: ${item.candidates.join(", ")}`);
  }
  console.error(
    `\n  Fix by making the topic's own test invoke its function, renaming the\n` +
      `  export to match the slug, or extending chooseEntry() in this script.\n`,
  );
  process.exit(1);
}

if (overrideErrors.length > 0) {
  console.error(`\n  FAILED: ${overrideErrors.length} override(s) under optimised/ were refused.\n`);
  for (const line of overrideErrors) console.error(`    ${line}`);
  console.error(
    `\n  An override replaces a published implementation, so it has to keep the same\n` +
      `  entry point and the same purity rules as anything else in the package.\n`,
  );
  process.exit(1);
}

const snakeCasePublicEntries = topics.filter((topic) => topic.entry.includes("_"));
if (snakeCasePublicEntries.length > 0) {
  console.error(`\n  FAILED: ${snakeCasePublicEntries.length} snake_case TypeScript public entry point(s).\n`);
  for (const topic of snakeCasePublicEntries) console.error(`    ${topic.id}: ${topic.entry}()`);
  console.error("\n  Public TypeScript entries must use camelCase; keep snake_case for Python and data fields only.\n");
  process.exit(1);
}

// Two topics resolving to the same entry is only a bug when they also come from
// the SAME implementation file. Different files that each export `calculate` are
// the catalog's normal convention and collide only in name, never in behaviour.
const collisions = new Map();
for (const topic of topics) {
  const key = `${topic.sourceKey}::${topic.entry}`;
  collisions.set(key, [...(collisions.get(key) ?? []), topic.id]);
}
const isExempt = (ids) =>
  SHARED_ENTRY_EXEMPT.some(
    (group) => group.length === ids.length && group.every((id) => ids.includes(id)),
  );
const collided = [...collisions.entries()].filter(([, ids]) => ids.length > 1 && !isExempt(ids));
if (collided.length > 0) {
  console.error(
    `\n  FAILED: ${collided.length} shared-implementation collision(s) — topics that share one\n` +
      `  source file AND resolved to the same entry point, so at least one is wrong:\n`,
  );
  for (const [key, ids] of collided) {
    const [source, entry] = key.split("::");
    console.error(`    ${source.split(":")[0]}  ${entry}()  claimed by ${ids.join(", ")}`);
  }
  console.error(`\n  Each topic must expose its own function. See chooseEntry() in this script.\n`);
  process.exit(1);
}

// A shared body can also be wrong when each topic resolves to a distinct entry
// but `export *` exposes all peer entries through every subpath. Preserve only
// the exact legacy groups reviewed above; reject a new or expanded broad facade.
const broadSurfaceGroups = new Map();
for (const topic of topics) {
  broadSurfaceGroups.set(topic.sourceKey, [...(broadSurfaceGroups.get(topic.sourceKey) ?? []), topic]);
}
const unreviewedBroadSurfaces = [];
for (const group of broadSurfaceGroups.values()) {
  if (group.length < 2) continue;
  const entries = [...new Set(group.map((topic) => topic.entry).filter(Boolean))];
  if (entries.length < 2) continue;
  const exposesEveryPeer = group.every((topic) => entries.every((entry) => topic.exports.includes(entry)));
  if (!exposesEveryPeer) continue;
  const ids = group.map((topic) => topic.id).sort();
  if (!REVIEWED_SHARED_SURFACES.has(ids.join(","))) unreviewedBroadSurfaces.push({ ids, entries });
}
if (unreviewedBroadSurfaces.length > 0) {
  console.error(`\n  FAILED: ${unreviewedBroadSurfaces.length} unreviewed shared public surface(s).\n`);
  for (const group of unreviewedBroadSurfaces) {
    console.error(`    ${group.ids.join(", ")}`);
    console.error(`      peer entries exposed by every subpath: ${group.entries.join(", ")}`);
  }
  console.error(
    `\n  Split each topic facade, or add the exact topic set to REVIEWED_SHARED_SURFACES\n` +
      `  after confirming the cross-topic exports are an intentional compatibility contract.\n`,
  );
  process.exit(1);
}

// `sourceKey` is a build-time diagnostic, not public metadata.
for (const topic of topics) delete topic.sourceKey;

// ---------------------------------------------------------------------------
// Emit implementations, hoisting shared bodies
//
// Some catalog families ship ONE implementation file covering the whole family
// (momentum.ts exports all eight momentum indicators) and copy it into every
// topic folder. Copying that into the package once per topic would ship the same
// body 8 times. Instead it lands once in src/_shared/ and each topic's impl.ts
// re-exports it, so `export * from "./impl.ts"` in the topic index is unchanged
// and the public API is byte-identical.
// ---------------------------------------------------------------------------

const byBody = new Map();
for (const item of pendingImpls) {
  byBody.set(item.sourceKey, [...(byBody.get(item.sourceKey) ?? []), item]);
}

const sharedNames = new Map(); // sourceKey -> file name under src/_shared/
// Hoisted bodies share src/_shared/ with the vendored modules, so they must not
// claim a name one of those already took.
const takenNames = new Set(vendoredNames);
let hoisted = 0;
let copiesSaved = 0;

for (const [sourceKey, group] of byBody) {
  if (group.length < 2) continue;
  let name = group[0].fileBase;
  while (takenNames.has(name)) name = `${name}_${sourceKey.slice(0, 4)}`;
  takenNames.add(name);
  sharedNames.set(sourceKey, name);
  hoisted++;
  copiesSaved += group.length - 1;

  emit(
    `src/_shared/${name}.ts`,
    BANNER(`${group[0].catalogPath} (shared by ${group.length} topics)`) + "\n" + group[0].source,
  );
}

let overridden = 0;
for (const item of pendingImpls) {
  const shared = sharedNames.get(item.sourceKey);
  if (item.override) {
    overridden++;
    // The catalog body ships alongside the override as `reference.ts`, so an
    // override only has to replace the functions it actually makes faster and
    // can `export * from "./reference.ts"` for the rest. Replacing the whole
    // module surface by hand would make every override far larger than the
    // change it represents, and every unchanged export a chance to drift.
    emit(
      `src/${item.modulePath}/reference.ts`,
      BANNER(item.catalogPath) +
        `//\n// The reference implementation: what the article teaches, and what\n` +
        `// test/differential.test.ts proves this topic's shipped code equal to.\n\n` +
        item.source,
    );
    emit(
      `src/${item.modulePath}/impl.ts`,
      `// GENERATED by scripts/sync.mjs — do not edit.\n` +
        `// Source of truth: ${item.override.path}\n` +
        `// This topic ships a hand-written implementation from this repository\n` +
        `// rather than the catalog's. The catalog version sits next to it in\n` +
        `// reference.ts and the two are asserted identical on every build.\n\n` +
        item.override.source,
    );
  } else if (shared) {
    emit(
      `src/${item.modulePath}/impl.ts`,
      BANNER(item.catalogPath) +
        `//\n// This family shares one implementation across its topics; the body lives at\n` +
        `// src/_shared/${shared}.ts and is re-exported here so the public surface of\n` +
        `// this subpath is unchanged.\n\n` +
        `export * from "../../../_shared/${shared}.ts";\n`,
    );
  } else {
    emit(`src/${item.modulePath}/impl.ts`, BANNER(item.catalogPath) + "\n" + item.source);
  }
}

// --- vendored shared modules ------------------------------------------------
//
// Every family- or catalog-level module a topic imported, hoisted once. This
// replaces the per-engine special cases that used to live here: indexEngine and
// d00Engine now arrive through the same path as everything else, so the next
// shared module needs no change to this script.

for (const { name, path, source } of vendoredModules.values()) {
  emit(
    `src/_shared/${name}.ts`,
    BANNER(path.split(/[\\/]/).slice(-6).join("/")) + "\n" + source,
  );
}

// --- registry ---------------------------------------------------------------

const registry = [
  BANNER("algorithms/domains/**/metadata.yaml"),
  ``,
  `/** Coarse input/output shape shared by a group of topics. */`,
  `export type Archetype =`,
  `  | "series-transform"`,
  `  | "tape-aggregate"`,
  `  | "record-transform"`,
  `  | "row-classify"`,
  `  | "snapshot-evaluate";`,
  ``,
  `export interface TopicMeta {`,
  `  /** Catalog id, e.g. "D07-F01-A02". */`,
  `  id: string;`,
  `  title: string;`,
  `  slug: string;`,
  `  domainId: string;`,
  `  domain: string;`,
  `  familyId: string;`,
  `  family: string;`,
  `  difficulty: number;`,
  `  archetype: Archetype;`,
  `  /** Name of the module's primary function; also exported as \`run\`. */`,
  `  entry: string;`,
  `  /** Every function this module exports. */`,
  `  exports: readonly string[];`,
  `  /** Subpath under the package, e.g. "technical-indicators/trend-smoothing/ema". */`,
  `  path: string;`,
  `  articleUrl: string;`,
  `  repoUrl: string | null;`,
  `  /** True when the catalog ships a { input, expected } conformance fixture. */`,
  `  hasFixture: boolean;`,
  `}`,
  ``,
  `export const topics: readonly TopicMeta[] = [`,
  ...topics.map((t) =>
    `  { id: ${JSON.stringify(t.id)}, title: ${JSON.stringify(t.title)}, slug: ${JSON.stringify(t.slug)},` +
    ` domainId: ${JSON.stringify(t.domainId)}, domain: ${JSON.stringify(t.domain)},` +
    ` familyId: ${JSON.stringify(t.familyId)}, family: ${JSON.stringify(t.family)},` +
    ` difficulty: ${t.difficulty}, archetype: ${JSON.stringify(t.archetype)},` +
    ` entry: ${JSON.stringify(t.entry)}, exports: ${JSON.stringify(t.exports)},` +
    ` path: ${JSON.stringify(t.path)}, articleUrl: ${JSON.stringify(t.articleUrl)},` +
    ` repoUrl: ${t.repoUrl ? JSON.stringify(t.repoUrl) : "null"},` +
    ` hasFixture: ${Boolean(t.fixture && t.fixture.convention !== "none")} },`,
  ),
  `];`,
  ``,
].join("\n");

emit("src/_registry.ts", registry);

// --- lazy module map --------------------------------------------------------
//
// Kept in its own module so that importing the package root pulls in metadata
// only. Bundler users should import the subpath directly; `load()` exists for
// dynamic/registry-driven use (docs sites, playgrounds, test harnesses).

const moduleMap = [
  BANNER("generated from the topic list"),
  ``,
  `/** Lazy loaders keyed by catalog id. */`,
  `export const modules: Record<string, () => Promise<Record<string, unknown>>> = {`,
  ...topics.map((t) => `  ${JSON.stringify(t.id)}: () => import("./${t.path}/index.ts"),`),
  `};`,
  ``,
].join("\n");

emit("src/_modules.ts", moduleMap);

// --- root entry -------------------------------------------------------------

const rootIndex = [
  `/**`,
  ` * fintech-algorithms — The Fintech Builder algorithm library.`,
  ` *`,
  ` * The root export carries metadata only. Import an algorithm from its subpath,`,
  ` * which mirrors its article URL exactly:`,
  ` *`,
  ` *   import { ema } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";`,
  ` *`,
  ` * Every algorithm is provider-agnostic: it takes plain arrays and plain objects.`,
  ` * Bring data from any source by mapping it into the documented input shape.`,
  ` */`,
  BANNER("scripts/sync.mjs").trimEnd(),
  ``,
  `export { topics, type TopicMeta, type Archetype } from "./_registry.ts";`,
  `import { topics } from "./_registry.ts";`,
  `import { modules } from "./_modules.ts";`,
  ``,
  `/** Look up a topic's metadata by catalog id, e.g. "D07-F01-A02". */`,
  `export function topic(id: string) {`,
  `  return topics.find((t) => t.id === id);`,
  `}`,
  ``,
  `/** Every topic in a domain, e.g. "D07". */`,
  `export function byDomain(domainId: string) {`,
  `  return topics.filter((t) => t.domainId === domainId);`,
  `}`,
  ``,
  `/** Every topic in a family, e.g. "D01-F01". */`,
  `export function byFamily(familyId: string) {`,
  `  return topics.filter((t) => t.familyId === familyId);`,
  `}`,
  ``,
  `/** Every topic sharing an input/output shape. */`,
  `export function byArchetype(archetype: string) {`,
  `  return topics.filter((t) => t.archetype === archetype);`,
  `}`,
  ``,
  `/**`,
  ` * Dynamically load a topic module by catalog id.`,
  ` *`,
  ` * Prefer a direct subpath import when you know the algorithm at build time —`,
  ` * this exists for registry-driven callers (playgrounds, docs, test harnesses).`,
  ` */`,
  `export async function load(id: string): Promise<Record<string, unknown>> {`,
  `  const loader = modules[id];`,
  `  if (!loader) throw new Error(\`unknown topic id: \${id}\`);`,
  `  return loader();`,
  `}`,
  ``,
  `/** Load a topic and return its primary function. */`,
  `export async function runner(id: string): Promise<(...args: unknown[]) => unknown> {`,
  `  const mod = await load(id);`,
  `  const fn = mod.run ?? mod[topic(id)?.entry ?? ""];`,
  `  if (typeof fn !== "function") throw new Error(\`topic \${id} exposes no callable entry point\`);`,
  `  return fn as (...args: unknown[]) => unknown;`,
  `}`,
  ``,
].join("\n");

emit("src/index.ts", rootIndex);

// --- package.json exports ---------------------------------------------------

const pkgPath = join(REPO, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

/**
 * One entry of the `exports` map.
 *
 * `require` points at the *same* ES module as `import`, which is deliberate.
 * Node resolves `require()` against the `require` condition only, so a package
 * that declares `import` alone is unreachable from CommonJS — not because the
 * module cannot be loaded, but because resolution fails before loading is
 * attempted. Node can `require()` an ES module, so the fix is the condition,
 * not a second CommonJS build: the tarball stays one copy of every module, and
 * a dual-package hazard is impossible because there is only ever one copy of a
 * module's state. Consumers on a runtime without `require(esm)` still need
 * `import`.
 */
const exportEntry = (base) => ({
  types: `${base}/index.d.ts`,
  import: `${base}/index.js`,
  require: `${base}/index.js`,
});

const exportsMap = { ".": exportEntry("./dist") };
for (const t of topics) {
  exportsMap[`./${t.path}`] = exportEntry(`./dist/${t.path}`);
}
exportsMap["./package.json"] = "./package.json";
pkg.exports = exportsMap;
emit("package.json", JSON.stringify(pkg, null, 2) + "\n");

// --- test manifest ----------------------------------------------------------

emit(
  "test/_manifest.json",
  JSON.stringify(
    {
      generatedFrom: "scripts/sync.mjs",
      topicCount: topics.length,
      topics: topics.map((t) => ({
        id: t.id,
        path: t.path,
        entry: t.entry,
        archetype: t.archetype,
        fixture: t.fixture?.file ?? null,
        convention: t.fixture?.convention ?? "none",
        entryParams: t.entryParams ?? [],
        fixtureKeys: t.fixture?.keys ?? [],
      })),
    },
    null,
    2,
  ) + "\n",
);

// ---------------------------------------------------------------------------
// Write or check
// ---------------------------------------------------------------------------

function currentContents(relPath) {
  const abs = join(REPO, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

if (CHECK_ONLY) {
  const drift = [...outputs.entries()].filter(([rel, next]) => currentContents(rel) !== next);
  if (drift.length > 0) {
    console.error(`\n  Package is out of sync with the catalog. ${drift.length} file(s) would change:\n`);
    for (const [rel] of drift.slice(0, 20)) console.error(`    ${rel}`);
    if (drift.length > 20) console.error(`    … and ${drift.length - 20} more`);
    console.error(`\n  Run: npm run sync\n`);
    process.exit(1);
  }
  console.log(`  In sync — ${topics.length} topics, ${outputs.size} generated files.`);
  process.exit(0);
}

// Clear previously generated trees so removed topics don't linger.
for (const dir of ["src", "test/fixtures"]) {
  const abs = join(REPO, dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs)) {
    // src/_shared is fully regenerated too (the vendored engine plus any hoisted
    // family bodies), so it is cleared like everything else — otherwise a family
    // that stops being shared would leave a stale file behind.
    rmSync(join(abs, name), { recursive: true, force: true });
  }
}

for (const [rel, contents] of outputs) {
  const abs = join(REPO, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf8");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const byArchetype = topics.reduce((acc, t) => ((acc[t.archetype] = (acc[t.archetype] ?? 0) + 1), acc), {});
const domains = [...new Set(topics.map((t) => t.domain))];
const byConvention = topics.reduce((acc, t) => {
  const key = t.fixture?.convention ?? "none";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const withFixture = topics.filter((t) => t.fixture && t.fixture.convention !== "none").length;

console.log(`\n  fintech-algorithms — sync complete\n`);
console.log(`  content root : ${CONTENT_ROOT}`);
console.log(`  topics       : ${topics.length} across ${domains.length} domains`);
console.log(`  files written: ${outputs.size}`);
if (overridden) {
  console.log(`  overridden   : ${overridden} topic(s) ship an implementation from optimised/`);
}
console.log(`  fixtures     : ${withFixture}/${topics.length} runnable  (A ${byConvention.A ?? 0} · B ${byConvention.B ?? 0} · C ${byConvention.C ?? 0} · none ${byConvention.none ?? 0})`);
console.log(`\n  by shape:`);
for (const [shape, count] of Object.entries(byArchetype).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${shape.padEnd(20)} ${count}`);
}
if (heldBack.length) {
  const total = heldBack.reduce((sum, h) => sum + h.count, 0);
  console.log(`\n  held back (${total} topics — DOMAINS_NOT_READY in this script):`);
  for (const h of heldBack) console.log(`    ${h.domain} — ${h.count} topics — ${h.reason}`);
}
if (skipped.length) {
  console.log(`\n  skipped (${skipped.length}):`);
  for (const s of skipped) console.log(`    ${s.topic} — ${s.reason}`);
}
if (warnings.length) {
  console.log(`\n  warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`    ${w}`);
}
console.log(``);
