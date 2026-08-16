#!/usr/bin/env node
/**
 * Query the fintech-algorithms reference without reading 2.6 MB of JSON.
 *
 * Resolution order matches the one in SKILL.md: the installed package first,
 * because it is offline, instant, and guaranteed to describe the exact version
 * the caller will run. The network copy is the fallback for a machine where the
 * package is not a dependency yet — answering "what would I install" is a real
 * question and it must not require installing anything first.
 *
 *   node lookup.mjs search <query>          find topics by name, slug or family
 *   node lookup.mjs show <slug|id|path>     full contract and worked example
 *   node lookup.mjs archetype <name>        every topic sharing an input shape
 *   node lookup.mjs domain <id|slug>        every topic in a domain
 *   node lookup.mjs domains                 the thirteen domains
 *   node lookup.mjs version                 installed vs published
 *
 * Zero dependencies. Node >= 18 (uses global fetch); the library itself needs 22.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const PAYLOAD_URL = "https://docs.thefintechbuilder.com/reference/payload.json";
const VERSION_URL = "https://docs.thefintechbuilder.com/version.json";
const CACHE = join(tmpdir(), "fintech-algorithms-payload.json");

// ------------------------------------------------------------------ payload

/** Walk up from `start` looking for an installed copy of the package. */
function findInstalled(start) {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "node_modules", "fintech-algorithms", "docs.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadPayload() {
  const override = process.env.FINTECH_DOCS_JSON;
  if (override && existsSync(override)) {
    return { payload: JSON.parse(readFileSync(override, "utf8")), source: override };
  }

  const installed = findInstalled(process.cwd());
  if (installed) {
    return { payload: JSON.parse(readFileSync(installed, "utf8")), source: "installed package" };
  }

  // This script ships inside the package, so the payload it describes is three
  // directories up from it. Without this, running the CLI from anywhere that is
  // not a dependent project skipped straight past its own docs.json and answered
  // from the network — quietly serving a different version of the library than
  // the one it is sitting in.
  const sibling = fileURLToPath(new URL("../../../docs.json", import.meta.url));
  if (existsSync(sibling)) {
    return { payload: JSON.parse(readFileSync(sibling, "utf8")), source: "the package this script ships in" };
  }

  // Cached network copy. Stale-by-a-day is fine for a reference that only
  // changes on release; `version` reports the number so a caller can tell.
  if (existsSync(CACHE)) {
    const age = Date.now() - Number(readFileSync(CACHE + ".stamp", "utf8").trim() || 0);
    if (age < 86_400_000) {
      return { payload: JSON.parse(readFileSync(CACHE, "utf8")), source: "cached download" };
    }
  }

  const res = await fetch(PAYLOAD_URL);
  if (!res.ok) {
    fail(
      `could not load the reference: ${res.status} ${res.statusText}\n` +
        `Install the package (npm install fintech-algorithms) or set FINTECH_DOCS_JSON.`,
    );
  }
  const text = await res.text();
  try {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, text, "utf8");
    writeFileSync(CACHE + ".stamp", String(Date.now()), "utf8");
  } catch {
    // A read-only temp dir is not a reason to fail the query.
  }
  return { payload: JSON.parse(text), source: PAYLOAD_URL };
}

// ------------------------------------------------------------------ helpers

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const norm = (s) => String(s ?? "").toLowerCase();

