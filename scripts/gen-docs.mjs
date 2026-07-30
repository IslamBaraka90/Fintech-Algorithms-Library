#!/usr/bin/env node
/**
 * Emit `docs.json` — the reference payload the documentation site renders.
 *
 * The rule this file exists to enforce: **the generator emits data, never
 * HTML.** The docs site reads this payload and nothing else, which means it
 * never needs access to the private catalog, the library can release on its own
 * cadence, and the same payload can later feed `llms.txt`, a search index, an
 * editor extension or a Python sibling without any of them re-deriving anything.
 *
 * Everything here comes from artefacts that already exist:
 *
 *   src/_registry.ts          identity, taxonomy, subpath, entry, exports
 *   test/_manifest.json       parameter names, fixture + verification tier
 *   test/fixtures/*.json      the worked example, for the clean `{input,expected}` tier
 *   <catalog>/…/visuals/      published SVG diagrams, mermaid source
 *   <catalog>/…/REFERENCES.md citations
 *
 * Two invariants, both load-bearing:
 *
 * 1. **Deterministic.** No timestamps, no environment, stable key order. The
 *    output is committed and `sync.mjs --check` compares a fresh run against it,
 *    so any non-determinism would make the drift guard cry wolf forever.
 *
 * 2. **Never invent a URL.** Only `visuals/static/*.svg` is actually published
 *    at thefintechbuilder.com/content/<id>/static/<file>; the animated
 *    playgrounds and mermaid files are not served. Mermaid is therefore inlined
 *    as source, and playground links are omitted rather than guessed.
 *
 * Usage:
 *   node scripts/gen-docs.mjs [--content-root <path>] [--check]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./lib/yaml-subset.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Payload shape version. Independent of the package version — bump only when
 *  the structure changes, because the docs site pins a major. */
const SCHEMA_VERSION = "1.0.0";

const SITE = "https://thefintechbuilder.com";
const GITHUB = "https://github.com/IslamBaraka90/Fintech-Algorithms-Library";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CHECK = process.argv.includes("--check");
const CONTENT_ROOT = resolve(
  argValue("--content-root", process.env.FINTECH_CONTENT_ROOT ?? resolve(REPO, "..", "..")),
);
const DOMAINS_DIR = join(CONTENT_ROOT, "algorithms", "domains");
const OUT = join(REPO, "docs.json");

const TOPIC_ID_RE = /^(D\d{2}-F\d{2}-A\d{2})-/;

// ---------------------------------------------------------------- inputs

