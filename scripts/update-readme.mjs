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
const rows = [...registry.matchAll(/\{ id: "([^"]+)".*?domainId: "([^"]+)", domain: "([^"]+)", familyId: "([^"]+)".*?archetype: "([^"]+)"/g)].map(
  (m) => ({ id: m[1], domainId: m[2], domain: m[3], familyId: m[4], archetype: m[5] }),
);

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

let readme = readFileSync(readmePath, "utf8");
let replaced = 0;

for (const [name, body] of [
  ["stats", statsBlock],
  ["shapes", shapesBlock],
  ["coverage", coverageBlock],
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