/** Slug, catalog id, full path or docs URL — all name the same thing. */
function findTopic(payload, needle) {
  const q = norm(needle)
    .replace(/^https?:\/\/docs\.thefintechbuilder\.com\//, "")
    .replace(/^fintech-algorithms\//, "")
    .replace(/\/$/, "");
  return (
    payload.topics.find((t) => norm(t.id) === q) ??
    payload.topics.find((t) => norm(t.slug) === q) ??
    payload.topics.find((t) => norm(t.path) === q) ??
    payload.topics.find((t) => norm(t.import.entry) === q) ??
    null
  );
}

const line = (t) =>
  `${t.id}  ${t.name}\n` +
  `    import { ${t.import.entry} } from "${t.import.subpath}";\n` +
  `    ${t.import.signature} · ${t.import.archetype} · ${t.verification.tier}`;

function truncate(value, max = 600) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  if (s === undefined) return "undefined";
  return s.length > max ? s.slice(0, max) + `\n    … (${s.length - max} more chars)` : s;
}

// ----------------------------------------------------------------- commands

function cmdSearch(payload, query) {
  if (!query) fail("usage: lookup.mjs search <query>");
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const scored = payload.topics
    .map((t) => {
      const hay = norm(
        [t.name, t.slug, t.headline, t.taxonomy.family, t.taxonomy.domain, t.import.entry].join(" "),
      );
      // Every term must appear; ranking favours a hit in the name over the domain.
      if (!terms.every((term) => hay.includes(term))) return null;
      const inName = terms.filter((term) => norm(t.name + " " + t.slug).includes(term)).length;
      return { t, score: inName * 10 + (t.verification.tier === "verified" ? 1 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    console.log(
      `No topic matches "${query}".\n` +
        `The library covers 324 named topics; it has no catch-all. Say so rather than\n` +
        `substituting a nearby algorithm. Try: lookup.mjs domains`,
    );
    return;
  }
  console.log(`${scored.length} match${scored.length === 1 ? "" : "es"}\n`);
  for (const { t } of scored.slice(0, 20)) console.log(line(t) + "\n");
  if (scored.length > 20) console.log(`… ${scored.length - 20} more. Narrow the query.`);
}

function cmdShow(payload, needle) {
  if (!needle) fail("usage: lookup.mjs show <slug|id|path>");
  const t = findTopic(payload, needle);
  if (!t) {
    fail(
      `No topic named "${needle}".\n` +
        `Do not invent a subpath — try: node lookup.mjs search "${needle}"`,
    );
  }

  const out = [];
  out.push(`${t.name}  [${t.id}]`);
  if (t.headline) out.push(t.headline);
  out.push("");
  out.push(`${t.taxonomy.domain} › ${t.taxonomy.family} · difficulty ${t.taxonomy.difficulty}`);
  out.push(`archetype: ${t.import.archetype} · verification: ${t.verification.tier}`);
  out.push("");
  out.push(`import { ${t.import.entry} } from "${t.import.subpath}";`);
  out.push(`${t.import.signature}`);
  if (t.import.exports.length > 1) {
    out.push(`also exported: ${t.import.exports.filter((e) => e !== t.import.entry).join(", ")}`);
  }

  const api = t.api;
  if (api) {
    if (api.summary) out.push("", "SUMMARY", "  " + api.summary.replace(/\s*\n\s*/g, "\n  "));
    if (api.params?.length) {
      out.push("", "PARAMETERS");
      for (const p of api.params) {
        out.push(`  ${p.name}: ${p.type}${p.required ? "" : "   (optional)"}`);
        if (p.description) out.push(`      ${p.description.replace(/\s*\n\s*/g, " ")}`);
        if (p.constraints) out.push(`      constraints: ${JSON.stringify(p.constraints)}`);
        if (p.nulls) out.push(`      nulls: ${p.nulls}`);
        if (p.default !== null && p.default !== undefined) out.push(`      default: ${p.default}`);
      }
    }
    if (api.returns) {
      out.push("", "RETURNS", `  ${api.returns.type}`);
      if (api.returns.description) out.push(`  ${api.returns.description.replace(/\s*\n\s*/g, " ")}`);
      if (api.returns.length) out.push(`  length: ${api.returns.length}`);
    }
    if (api.warmup) {
      out.push("", "WARM-UP");
      out.push(`  ${api.warmup.count} leading positions are ${api.warmup.value}`);
      if (api.warmup.note) out.push(`  ${api.warmup.note.replace(/\s*\n\s*/g, " ")}`);
    }
    if (api.errors?.length) {
      out.push("", "ERRORS");
      for (const e of api.errors) out.push(`  ${e.when} → ${e.behaviour}`);
    }
    if (api.complexity) out.push("", `COMPLEXITY  time ${api.complexity.time} · space ${api.complexity.space}`);
  }

  if (t.example) {
    out.push("", "WORKED EXAMPLE" + (t.example.verified ? "  (verified — replayed by the test suite)" : ""));
    out.push("  call:");
    out.push("    " + truncate(t.example.call, 900).replace(/\n/g, "\n    "));
    if (t.example.output !== undefined) {
      out.push("  output:");
      out.push("    " + truncate(t.example.output, 900).replace(/\n/g, "\n    "));
      out.push("");
      out.push("  ^ Field names come from this output, not from the RETURNS type string.");
    }
  }

  out.push("", "LINKS");
  out.push(`  contract (markdown): ${t.links.article.replace("thefintechbuilder.com", "docs.thefintechbuilder.com")}index.md`);
  if (t.links.article) out.push(`  article: ${t.links.article}`);
  if (t.links.source) out.push(`  source: ${t.links.source}`);

  console.log(out.join("\n"));
}

function cmdArchetype(payload, name) {
  const names = (payload.archetypes ?? []).map((a) => a.name);
  if (!name) fail(`usage: lookup.mjs archetype <${names.join("|") || "name"}>`);
  const meta = (payload.archetypes ?? []).find((a) => norm(a.name) === norm(name));
  const topics = payload.topics.filter((t) => norm(t.import.archetype) === norm(name));
  if (!topics.length) fail(`Unknown archetype "${name}". Known: ${names.join(", ")}`);

  if (meta) {
    console.log(`${meta.name} — ${meta.topicCount} topics\n`);
    console.log(`first argument: ${meta.firstArgument}`);
    console.log(`returns:        ${meta.returns}`);
    if (meta.type) console.log(`\n${meta.type}`);
    if (meta.example) {
      console.log(`\nexample:  ${meta.example.call}`);
      console.log(`          from "${meta.example.subpath}"`);
    }
    if (meta.validator?.subpath) console.log(`\nvalidate first with: ${meta.validator.subpath}`);
    if (meta.validator?.note) console.log(`  ${meta.validator.note}`);
    if (meta.caveat) console.log(`\nCAVEAT\n  ${meta.caveat.replace(/\s*\n\s*/g, "\n  ")}`);
    console.log("\n" + "-".repeat(60) + "\n");
  }
  for (const t of topics.slice(0, 40)) console.log(line(t) + "\n");
  if (topics.length > 40) console.log(`… ${topics.length - 40} more.`);
}

function cmdDomain(payload, key) {
  if (!key) fail("usage: lookup.mjs domain <id|slug>");
  const topics = payload.topics.filter(
    (t) => norm(t.taxonomy.domainId) === norm(key) || norm(t.path.split("/")[0]) === norm(key),
  );
  if (!topics.length) fail(`Unknown domain "${key}". Try: lookup.mjs domains`);
  const slug = topics[0].path.split("/")[0];
  console.log(
    `${topics[0].taxonomy.domain} (${topics[0].taxonomy.domainId}) — ${topics.length} topics\n` +
      `index: https://docs.thefintechbuilder.com/${slug}/llms.txt\n`,
  );
  let family = null;
  for (const t of topics) {
    if (t.taxonomy.family !== family) {
      family = t.taxonomy.family;
      console.log(`\n## ${family}\n`);
    }
    console.log(line(t) + "\n");
  }
}

function cmdDomains(payload) {
  console.log(`${payload.counts.topics} topics · ${payload.counts.domains} domains · ${payload.counts.verified} verified\n`);
  for (const d of payload.domains) {
    const first = payload.topics.find((t) => t.taxonomy.domainId === d.id);
    const slug = first.path.split("/")[0];
    console.log(`${d.id}  ${d.name}  (${d.topicCount})`);
    console.log(`    https://docs.thefintechbuilder.com/${slug}/llms.txt\n`);
  }
}

async function cmdVersion(payload, source) {
  console.log(`reference source: ${source}`);
  console.log(`reference version: ${payload.package.version} (payload schema ${payload.schemaVersion})`);
  console.log(`counts: ${JSON.stringify(payload.counts)}`);
  try {
    const res = await fetch(VERSION_URL);
    if (res.ok) {
      const live = await res.json();
      console.log(`published docs: ${live.package.version}`);
      if (live.package.version !== payload.package.version) {
        console.log(
          `\n! The reference you are reading (${payload.package.version}) is not the published one ` +
            `(${live.package.version}).\n  Say which you used when it affects the answer.`,
        );
      }
    }
  } catch {
    console.log("published docs: unreachable (offline)");
  }
}

// -------------------------------------------------------------------- main

const [command, ...rest] = process.argv.slice(2);
const argument = rest.join(" ").trim();

if (!command || ["-h", "--help", "help"].includes(command)) {
  console.log(
    [
      "node lookup.mjs search <query>        find topics by name, slug or family",
      "node lookup.mjs show <slug|id|path>   full contract and worked example",
      "node lookup.mjs archetype <name>      every topic sharing an input shape",
      "node lookup.mjs domain <id|slug>      every topic in a domain",
      "node lookup.mjs domains               the thirteen domains",
      "node lookup.mjs version               installed vs published",
    ].join("\n"),
  );
  process.exit(0);
}

const { payload, source } = await loadPayload();

switch (command) {
  case "search":
    cmdSearch(payload, argument);
    break;
  case "show":
    cmdShow(payload, argument);
    break;
  case "archetype":
    cmdArchetype(payload, argument);
    break;
  case "domain":
    cmdDomain(payload, argument);
    break;
  case "domains":
    cmdDomains(payload);
    break;
  case "version":
    await cmdVersion(payload, source);
    break;
  default:
    fail(`Unknown command "${command}". Run with --help.`);
}
