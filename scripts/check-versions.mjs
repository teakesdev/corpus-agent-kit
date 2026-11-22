#!/usr/bin/env node
// Keeps the kit's release versions in step.
//
// The kit ships two version trains:
//   plugins    - every agent-plugin / extension manifest and both marketplace files.
//                One listing republish bumps all of them together.
//   mcp-server - the npm package @corpuslaw/mcp-server (plus its package-lock entry,
//                and glama.json if it ever carries a version).
// The repo-root package.json, autopilot/ and widget/ are workspace-internal and never
// published, so their versions are not tracked here.
//
// Usage:
//   node scripts/check-versions.mjs                       # fail if a train disagrees
//   node scripts/check-versions.mjs bump <train> <x.y.z>  # set every file in a train
//   add --root <dir> to run against another checkout (tests use this)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;

// Each location: [file, path to the version field, optional?]. A '*' segment fans out
// over an array, so marketplace plugin entries are each checked.
function trains(root) {
  const plugins = [
    ['gemini-extension.json', ['version']],
    ['qwen-extension.json', ['version']],
    ['kimi.plugin.json', ['version']],
    ['.claude-plugin/marketplace.json', ['metadata', 'version']],
    ['.claude-plugin/marketplace.json', ['plugins', '*', 'version']],
    ['.cursor-plugin/marketplace.json', ['metadata', 'version']],
    ['.cursor-plugin/marketplace.json', ['plugins', '*', 'version']],
  ];
  // Every plugin package under plugins/ is found, so a new one is covered without an edit here.
  const pluginsDir = join(root, 'plugins');
  for (const dir of existsSync(pluginsDir) ? readdirSync(pluginsDir).sort() : []) {
    for (const rel of ['plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      const file = `plugins/${dir}/${rel}`;
      if (existsSync(join(root, file))) plugins.push([file, ['version']]);
    }
  }
  return {
    plugins,
    'mcp-server': [
      ['mcp-server/package.json', ['version']],
      ['package-lock.json', ['packages', 'mcp-server', 'version']],
      ['glama.json', ['version'], true],
    ],
  };
}

// Returns [{ label, value }] for each version field the path reaches.
function lookup(json, path, label = '') {
  if (path.length === 0) return [{ label, value: json }];
  const [head, ...rest] = path;
  if (head === '*') {
    if (!Array.isArray(json)) return [{ label, value: undefined }];
    return json.flatMap((item, i) => lookup(item, rest, `${label}[${i}]`));
  }
  if (json === null || typeof json !== 'object' || !(head in json)) return [{ label: `${label}.${head}`, value: undefined }];
  return lookup(json[head], rest, `${label}.${head}`);
}

function collect(root) {
  const out = {};
  for (const [train, locations] of Object.entries(trains(root))) {
    out[train] = [];
    for (const [file, path, optional] of locations) {
      const abs = join(root, file);
      if (!existsSync(abs)) {
        if (!optional) out[train].push({ file, label: path.join('.'), value: undefined, missing: true });
        continue;
      }
      const json = JSON.parse(readFileSync(abs, 'utf8'));
      for (const hit of lookup(json, path)) {
        if (optional && hit.value === undefined) continue;
        out[train].push({ file, label: hit.label.replace(/^\./, ''), value: hit.value });
      }
    }
  }
  return out;
}

export function check(root) {
  const problems = [];
  const summary = {};
  for (const [train, hits] of Object.entries(collect(root))) {
    const values = [...new Set(hits.map(h => h.value))];
    summary[train] = values;
    for (const h of hits) {
      if (h.missing) problems.push(`${train}: ${h.file} is missing`);
      else if (typeof h.value !== 'string' || !SEMVER.test(h.value)) problems.push(`${train}: ${h.file} ${h.label} = ${JSON.stringify(h.value)} is not x.y.z`);
    }
    if (values.length > 1) {
      problems.push(`${train}: versions differ:\n` + hits.map(h => `    ${String(h.value).padEnd(10)} ${h.file} ${h.label}`).join('\n'));
    }
  }
  return { ok: problems.length === 0, problems, summary };
}

// Rewrites the version strings in place, touching nothing else in the file, so the
// diff is one line per field and escapes like — survive.
export function bump(root, train, version) {
  if (!SEMVER.test(version)) throw new Error(`version must be x.y.z, got ${version}`);
  const all = collect(root);
  if (!all[train]) throw new Error(`unknown train ${train}; use one of: ${Object.keys(all).join(', ')}`);
  const byFile = new Map();
  for (const h of all[train]) {
    if (h.missing) throw new Error(`${h.file} is missing`);
    if (typeof h.value !== 'string') throw new Error(`${h.file} ${h.label} has no version string`);
    byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
  }
  const changed = [];
  const pending = [];
  for (const [file, hits] of byFile) {
    const abs = join(root, file);
    const text = readFileSync(abs, 'utf8');
    const targets = new Set(hits.map(h => h.value));
    let next = text;
    for (const old of targets) {
      const re = new RegExp(`("version"\\s*:\\s*")${old.replace(/\./g, '\\.')}(")`, 'g');
      next = next.replace(re, `$1${version}$2`);
    }
    // Verify by parsing: exactly the tracked fields changed, and nothing else did.
    const before = JSON.parse(text);
    const after = JSON.parse(next);
    const want = structuredClone(before);
    for (const [, path] of trains(root)[train].filter(([f]) => f === file)) setAll(want, path, version);
    if (JSON.stringify(after) !== JSON.stringify(want)) {
      throw new Error(`${file}: a "version" field outside the ${train} train shares the old value; edit it by hand`);
    }
    if (next !== text) pending.push([abs, file, next]);
  }
  // Write only after every file verified, so a refusal leaves the tree untouched.
  for (const [abs, file, next] of pending) {
    writeFileSync(abs, next);
    changed.push(file);
  }
  return changed;
}

function setAll(json, path, value) {
  const [head, ...rest] = path;
  if (json === null || typeof json !== 'object') return;
  if (head === '*') {
    if (Array.isArray(json)) for (const item of json) setAll(item, rest, value);
    return;
  }
  if (rest.length === 0) {
    if (head in json) json[head] = value;
    return;
  }
  setAll(json[head], rest, value);
}

function main(argv) {
  let root = '.';
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = argv[++i];
    else args.push(argv[i]);
  }
  if (args[0] === 'bump') {
    if (args.length !== 3) {
      console.error('usage: check-versions.mjs bump <plugins|mcp-server> <x.y.z>');
      return 2;
    }
    const changed = bump(root, args[1], args[2]);
    console.log(changed.length ? `Set ${args[1]} to ${args[2]} in:\n  ${changed.join('\n  ')}` : `${args[1]} is already ${args[2]}.`);
    const result = check(root);
    if (!result.ok) {
      console.error(result.problems.join('\n'));
      return 1;
    }
    return 0;
  }
  if (args.length) {
    console.error('usage: check-versions.mjs [bump <plugins|mcp-server> <x.y.z>] [--root <dir>]');
    return 2;
  }
  const result = check(root);
  if (!result.ok) {
    console.error('Version check failed:\n' + result.problems.map(p => '  ' + p).join('\n'));
    console.error('Fix with: npm run versions:bump -- <train> <x.y.z>');
    return 1;
  }
  console.log('Versions agree: ' + Object.entries(result.summary).map(([t, v]) => `${t} ${v[0]}`).join(', ') + '.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
