/**
 * A module load hook that records how a topic's entry function is really called.
 *
 * Reference pages need a worked example for every topic, and most topics ship no
 * `{ input, expected }` fixture the package can print. But every topic in the
 * catalog has a test, and that test necessarily calls into the implementation
 * with valid, authored input. So rather than parse the test — fragile — this
 * wraps the exported functions and lets the test run: whatever arguments it
 * passes, and whatever comes back, are the example.
 *
 * The wrapping works because an `export function` declaration is a *mutable*
 * binding and ES module exports are live: reassigning it inside the module makes
 * every importer see the wrapper, including a test that imported it earlier.
 *
 * Two cases, because whole families share one implementation body:
 *
 *   1. The test calls the topic's entry directly — record args and return value.
 *   2. The test only calls a generic sibling (`detectReversal(close, "double_top")`
 *      where the topic's entry is the thin `double_top(close)` wrapper). Then at
 *      exit, call the entry ourselves with the leading arguments the sibling
 *      received, and mark the example as derived so nothing claims to be
 *      something it is not.
 *
 * Registered by `capture-examples.mjs`, one child process per topic, so a topic
 * whose test crashes cannot take the rest of the run with it.
 */

const TARGET = process.env.CAPTURE_IMPL_URL;
const ENTRY = process.env.CAPTURE_ENTRY;
const OUT = process.env.CAPTURE_OUT;
const SCOPE = process.env.CAPTURE_SCOPE; // catalog root, as a file: URL prefix

export async function load(url, context, next) {
  const result = await next(url, context);
  if (!result.source) return result;

  // Matching a single path missed 24 topics whose tests import a shared family
  // body rather than the topic's own file, so the target is the *function*:
  // instrument any module inside the catalog that declares it. The scope check
  // keeps this away from node_modules and same-named functions elsewhere.
  if (url !== TARGET && !(SCOPE && url.startsWith(SCOPE))) return result;

  const source = result.source.toString();

  // Only function declarations can be reassigned. `export const f = …` is a
  // const binding, and silently failing to capture would be worse than
  // reporting no example at all.
  const names = [...source.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  if (!names.length) return result;

  // `require` does not exist in an ES module, and import declarations hoist —
  // so the writer is imported here even though the statement is appended.
  const instrumentation = `
import { writeFileSync as __captureWrite } from "node:fs";
;(() => {
  const __state = (globalThis.__CAPTURE__ ??= { direct: null, sibling: null, written: false });
  const __wrap = (name, fn) => function (...args) {
    const value = fn.apply(this, args);
    if (name === ${JSON.stringify(ENTRY)}) {
      __state.direct ??= { args, value };
    } else if (!__state.sibling || args.length > __state.sibling.args.length) {
      __state.sibling = { args, fn: ${JSON.stringify(ENTRY)} };
    }
    return value;
  };
${names.map((n) => `  ${n} = __wrap(${JSON.stringify(n)}, ${n});`).join("\n")}

  if (!__state.installed) {
    __state.installed = true;
    const __entry = ${names.includes(ENTRY) ? ENTRY : "null"};
    process.on("exit", () => {
      if (__state.written) return;
      let record = null;
      if (__state.direct) {
        record = { args: __state.direct.args, value: __state.direct.value, derived: false };
      } else if (__state.sibling && __entry) {
        // Same module, same data: the leading arguments a sibling received are
        // the ones this wrapper takes. Only kept if it actually returns.
        try {
          const args = __state.sibling.args.slice(0, __entry.length || 1);
          record = { args, value: __entry(...args), derived: true };
        } catch {}
      }
      // The thin per-topic wrappers are generated into the package by sync.mjs
      // and do not exist in the catalog at all, so there is nothing here to
      // call. Hand the sibling arguments to the parent process, which can
      // finish the job against the published module.
      if (!record && __state.sibling) {
        try {
          __captureWrite(
            ${JSON.stringify(OUT)} + ".sibling",
            JSON.stringify({ args: __state.sibling.args }, (k, v) =>
              typeof v === "number" && !Number.isFinite(v) ? String(v) : v),
          );
        } catch {}
      }
      if (!record) return;
      __state.written = true;
      try {
        __captureWrite(
          ${JSON.stringify(OUT)},
          JSON.stringify(record, (k, v) =>
            typeof v === "number" && !Number.isFinite(v) ? String(v) : v),
        );
      } catch {}
    });
  }
})();
`;

  return { ...result, source: source + instrumentation };
}
