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
 *   node scripts/gen-docs.mjs [--content-root <path>] [--check] [--strict-contracts]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./lib/yaml-subset.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Payload shape version. Independent of the package version — bump only when
 *  the structure changes, because the docs site pins a major.
 *
 *  2.0.0 — per-topic `languages` became `catalogLanguages`; `package` grew the
 *  runtime and machine-surface facts; `archetypes` and `domains[].slug` added.
 *  The rename is the reason this is a major and not a minor. */
const SCHEMA_VERSION = "2.0.0";

const SITE = "https://thefintechbuilder.com";
const GITHUB = "https://github.com/IslamBaraka90/Fintech-Algorithms-Library";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CHECK = process.argv.includes("--check");
const STRICT_CONTRACTS = process.argv.includes("--strict-contracts");
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
 * The documentation site, which doubles as the machine surface. Read off
 * `homepage` rather than repeated as a literal, so the two can never disagree.
 */
const DOCS = pkg.homepage.replace(/\/+$/, "");

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

/**
 * Which languages the *catalog* publishes for a topic, read from the
 * `implementations/<language>/` directories that are actually there.
 *
 * This is a catalog fact and is named like one. It used to be the literal
 * `["typescript", "python"]` on all 324 topics, which read as a promise that a
 * Python package exists — it does not, and an agent trusting that field would
 * confidently write `pip install fintech-algorithms`. What this *package* ships
 * is stated once, as `package.languages`, and it is TypeScript alone.
 */
function implementationLanguages(dir) {
  const src = dir ? join(dir, "implementations") : null;
  if (!src || !existsSync(src)) return ["typescript"];
  const langs = readdirSync(src)
    .filter((d) => statSync(join(src, d)).isDirectory())
    .sort();
  return langs.length ? langs : ["typescript"];
}

// ------------------------------------------------------------- examples


const executed = existsSync(join(REPO, "test", "_examples.json"))
  ? JSON.parse(readFileSync(join(REPO, "test", "_examples.json"), "utf8"))
  : {};

const MAX_ITEMS = 6; // array elements kept before eliding
const MAX_KEYS = 14; // object keys kept
const MAX_STRING = 120;

/**
 * Shrink a value to something readable on a page while recording exactly what
 * was removed. Fixtures run to 160 observations; printing all of them is the
 * reason the row and scenario tiers were originally dropped altogether, and
 * eliding without saying so would be a quiet lie about what the function
 * returned.
 */
function abbreviate(value) {
  if (Array.isArray(value)) {
    // Six numbers read at a glance; six nine-field objects are a wall. Rows of
    // records get fewer, because the reader is after the *shape* there.
    const rowShaped = value.length > 0 && value[0] !== null && typeof value[0] === "object";
    const limit = rowShaped ? 3 : MAX_ITEMS;
    const kept = value.slice(0, limit).map((v) => abbreviate(v).value);
    return {
      value: kept,
      elided: value.length > limit ? { kind: "array", shown: kept.length, total: value.length } : null,
    };
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const out = {};
    for (const k of keys.slice(0, MAX_KEYS)) out[k] = abbreviate(value[k]).value;
    return {
      value: out,
      elided: keys.length > MAX_KEYS ? { kind: "object", shown: MAX_KEYS, total: keys.length } : null,
    };
  }
  if (typeof value === "string" && value.length > MAX_STRING) {
    return { value: `${value.slice(0, MAX_STRING)}…`, elided: null };
  }
  return { value, elided: null };
}

/** A one-line description of the real shape, before any abbreviation. */
function describeShape(value) {
  if (Array.isArray(value)) {
    if (!value.length) return "empty array";
    const first = value[0];
    const of =
      first === null ? "null" : Array.isArray(first) ? "array" : typeof first === "object" ? "object" : typeof first;
    return `array of ${value.length} ${of}${value.length === 1 ? "" : "s"}`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return `object with ${keys.length} field${keys.length === 1 ? "" : "s"}: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? ", …" : ""}`;
  }
  return typeof value;
}

const literal = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s;
};

/**
 * Every topic gets a worked example, from the strongest source available:
 *
 *   fixture   the published `{ input, expected }` — asserted by the test suite
 *   executed  the arguments the catalog's own test passes, and what the
 *             function actually returned when it was run
 *   derived   the same, for the thin generated wrappers a test never calls
 *             directly; the entry is invoked with its sibling's arguments
 *
 * Only the first is labelled *verified*. The others are real output of real
 * code — nothing here is transcribed by hand — but they are not asserted
 * against the numbers published in the article, and the page says so.
 */
