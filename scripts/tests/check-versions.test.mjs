// Run: node --test scripts/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, bump } from '../check-versions.mjs';

const FILES = [
  'gemini-extension.json', 'qwen-extension.json', 'kimi.plugin.json', 'glama.json', 'package-lock.json',
  '.claude-plugin/marketplace.json', '.cursor-plugin/marketplace.json', 'mcp-server/package.json',
  'plugins/corpus/plugin.json', 'plugins/corpus/.claude-plugin/plugin.json',
  'plugins/corpus/.cursor-plugin/plugin.json', 'plugins/corpus-codex/.codex-plugin/plugin.json',
];

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'kit-versions-'));
  for (const f of FILES) cpSync(f, join(dir, f), { recursive: true });
  return dir;
}

test('the repo as committed passes', () => {
  const r = check('.');
  assert.ok(r.ok, r.problems.join('\n'));
});

test('one drifted manifest fails and is named', () => {
  const dir = copyRepo();
  try {
    const f = join(dir, 'kimi.plugin.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace(/"version": "[^"]+"/, '"version": "9.9.9"'));
    const r = check(dir);
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /plugins: versions differ[\s\S]*9\.9\.9\s+kimi\.plugin\.json/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('a marketplace plugin entry is checked too', () => {
  const dir = copyRepo();
  try {
    const f = join(dir, '.cursor-plugin/marketplace.json');
    const json = JSON.parse(readFileSync(f, 'utf8'));
    json.plugins[0].version = '0.0.1';
    writeFileSync(f, JSON.stringify(json, null, 2));
    assert.match(check(dir).problems.join('\n'), /0\.0\.1\s+\.cursor-plugin\/marketplace\.json plugins\[0\]\.version/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('bump sets one train, leaves the other and the rest of each file alone', () => {
  const dir = copyRepo();
  try {
    const before = Object.fromEntries(FILES.map(f => [f, readFileSync(join(dir, f), 'utf8')]));
    const changed = bump(dir, 'plugins', '7.0.0');
    assert.ok(changed.includes('plugins/corpus-codex/.codex-plugin/plugin.json'));
    assert.ok(!changed.includes('mcp-server/package.json'));
    const r = check(dir);
    assert.ok(r.ok, r.problems.join('\n'));
    assert.deepEqual(r.summary.plugins, ['7.0.0']);
    assert.notDeepEqual(r.summary['mcp-server'], ['7.0.0']);
    for (const f of changed) {
      const a = before[f].split('\n');
      const b = readFileSync(join(dir, f), 'utf8').split('\n');
      assert.equal(a.length, b.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.match(b[i], /"version": "7\.0\.0"/, `${f}:${i + 1}`);
    }
    bump(dir, 'mcp-server', '7.0.1');
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    assert.equal(lock.packages['mcp-server'].version, '7.0.1');
    assert.equal(lock.version, before['package-lock.json'] && JSON.parse(before['package-lock.json']).version);
    assert.match(readFileSync(join(dir, 'mcp-server/package.json'), 'utf8'), /\\u2014/, 'escapes survive');
  } finally { rmSync(dir, { recursive: true }); }
});

test('bump refuses a bad version or train', () => {
  assert.throws(() => bump('.', 'plugins', 'v1'), /x\.y\.z/);
  assert.throws(() => bump('.', 'root', '1.0.0'), /unknown train/);
});