const registrySrc = readFileSync(join(REPO, "src", "_registry.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(REPO, "test", "_manifest.json"), "utf8"));

/**
 * The registry is generated TypeScript. Parsing it with a regex rather than
 * importing avoids needing type-stripping here, and matches what
 * `update-readme.mjs` already does.
 */
const FIELD = (name) => `${name}: "([^"]*)"`;
const registryRe = new RegExp(
  [
    `\\{ ${FIELD("id")}`,
    FIELD("title"),
    FIELD("slug"),
    FIELD("domainId"),
    FIELD("domain"),
    FIELD("familyId"),
    FIELD("family"),
    `difficulty: (\\d+)`,
    FIELD("archetype"),
    FIELD("entry"),
    `exports: \\[([^\\]]*)\\]`,
    FIELD("path"),
    FIELD("articleUrl"),
    `repoUrl: (null|"[^"]*")`,
    `hasFixture: (true|false)`,
  ].join(", "),
  "g",
);

const topicsFromRegistry = [...registrySrc.matchAll(registryRe)].map((m) => ({
  id: m[1],
  title: m[2],
  slug: m[3],
  domainId: m[4],
  domain: m[5],
  familyId: m[6],
  family: m[7],
  difficulty: Number(m[8]),
  archetype: m[9],
  entry: m[10],
  exports: [...m[11].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  path: m[12],
  articleUrl: m[13],
  repoUrl: m[14] === "null" ? null : m[14].slice(1, -1),
  hasFixture: m[15] === "true",
}));

if (topicsFromRegistry.length === 0) {
  console.error("gen-docs: parsed 0 topics out of src/_registry.ts — run `npm run sync` first.");
  process.exit(1);
}

const manifestById = new Map(manifest.topics.map((t) => [t.id, t]));

// ------------------------------------------------------- catalog lookup

/** id → absolute catalog directory, built by one walk of the domains tree. */
function indexCatalog() {
  const map = new Map();
  if (!existsSync(DOMAINS_DIR)) return map;
  const dirs = (p) => readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory());
  for (const domain of dirs(DOMAINS_DIR)) {
    for (const family of dirs(join(DOMAINS_DIR, domain))) {
      for (const topic of dirs(join(DOMAINS_DIR, domain, family))) {
        const m = TOPIC_ID_RE.exec(topic);
        if (m) map.set(m[1], join(DOMAINS_DIR, domain, family, topic));
      }
    }
  }
  return map;
}

const catalogDirs = indexCatalog();
if (catalogDirs.size === 0) {
  console.error(
    `gen-docs: no catalog at ${DOMAINS_DIR}\n` +
      `    node scripts/gen-docs.mjs --content-root /path/to/edufintech\n` +
      `  or set FINTECH_CONTENT_ROOT.\n`,
  );
  process.exit(1);
}

/**
 * Published diagrams. Only `visuals/static/*.svg` is actually served — verified
 * against the live site — so nothing else is turned into a URL.
 */
function staticDiagrams(dir, id) {
  const src = join(dir, "visuals", "static");
  if (!existsSync(src)) return [];
  return readdirSync(src)
    .filter((f) => f.endsWith(".svg"))
    .sort()
    .map((file) => ({
      file,
      url: `${SITE}/content/${id.toLowerCase()}/static/${file}`,
    }));
}

/** Mermaid is inlined as source: the `.md` files are not served by the site. */
function mermaidDiagrams(dir) {
  const src = join(dir, "visuals", "mermaid");
  if (!existsSync(src)) return [];
  return readdirSync(src)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .flatMap((file) => {
      const text = readFileSync(join(src, file), "utf8");
      const fence = /```mermaid\n([\s\S]*?)```/.exec(text);
      if (!fence) return [];
      const caption = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null;
      return [{ file, caption, source: fence[1].trimEnd() }];
    });
}

/**
 * `REFERENCES.md` is a predictable shape: `## KEY — Title` followed by
 * `- Field: value` bullets. Only the fields a reader needs are lifted.
 */
function references(dir) {
  const file = join(dir, "REFERENCES.md");
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const out = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const heading = block.split("\n", 1)[0].trim();
    const [key, ...rest] = heading.split(/\s+—\s+/);
    const field = (label) =>
      new RegExp(`^- ${label}:\\s*(.+)$`, "m").exec(block)?.[1]?.trim() ?? null;
    const url = field("URL or DOI");
    out.push({
      key: key.trim(),
      title: rest.join(" — ").trim() || key.trim(),
      author: field("Organization or authors"),
      url: url && /^https?:\/\//.test(url) ? url : null,
    });
  }
  return out;
}

// ------------------------------------------------------------- examples

/**
 * A worked example is emitted only for the clean `{ input, expected }` tier.
 *
 * The row and scenario tiers are genuinely verified, but their fixtures carry
 * hundreds of observations — correct to assert, useless to print on a reference
 * page. Those topics keep their verification badge and link to the article for
 * the numbers, rather than showing a truncated example that would be wrong.
 */
function workedExample(topic, entryParams) {
  const m = manifestById.get(topic.id);
  if (!m?.fixture || m.convention !== "A") return null;
  const file = join(REPO, "test", "fixtures", m.fixture);
  if (!existsSync(file)) return null;

  const fixture = JSON.parse(readFileSync(file, "utf8"));
  if (fixture.input === undefined || fixture.expected === undefined) return null;

  // Convention A passes the fixture's `input` as the single argument when the
  // entry takes one parameter, and spreads named keys positionally otherwise —
  // mirroring how conformance.test.ts invokes it.
  const args =
    entryParams.length > 1 && !Array.isArray(fixture.input)
      ? entryParams.map((p) => fixture.input[p])
      : [fixture.input];

  return {
    source: `fixture:${m.fixture}`,
    verified: true,
    call: `${topic.entry}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
    input: fixture.input,
    expected: fixture.expected,
  };
}

const TIER = { A: "input-expected", B: "row-fixture", C: "scenario-fixture" };

// ------------------------------------------------------------ api contract

const apiErrors = [];

/**
 * The declared `api:` block from `metadata.yaml`, validated against the code.
 *
 * This validation is the whole point of declaring the contract as data. The
 * entry function's real parameter names are already extracted into the manifest,
 * so a declaration that disagrees with the implementation fails the build rather
 * than shipping documentation that contradicts the function it documents.
 *
 * Topics without an `api:` block are not an error — the block is being populated
 * per family, and a topic without one simply shows its signature.
 */
function apiContract(topic, dir, entryParams) {
  if (!dir) return null;
  const metaFile = join(dir, "metadata.yaml");
  if (!existsSync(metaFile)) return null;

  let meta;
  try {
    meta = parseYaml(readFileSync(metaFile, "utf8"));
  } catch (e) {
    apiErrors.push(`${topic.id}: metadata.yaml did not parse — ${e.message}`);
    return null;
  }
  const api = meta.api;
  if (!api) return null;

  if (api.entry && api.entry !== topic.entry) {
    apiErrors.push(
      `${topic.id}: api.entry is "${api.entry}" but the module's entry is "${topic.entry}"`,
    );
  }

  const declared = (api.params ?? []).map((p) => p.name);
  if (declared.join(",") !== entryParams.join(",")) {
    apiErrors.push(
      `${topic.id}: api.params [${declared.join(", ")}] does not match the ` +
        `implementation's parameters [${entryParams.join(", ")}]`,
    );
  }

  return {
    summary: api.summary ?? null,
    params: (api.params ?? []).map((p) => ({
      name: p.name,
      type: p.type ?? null,
      required: p.required ?? true,
      description: p.description ?? null,
      constraints: p.constraints ?? null,
      nulls: p.nulls ?? null,
      default: p.default ?? null,
    })),
    returns: api.returns ?? null,
    warmup: api.warmup ?? null,
    errors: api.errors ?? [],
    complexity: api.complexity ?? null,
  };
}

