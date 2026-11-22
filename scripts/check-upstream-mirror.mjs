#!/usr/bin/env node
// Fail when a mirrored skill file differs from the bytes Corpus mirrored here.
//
// skills/UPSTREAM.sha256 is written by teakesdev/Corpus `scripts/mirror-kit-skills.mjs`.
// Every file it lists must hash to the recorded value, and every file under skills/
// except the per-repo READMEs and the manifest itself must be listed. A fix to a
// mirrored file belongs upstream in Corpus `packages/skills/`, then comes back as a
// re-mirror (KIT one-way mirror rule; see skills/corpus-business-formation/README.md).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "skills/UPSTREAM.sha256";
const errors = [];

const listed = new Map();
for (const line of readFileSync(path.join(ROOT, MANIFEST), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
  if (!m) {
    errors.push(`${MANIFEST}: malformed line ${JSON.stringify(line)}`);
    continue;
  }
  listed.set(m[2], m[1]);
}

for (const [rel, want] of listed) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) {
    errors.push(`${rel} is listed in ${MANIFEST} but missing`);
    continue;
  }
  const got = createHash("sha256").update(readFileSync(abs)).digest("hex");
  if (got !== want) errors.push(`${rel} differs from the upstream mirror (edit Corpus packages/skills, then re-mirror)`);
}

function walk(dir) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
    else if (rel !== MANIFEST && name !== "README.md" && name !== ".DS_Store" && !listed.has(rel)) {
      errors.push(`${rel} is under skills/ but not mirrored from upstream`);
    }
  }
}
walk("skills");

if (errors.length) {
  console.error("upstream skill mirror drift:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`ok: ${listed.size} mirrored files match ${MANIFEST}`);
