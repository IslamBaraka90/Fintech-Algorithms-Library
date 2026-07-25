/**
 * Runs every demo in order. Each one is standalone — run them individually while
 * exploring, or this file for a single sweep.
 *
 * Run: npm run demo
 */

const demos = [
  "01-technical-indicators",
  "02-bar-construction",
  "03-corporate-actions",
  "04-data-quality",
  "05-bring-your-own-data",
  "06-registry-explorer",
];

for (const name of demos) {
  await import(`./${name}.ts`);
}

console.log("=========================================================");
console.log("  All 6 demos completed.");
console.log("  Next: pick any topic from demo 6's registry listing and");
console.log("  import it by its subpath. See HANDOFF.md for the full plan.");
console.log("=========================================================\n");
