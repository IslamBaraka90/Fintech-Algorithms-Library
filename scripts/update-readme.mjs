#!/usr/bin/env node
/**
 * Rewrite the generated statistics blocks in README.md from the registry, so the
 * documented counts cannot drift from reality. (They did: the README claimed 114
 * topics and 22 families long after the catalog had grown past both.)
 *
 * Each block is delimited by HTML comments and replaced wholesale:
 *   <!-- stats:start --> … <!-- stats:end -->
 *   <!-- coverage:start --> … <!-- coverage:end -->
 *   <!-- shapes:start --> … <!-- shapes:end -->
 *
 * Run via `npm run sync` (which calls this) or directly.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(REPO, "src", "_registry.ts");
const manifestPath = join(REPO, "test", "_manifest.json");
const readmePath = join(REPO, "README.md");

if (!existsSync(registryPath)) {
  console.error("src/_registry.ts missing — run `npm run sync` first.");
  process.exit(1);
}

// The registry is generated TypeScript; the fields needed here are simple enough
// to read with a regex rather than importing (which would need type-stripping).
const registry = readFileSync(registryPath, "utf8");
const rows = [...registry.matchAll(
  /\{ id: "([^"]+)", title: "([^"]+)", slug: "([^"]+)", domainId: "([^"]+)", domain: "([^"]+)", familyId: "([^"]+)", family: "([^"]+)".*?archetype: "([^"]+)".*?path: "([^"]+)"/g,
)].map((m) => ({
  id: m[1],
  title: m[2],
  slug: m[3],
  domainId: m[4],
  domain: m[5],
  familyId: m[6],
  family: m[7],
  archetype: m[8],
  path: m[9],
}));

if (rows.length === 0) {
  console.error("could not parse any topics out of src/_registry.ts");
  process.exit(1);
}

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { topics: [] };
const conventions = manifest.topics.reduce((acc, t) => {
  acc[t.convention ?? "none"] = (acc[t.convention ?? "none"] ?? 0) + 1;
  return acc;
}, {});
const verified = manifest.topics.length - (conventions.none ?? 0);

const domains = [...new Set(rows.map((r) => r.domainId))].sort();
const families = new Set(rows.map((r) => r.familyId));

const statsBlock = [
  `**${rows.length} topics** · ${domains.length} domains · ${families.size} families`,
  ``,
  `| Domain | Topics | Families | Name |`,
  `|---|--:|--:|---|`,
  ...domains.map((id) => {
    const inDomain = rows.filter((r) => r.domainId === id);
    const fams = new Set(inDomain.map((r) => r.familyId)).size;
    return `| ${id} | ${inDomain.length} | ${fams} | ${inDomain[0].domain} |`;
  }),
].join("\n");

const shapeCounts = rows.reduce((acc, r) => ((acc[r.archetype] = (acc[r.archetype] ?? 0) + 1), acc), {});
const SHAPE_DOC = {
  "record-transform": ["`(input) → output`", "backward-split-adjustment"],
  "series-transform": ["`(values, ...params) → (number\\|null)[]`", "ema, rsi, macd"],
  "row-classify": ["`(rows, config?) → verdict[]`", "ohlc-consistency-validator"],
  "tape-aggregate": ["`(trades, config) → bar[]`", "time-bars, volume-bars"],
  "snapshot-evaluate": ["`(snapshot, policy) → result`", "price-source-consensus-check"],
};
const shapesBlock = [
  `| Archetype | Signature | Count | Example |`,
  `|---|---|--:|---|`,
  ...Object.entries(shapeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([shape, count]) => {
      const [sig, example] = SHAPE_DOC[shape] ?? ["—", "—"];
      return `| \`${shape}\` | ${sig} | ${count} | ${example} |`;
    }),
].join("\n");

const coverageBlock = [
  `**${verified} of ${rows.length} topics** are verified against the catalog's own published numbers`,
  `(${conventions.A ?? 0} via \`{ input, expected }\`, ${conventions.B ?? 0} via row fixtures, ${conventions.C ?? 0} via bar/checkpoint fixtures).`,
  `The remaining ${conventions.none ?? 0} are proven to load and expose a callable entry point, but their`,
  `arithmetic is not asserted here — those topics ship no machine-readable expected`,
  `values in the catalog.`,
].join("\n");

/**
 * Base URL of the reference site. The GitHub Pages project URL is used rather
 * than docs.thefintechbuilder.com because it resolves today; once the custom
 * domain is configured GitHub 301s this to it, so published READMEs keep
 * working. Switch this one constant afterwards.
 */
const DOCS = "https://islambaraka90.github.io/fintech-algorithms-docs";

/**
 * Every algorithm by name, grouped by domain and family, each linked to its
 * reference page.
 *
 * This block is what makes the library findable: before it existed the README
 * named zero algorithms — it listed domain counts — so a search for "VWAP
 * typescript" or "McClellan oscillator npm" could never match this page.
 *
 * It was a 187-row table of name, family, import path and verification tick.
 * That is reference material, and reference material now has somewhere to live:
 * every one of those columns is on the topic's own docs page, where a reader who
 * has already chosen the algorithm will look for it. What has to stay here is
 * the *names*, because this page is the search surface. So the table collapsed
 * to a linked index — 232 lines to roughly 35, with every searchable term kept.
 *
 * Titles are trimmed at the first colon: 34 of them are article headlines rather
 * than names, and `Merger Predecessor/Successor Mapping: Preserve Identity and
 * Entitlements Without Inventing Continuity` is not a label anyone scans.
 */
const shortName = (title) => title.split(/\s*[:—]\s*/)[0].trim();

const topicsBlock = domains
  .flatMap((domainId) => {
    const inDomain = rows.filter((r) => r.domainId === domainId);
    const familyIds = [...new Set(inDomain.map((r) => r.familyId))].sort();
    return [
      ``,
      `### ${domainId} — ${inDomain[0].domain} · ${inDomain.length} topics`,
      ``,
      ...familyIds.map((familyId) => {
        const inFamily = inDomain.filter((r) => r.familyId === familyId);
        const names = inFamily
          .map((r) => `[${shortName(r.title)}](${DOCS}/${r.path}/)`)
          .join(" · ");
        return `**${inFamily[0].family}** — ${names}\n`;
      }),
    ];
  })
  .join("\n")
  .trim();

let readme = readFileSync(readmePath, "utf8");
let replaced = 0;

for (const [name, body] of [
  ["stats", statsBlock],
  ["shapes", shapesBlock],
  ["coverage", coverageBlock],
  ["topics", topicsBlock],
]) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(readme)) {
    console.warn(`  README.md has no <!-- ${name}:start --> block — skipped`);
    continue;
  }
  readme = readme.replace(re, `$1\n${body}\n$2`);
  replaced++;
}

writeFileSync(readmePath, readme, "utf8");
console.log(`  README.md: ${replaced} generated block(s) refreshed — ${rows.length} topics, ${verified} verified`);