// -------------------------------------------------------------- payload

const topics = topicsFromRegistry.map((t) => {
  const dir = catalogDirs.get(t.id);
  const m = manifestById.get(t.id);
  const entryParams = m?.entryParams ?? [];
  const [name, ...headline] = t.title.split(/\s*[:—]\s*/);

  return {
    id: t.id,
    name: name.trim(),
    headline: headline.join(" — ").trim() || null,
    slug: t.slug,
    path: t.path,
    taxonomy: {
      domainId: t.domainId,
      domain: t.domain,
      familyId: t.familyId,
      family: t.family,
      difficulty: t.difficulty,
    },
    import: {
      subpath: `${pkg.name}/${t.path}`,
      entry: t.entry,
      params: entryParams,
      exports: t.exports,
      archetype: t.archetype,
      signature: `${t.entry}(${entryParams.join(", ")})`,
    },
    api: apiContract(t, dir, entryParams),
    example: workedExample(t, entryParams),
    verification:
      m && m.convention !== "none"
        ? { tier: "verified", via: TIER[m.convention] ?? m.convention }
        : { tier: "contract", via: null },
    assets: dir
      ? { diagrams: staticDiagrams(dir, t.id), mermaid: mermaidDiagrams(dir) }
      : { diagrams: [], mermaid: [] },
    references: dir ? references(dir) : [],
    links: {
      article: t.articleUrl,
      repo: t.repoUrl,
      source: `${GITHUB}/blob/main/src/${t.path}/impl.ts`,
      npm: `https://www.npmjs.com/package/${pkg.name}`,
    },
    languages: ["typescript", "python"],
  };
});

/** Domain → family tree, so the site can build navigation without regrouping. */
const domains = [...new Set(topics.map((t) => t.taxonomy.domainId))].sort().map((domainId) => {
  const inDomain = topics.filter((t) => t.taxonomy.domainId === domainId);
  const familyIds = [...new Set(inDomain.map((t) => t.taxonomy.familyId))].sort();
  return {
    id: domainId,
    name: inDomain[0].taxonomy.domain,
    topicCount: inDomain.length,
    families: familyIds.map((familyId) => {
      const inFamily = inDomain.filter((t) => t.taxonomy.familyId === familyId);
      return { id: familyId, name: inFamily[0].taxonomy.family, topicCount: inFamily.length };
    }),
  };
});

const payload = {
  schemaVersion: SCHEMA_VERSION,
  package: { name: pkg.name, version: pkg.version, homepage: pkg.homepage },
  counts: {
    topics: topics.length,
    domains: domains.length,
    families: domains.reduce((n, d) => n + d.families.length, 0),
    verified: topics.filter((t) => t.verification.tier === "verified").length,
    withExample: topics.filter((t) => t.example).length,
    withDiagram: topics.filter((t) => t.assets.diagrams.length).length,
    withApiContract: topics.filter((t) => t.api).length,
  },
  domains,
  topics,
};

// A contract that contradicts the code is worse than no contract: refuse to
// emit rather than publish documentation the implementation disagrees with.
if (apiErrors.length) {
  console.error(`gen-docs: ${apiErrors.length} api: contract error(s)`);
  for (const e of apiErrors) console.error(`    ${e}`);
  process.exit(1);
}

const json = JSON.stringify(payload, null, 2) + "\n";

// ---------------------------------------------------------------- write

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== json) {
    console.error("  docs.json is stale — run `npm run sync`.");
    process.exit(1);
  }
  console.log(`  docs.json: in sync — ${topics.length} topics`);
} else {
  writeFileSync(OUT, json, "utf8");
  const { verified, withExample, withDiagram } = payload.counts;
  console.log(
    `  docs.json: ${topics.length} topics · ${verified} verified · ` +
      `${withExample} worked examples · ${withDiagram} with diagrams`,
  );
}