function workedExample(topic, entryParams) {
  const m = manifestById.get(topic.id);
  const fixtureFile = m?.fixture ? join(REPO, "test", "fixtures", m.fixture) : null;

  if (m?.convention === "A" && fixtureFile && existsSync(fixtureFile)) {
    const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
    if (fixture.input !== undefined && fixture.expected !== undefined) {
      // Mirrors how conformance.test.ts invokes it: one argument when the entry
      // takes one, named keys spread positionally otherwise.
      const args =
        entryParams.length > 1 && !Array.isArray(fixture.input)
          ? entryParams.map((p) => fixture.input[p])
          : [fixture.input];
      const out = abbreviate(fixture.expected);
      const shown = args.map((a) => abbreviate(a));
      return {
        origin: "fixture",
        verified: true,
        source: `fixture:${m.fixture}`,
        call: `${topic.entry}(${shown.map((s) => literal(s.value)).join(", ")})`,
        args: shown.map((s) => ({ value: s.value, elided: s.elided })),
        output: out.value,
        outputElided: out.elided,
        outputShape: describeShape(fixture.expected),
      };
    }
  }

  const run = executed[topic.id];
  if (!run) return null;

  const shown = run.args.map((a) => abbreviate(a));
  const out = abbreviate(run.value);
  return {
    origin: run.derived ? "derived" : "executed",
    verified: false,
    source: "executed against the catalog's own test input",
    call: `${topic.entry}(${shown.map((s) => literal(s.value)).join(", ")})`,
    args: shown.map((s) => ({ value: s.value, elided: s.elided })),
    output: out.value,
    outputElided: out.elided,
    outputShape: describeShape(run.value),
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

  for (const param of api.params ?? []) {
    if (param.type === "Record<string, unknown>") {
      apiErrors.push(`${topic.id}: api.params.${param.name} uses opaque Record<string, unknown>`);
    }
  }
  if (/warmup|warm-up/i.test(api.returns?.description ?? "") && !api.warmup) {
    apiErrors.push(`${topic.id}: return prose mentions warm-up but api.warmup is missing`);
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
    catalogLanguages: implementationLanguages(dir),
  };
});

/** Inconsistencies in the payload's own structure, collected and reported the
 *  same way contract errors are: refuse to emit rather than mislead. */
const structureErrors = [];

/** Domain → family tree, so the site can build navigation without regrouping. */
const domains = [...new Set(topics.map((t) => t.taxonomy.domainId))].sort().map((domainId) => {
  const inDomain = topics.filter((t) => t.taxonomy.domainId === domainId);
  const familyIds = [...new Set(inDomain.map((t) => t.taxonomy.familyId))].sort();

  // The first path segment is the domain's URL slug everywhere — on the site,
  // in the per-domain llms.txt route, in the topic page URL. Emitting it means
  // a consumer never has to rediscover it by finding a topic in the domain and
  // splitting its path; a domain whose topics disagree would silently produce
  // two different routes for one domain, so it fails the build instead.
  const slugs = [...new Set(inDomain.map((t) => t.path.split("/")[0]))];
  if (slugs.length !== 1) {
    structureErrors.push(`${domainId}: topics span more than one path root — ${slugs.join(", ")}`);
  }

  return {
    id: domainId,
    name: inDomain[0].taxonomy.domain,
    slug: slugs[0],
    topicCount: inDomain.length,
    families: familyIds.map((familyId) => {
      const inFamily = inDomain.filter((t) => t.taxonomy.familyId === familyId);
      return { id: familyId, name: inFamily[0].taxonomy.family, topicCount: inFamily.length };
    }),
  };
});

// ----------------------------------------------------------- archetypes

/**
 * The five fields every quote in a consensus snapshot must agree on. Shared
 * between the quotes and the policy's `expected_contract` so the example cannot
 * drift apart from itself — a mismatch there is the exact failure the algorithm
 * reports, which would make the worked example a demonstration of the error.
 */
const CONSENSUS_CONTRACT = {
  instrument_id: "SYNTH-USD",
  currency: "USD",
  price_type: "last_trade",
  adjustment: "unadjusted",
  session: "regular",
};
const CONSENSUS_AS_OF = "2026-07-13T13:30:01.000Z";

/**
 * The five input shapes, as data.
 *
 * `import.archetype` already labels every topic, but a label alone does not
 * tell a consumer how to map its own data onto it: what the first argument
 * actually is, what a minimal payload looks like, or what to run before
 * trusting the input. That is the machine half of the prose guide at
 * `/guides/archetypes/`, and without it an agent has to read the page.
 *
 * Counts are derived from the catalog. Everything else is static, because it
 * describes a *shape* rather than a catalog row — and every `example` below was
 * executed against the built package before being written down.
 *
 * Insertion order is the emitted order, and it is the guide's order: the
 * smallest shapes have the cleanest contracts, and `record-transform` is a
 * residual bucket that is deliberately last.
 */
