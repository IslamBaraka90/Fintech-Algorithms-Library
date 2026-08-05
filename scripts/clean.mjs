import { rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(join(repoRoot, "dist"));

if (dirname(dist) !== repoRoot || basename(dist) !== "dist") {
  throw new Error(`Refusing to clean unexpected build directory: ${dist}`);
}

rmSync(dist, { recursive: true, force: true });
