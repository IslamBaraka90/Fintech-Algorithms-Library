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

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
}

function discoverTopics() {
  const found = [];
  for (const domainDir of listDirs(DOMAINS_DIR)) {
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

/** Pick the function that best represents "run this topic". */
function chooseEntry(functions, topicSlug) {
  if (functions.length === 0) return null;
  if (functions.length === 1) return functions[0];

  const preferred = camel(topicSlug);
  if (functions.includes(preferred)) return preferred;
  if (functions.includes("calculate")) return "calculate";

  const byPrefix = functions.find((name) =>
    /^(calculate|construct|classify|validate|detect|resolve|diagnose|evaluate|compute|analyze|analyse|build|align|apply)/.test(name),
  );
  return byPrefix ?? functions[0];
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
// Build
// ---------------------------------------------------------------------------

const topics = [];
const skipped = [];
const warnings = [];

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

  const domainSlug = kebab(meta.domain ?? found.domainDir);
  const familySlug = kebab(meta.family ?? found.familyDir);
  const topicSlug = meta.slug ?? found.topicDir.replace(TOPIC_DIR_RE, "");
  const modulePath = `${domainSlug}/${familySlug}/${topicSlug}`;

  let source = readFileSync(implFile, "utf8");

  // The 40 index-engine topics share one helper; vendor it under src/_shared/.
  source = source.replace(
    /(["'])(?:\.\.\/)+shared\/typescript\/indexEngine\.ts\1/g,
    '"../../../_shared/indexEngine.ts"',
  );

  const { functions, allNames } = analyse(source);
  const entry = chooseEntry(functions, topicSlug);
  if (!entry) warnings.push(`${meta.id}: no exported function found in ${basename(implFile)}`);

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

  emit(`src/${modulePath}/impl.ts`, BANNER(`algorithms/domains/${found.domainDir}/${found.familyDir}/${found.topicDir}/implementations/typescript/${basename(implFile)}`) + "\n" + source);

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

  // Conformance fixture
  const examplePath = join(found.dir, "examples", "worked-example.json");
  let fixture = null;
  if (existsSync(examplePath)) {
    const raw = readFileSync(examplePath, "utf8");
    try {
      const parsed = JSON.parse(raw);
      fixture = {
        file: `${meta.id}.json`,
        hasInputExpected: Object.hasOwn(parsed, "input") && Object.hasOwn(parsed, "expected"),
        keys: Object.keys(parsed),
      };
      emit(`test/fixtures/${meta.id}.json`, raw);
    } catch {
      warnings.push(`${meta.id}: worked-example.json is not valid JSON — fixture skipped`);
    }
  }

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
  });
}

topics.sort((a, b) => a.id.localeCompare(b.id));

// --- vendored shared engine -------------------------------------------------

const sharedEngine = join(DOMAINS_DIR, "D03-index-and-benchmark-engineering", "shared", "typescript", "indexEngine.ts");
if (existsSync(sharedEngine)) {
  emit(
    "src/_shared/indexEngine.ts",
    BANNER("algorithms/domains/D03-index-and-benchmark-engineering/shared/typescript/indexEngine.ts") +
      "\n" +
      readFileSync(sharedEngine, "utf8"),
  );
} else {
  warnings.push("shared indexEngine.ts not found — 40 index topics will fail to compile");
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
    ` hasFixture: ${Boolean(t.fixture?.hasInputExpected)} },`,
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
const exportsMap = {
  ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
};
for (const t of topics) {
  exportsMap[`./${t.path}`] = {
    types: `./dist/${t.path}/index.d.ts`,
    import: `./dist/${t.path}/index.js`,
  };
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
        hasInputExpected: Boolean(t.fixture?.hasInputExpected),
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
    if (dir === "src" && name === "_shared") continue; // re-emitted below anyway
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
const withFixture = topics.filter((t) => t.fixture?.hasInputExpected).length;

console.log(`\n  fintech-algorithms — sync complete\n`);
console.log(`  content root : ${CONTENT_ROOT}`);
console.log(`  topics       : ${topics.length} across ${domains.length} domains`);
console.log(`  files written: ${outputs.size}`);
console.log(`  fixtures     : ${withFixture} with {input, expected}, ${topics.length - withFixture} other/none`);
console.log(`\n  by shape:`);
for (const [shape, count] of Object.entries(byArchetype).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${shape.padEnd(20)} ${count}`);
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