const ARCHETYPES = {
  "series-transform": {
    firstArgument: "(number | null)[]",
    returns: "an array of the same length, aligned index-for-index with the input",
    type: "type SeriesTransform = (values: (number | null)[], ...params: number[]) => (number | null)[];",
    example: {
      subpath: "fintech-algorithms/technical-indicators/trend-smoothing/sma",
      entry: "calculateSma",
      call: "calculateSma([10, 13, 12, 15, 14, 18], 3)",
      args: [[10, 13, 12, 15, 14, 18], 3],
    },
    validator: {
      subpath:
        "fintech-algorithms/market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter",
      note: "A numeric series has no structure to check, so check its values. Takes the same number[] you are about to pass to the indicator.",
    },
    caveat:
      "Leading nulls are warm-up, not missing data. The output is the same length as the input so that bars[i] and result[i] describe the same instant; filtering the nulls shifts the series left and nothing errors.",
  },
  "tape-aggregate": {
    firstArgument: "Trade[]",
    returns: "Bar[]",
    type: "type TapeAggregate = (trades: Trade[], config: object) => Bar[];",
    example: {
      subpath: "fintech-algorithms/market-data-engineering/bar-construction/time-bars",
      entry: "constructBars",
      call: "constructBars(trades, { intervalSeconds: 60, sessionStarts: { RTH: … } })",
      args: [
        [
          {
            tradeId: "1",
            timestamp: "2026-07-20T09:30:01.000Z",
            session: "RTH",
            symbol: "DEMO",
            price: 100,
            volume: 500,
            currency: "USD",
          },
        ],
        { intervalSeconds: 60, sessionStarts: { RTH: "2026-07-20T09:30:00.000Z" } },
      ],
    },
    validator: {
      subpath:
        "fintech-algorithms/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver",
      note: "Run before aggregating. A duplicated print inflates volume permanently and is invisible once it is inside a bar.",
    },
    caveat:
      "The only shape that cares about ordering and sessions. Trades must arrive in chronological order, and sessionStarts anchors every bucket boundary — get it wrong and every bar edge is off by the same amount, consistently enough to look correct.",
  },
  "row-classify": {
    firstArgument: "an array of rows",
    returns: "one verdict per row, in the same order — verdicts.length === rows.length",
    type: "type RowClassify = (rows: Row[], config?: object) => Verdict[];",
    example: {
      subpath:
        "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator",
      entry: "validateBars",
      call: "validateBars(bars, { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 })",
      args: [
        [
          {
            timestamp: "2026-07-20T09:30:00Z",
            symbol: "DEMO",
            open: 100,
            high: 101,
            low: 99.5,
            close: 100.5,
            volume: 1000,
          },
        ],
        { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 },
      ],
    },
    validator: {
      subpath: null,
      note: "This archetype is the boundary. It is what you run before the other four.",
    },
    caveat:
      "Nothing signals failure except the verdict. These never throw on bad input — one malformed record in ten thousand should lose neither the record nor the other 9,999 — so ignoring the return value looks like success.",
  },
  "snapshot-evaluate": {
    firstArgument: "one point-in-time snapshot",
    returns: "a single verdict about that instant",
    type: "type SnapshotEvaluate = (snapshot: object, policyOrTime: object | string) => Verdict;",
    example: {
      subpath: "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check",
      entry: "consensus",
      call: "consensus({ as_of, quotes }, policy)",
      args: [
        {
          as_of: CONSENSUS_AS_OF,
          quotes: [
            { source_id: "A", owner_id: "OWNER-A", price: 100, ...CONSENSUS_CONTRACT, event_time: CONSENSUS_AS_OF },
            { source_id: "B", owner_id: "OWNER-B", price: 100.01, ...CONSENSUS_CONTRACT, event_time: CONSENSUS_AS_OF },
            { source_id: "C", owner_id: "OWNER-C", price: 100.02, ...CONSENSUS_CONTRACT, event_time: CONSENSUS_AS_OF },
          ],
        },
        {
          minimum_independent_sources: 3,
          z_threshold: 3.5,
          absolute_tolerance: 0.03,
          maximum_tolerance: 0.15,
          max_age_ms: 500,
          expected_contract: CONSENSUS_CONTRACT,
        },
      ],
    },
    validator: {
      subpath: null,
      note: "These are themselves validators. Feed them the snapshot you are about to trust.",
    },
    caveat:
      "The second argument is usually a decision time, and it is what makes the result reproducible. Passing 'now' instead of the instant being evaluated turns a point-in-time check into look-ahead.",
  },
  "record-transform": {
    firstArgument: "a domain-specific record or array",
    returns: "a domain-specific result",
    type: null,
    example: null,
    validator: {
      subpath: null,
      note: "Whichever matches the record being passed: a bar → ohlc-consistency-validator, a quote → stale-quote-detector, a corporate action → its own family's guard.",
    },
    caveat:
      "Not a shape. This is the residual bucket — a topic lands here when it is none of the other four — so it spans twelve of the thirteen domains and shares no field names between families. Read the topic's own `api` block and `example` in this payload instead.",
  },
};

