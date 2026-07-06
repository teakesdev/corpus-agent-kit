// Builds the loader (classic script) and the lazy app bundle (ESM) into
// dist/, then enforces the spec's gzipped size budgets.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(here, "dist");
mkdirSync(outdir, { recursive: true });

const BUDGETS_GZ = { "widget.js": 2 * 1024, "widget-app.js": 60 * 1024 };

await build({
  entryPoints: [path.join(here, "src/loader.ts")],
  outfile: path.join(outdir, "widget.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
});

await build({
  entryPoints: [path.join(here, "src/app.tsx")],
  outfile: path.join(outdir, "widget-app.js"),
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2019",
  jsx: "automatic",
  jsxImportSource: "preact",
});

let failed = false;
for (const [file, budget] of Object.entries(BUDGETS_GZ)) {
  const gz = gzipSync(readFileSync(path.join(outdir, file))).length;
  const ok = gz <= budget;
  console.log(`${ok ? "ok " : "FAIL"} ${file}: ${gz} B gzipped (budget ${budget} B)`);
  if (!ok) failed = true;
}
if (failed) {
  console.error("widget build exceeds size budget");
  process.exit(1);
}
