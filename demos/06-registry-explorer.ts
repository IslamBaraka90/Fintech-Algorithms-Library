/**
 * Demo 6 — The registry
 *
 * The package root exports metadata only, never algorithm code. That keeps the
 * root import light and lets you build docs sites, playgrounds and dispatchers
 * that enumerate the library without bundling all 114 implementations.
 *
 * Run: npm run build && node --experimental-strip-types demos/06-registry-explorer.ts
 */

import { topics, topic, byDomain, byFamily, byArchetype, load, runner } from "fintech-algorithms";

console.log("\n=== Demo 6 — registry explorer ==========================\n");

console.log(`${topics.length} topics across ${new Set(topics.map((t) => t.domainId)).size} domains\n`);

// --- inventory by domain ----------------------------------------------------

const domains = [...new Set(topics.map((t) => t.domainId))].sort();
console.log("by domain:");
for (const id of domains) {
  const inDomain = byDomain(id);
  const families = new Set(inDomain.map((t) => t.familyId)).size;
  console.log(
    `  ${id}  ${String(inDomain.length).padStart(3)} topics  ${String(families).padStart(2)} families  ${inDomain[0].domain}`,
  );
}

// --- inventory by shape -----------------------------------------------------

console.log("\nby shape (archetype):");
const shapes = [...new Set(topics.map((t) => t.archetype))];
for (const shape of shapes.sort((a, b) => byArchetype(b).length - byArchetype(a).length)) {
  console.log(`  ${shape.padEnd(20)} ${String(byArchetype(shape).length).padStart(3)}`);
}

// --- one family in full -----------------------------------------------------

console.log("\nD01-F01 — Bar Construction:");
for (const t of byFamily("D01-F01")) {
  console.log(`  ${t.id}  ${t.title.padEnd(24)} entry: ${t.entry}()`);
}

// --- drill into one topic ---------------------------------------------------

const ema = topic("D07-F01-A02");
if (ema) {
  console.log("\ntopic('D07-F01-A02'):");
  console.log(`  title    ${ema.title}`);
  console.log(`  shape    ${ema.archetype}`);
  console.log(`  import   fintech-algorithms/${ema.path}`);
  console.log(`  exports  ${ema.exports.join(", ")}`);
  console.log(`  article  ${ema.articleUrl}`);
  if (ema.repoUrl) console.log(`  repo     ${ema.repoUrl}`);
}

// --- registry-driven dispatch ----------------------------------------------

console.log("\nregistry-driven dispatch (no static import of the algorithm):");
const run = await runner("D07-F01-A01");
console.log(`  runner('D07-F01-A01')([1,2,3,4,5], 3) = ${JSON.stringify(run([1, 2, 3, 4, 5], 3))}`);

const mod = await load("D07-F01-A02");
console.log(`  load('D07-F01-A02') exports: ${Object.keys(mod).join(", ")}`);

// --- coverage of the published article set ---------------------------------

const withRepo = topics.filter((t) => t.repoUrl).length;
console.log(
  `\n  ${withRepo}/${topics.length} topics also ship as a standalone GitHub repo.` +
    `\n  Every subpath mirrors its article URL exactly.\n`,
);