const archetypeCounts = new Map();
for (const t of topics) {
  archetypeCounts.set(t.import.archetype, (archetypeCounts.get(t.import.archetype) ?? 0) + 1);
}

// A sixth archetype appearing in the catalog, or a documented one going empty,
// means this block is describing a library that no longer exists. Fail rather
// than emit a distribution that silently omits a shape.
for (const name of archetypeCounts.keys()) {
  if (!ARCHETYPES[name]) structureErrors.push(`archetype "${name}" has topics but no description`);
}
for (const name of Object.keys(ARCHETYPES)) {
  if (!archetypeCounts.get(name)) structureErrors.push(`archetype "${name}" is described but has no topics`);
}

const archetypes = Object.entries(ARCHETYPES).map(([name, a]) => ({
  name,
  topicCount: archetypeCounts.get(name) ?? 0,
  ...a,
}));

const payload = {
  schemaVersion: SCHEMA_VERSION,
  package: {
    name: pkg.name,
    version: pkg.version,
    homepage: pkg.homepage,
    license: pkg.license,
    type: pkg.type,
    engines: pkg.engines,

    // What the *package* ships, as opposed to what the catalog publishes per
    // topic in `catalogLanguages`. There is no Python package.
    languages: ["typescript"],

    entryPoints: {
      root: {
        specifier: pkg.name,
        contains: "metadata",
        note:
          "The root export carries the topic registry and the lookup helpers " +
          "(topic, byDomain, byFamily, byArchetype, load, runner). No algorithm is re-exported here.",
      },
      topic: {
        pattern: `${pkg.name}/{topic.path}`,
        conditions: ["import", "require"],
        note:
          "Algorithms are subpath-only. Each subpath exports the function named in its `import.entry` " +
          "and its own types; a sibling topic's function is never re-exported, so import it from its own subpath.",
        commonjs:
          "The require condition resolves to the same ES module as import — there is no separate " +
          "CommonJS build — so require() needs a runtime that supports require(esm).",
      },
    },

    // Every route below was requested against the live site and returned 200.
    // Patterns name the payload field that fills them, so a consumer holding
    // only this file can construct them without guessing.
    machineSurface: {
      site: DOCS,
      llms: `${DOCS}/llms.txt`,
      versionEndpoint: `${DOCS}/version.json`,
      payload: `${DOCS}/reference/payload.json`,
      domainLlms: `${DOCS}/{domain.slug}/llms.txt`,
      topicPage: `${DOCS}/{topic.path}/`,
      topicMarkdown: `${DOCS}/{topic.path}/index.md`,
      archetypeGuide: `${DOCS}/guides/archetypes/`,
    },
  },
  counts: {
    topics: topics.length,
    domains: domains.length,
    families: domains.reduce((n, d) => n + d.families.length, 0),
    verified: topics.filter((t) => t.verification.tier === "verified").length,
    withExample: topics.filter((t) => t.example).length,
    withDiagram: topics.filter((t) => t.assets.diagrams.length).length,
    withApiContract: topics.filter((t) => t.api).length,
  },
  archetypes,
  domains,
  topics,
};

// `--strict-contracts` refuses to emit when a topic has *no* contract at all.
// It is off by default because the `api:` block was populated family by family
// and a topic without one is not malformed, only undocumented. CI turns it on:
// coverage that nothing enforced is exactly how a complete 271/271 quietly
// became 280/324 as the catalog grew.
if (STRICT_CONTRACTS) {
  for (const t of topics.filter((x) => !x.api)) {
    apiErrors.push(`${t.id}: no api: block — ${t.path}/metadata.yaml`);
  }
}

// A contract that contradicts the code is worse than no contract, and a payload
// whose own structure is inconsistent will mislead every consumer downstream:
// refuse to emit rather than publish either.
if (structureErrors.length) {
  console.error(`gen-docs: ${structureErrors.length} payload structure error(s)`);
  for (const e of structureErrors) console.error(`    ${e}`);
}
if (apiErrors.length) {
  console.error(`gen-docs: ${apiErrors.length} api: contract error(s)`);
  for (const e of apiErrors) console.error(`    ${e}`);
}
if (structureErrors.length || apiErrors.length) process.exit(1);

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
