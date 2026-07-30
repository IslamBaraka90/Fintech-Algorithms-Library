/**
 * A deliberately small block-YAML reader.
 *
 * `sync.mjs` parses `metadata.yaml` as a flat `key: value` map with a one-level
 * `repo:` block, which is all it has ever needed. The `api:` contract is nested
 * — maps inside sequences inside maps — so it needs a real parser, and pulling a
 * YAML dependency into a zero-dependency package's toolchain to read its own
 * metadata is not a trade worth making.
 *
 * Supported, because the catalog uses exactly this much:
 *
 *   key: scalar            quoted or bare, with `true`/`false`/`null`/numbers coerced
 *   key:                   nested map by indentation
 *   key:                   sequence of scalars or of maps, `- ` prefixed
 *   key: >                 folded block scalar (newlines become spaces)
 *   key: |                 literal block scalar (newlines preserved)
 *   # comment              whole-line and trailing, outside quotes
 *   [a, b]                 inline flow sequence of scalars
 *
 * Everything else — anchors, aliases, multi-document streams, complex keys,
 * nested flow mappings — throws rather than guessing. A parser that silently
 * misreads a contract is worse than one that refuses to read it.
 */

const INDENT_STEP_RE = /^(\s*)(.*)$/;

/** Strip a trailing `# comment` that is not inside quotes. */
function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

function scalar(raw) {
  const v = raw.trim();
  if (v === "") return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((x) => scalar(x));
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}

/** Split source into `{ indent, text }` for every significant line. */
function lex(source) {
  const out = [];
  for (const raw of source.split(/\r?\n/)) {
    const [, indentStr, rest] = INDENT_STEP_RE.exec(raw);
    if (indentStr.includes("\t")) throw new Error("yaml-subset: tabs are not valid indentation");
    const text = stripComment(rest).trimEnd();
    if (text === "") continue;
    out.push({ indent: indentStr.length, text, raw });
  }
  return out;
}

export function parseYaml(source) {
  const lines = lex(source);
  let i = 0;

  /** Consume a block scalar (`>` or `|`) that starts after the marker. */
  function blockScalar(kind, parentIndent) {
    const parts = [];
    while (i < lines.length && lines[i].indent > parentIndent) {
      parts.push(lines[i].raw.slice(lines[i].indent));
      i++;
    }
    return kind === "|" ? parts.join("\n") : parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function parseBlock(indent) {
    // A sequence and a map cannot share an indent level; decide from the first line.
    if (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
      const arr = [];
      while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
        const inline = lines[i].text.slice(2).trim();
        if (/^[\w.-]+\s*:/.test(inline)) {
          // `- key: value` — a map whose first pair is on the dash line. Rewrite
          // the line as a map entry at a deeper indent and parse it as a map.
          lines[i] = { ...lines[i], indent: indent + 2, text: inline };
          arr.push(parseBlock(indent + 2));
        } else {
          arr.push(scalar(inline));
          i++;
        }
      }
      return arr;
    }

    const map = {};
    while (i < lines.length && lines[i].indent === indent) {
      const { text } = lines[i];
      const colon = text.indexOf(":");
      if (colon === -1) throw new Error(`yaml-subset: expected "key: value" at ${JSON.stringify(text)}`);
      const key = text.slice(0, colon).trim();
      const value = text.slice(colon + 1).trim();
      i++;

      if (value === ">" || value === "|") {
        map[key] = blockScalar(value, indent);
      } else if (value === "") {
        map[key] = i < lines.length && lines[i].indent > indent ? parseBlock(lines[i].indent) : null;
      } else {
        map[key] = scalar(value);
      }
    }
    return map;
  }

  if (lines.length === 0) return {};
  return parseBlock(lines[0].indent);
}
