import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const root = 'plugins/corpus/';
const portable = read(root + 'plugin.json');
assert.equal(portable.name, 'corpus');
const mcp = read(root + 'mcp.json');
const url = 'https://corpuslaw.us/api/mcp';
assert.equal(mcp.mcpServers.corpus.url, url);
assert.equal(mcp.mcpServers.corpus.type, 'streamable-http');
for (const [folder, transport] of [['.claude-plugin', 'http'], ['.cursor-plugin', undefined]]) {
  const manifest = read(root + folder + '/plugin.json');
  assert.equal(manifest.name, portable.name);
  assert.equal(manifest.version, portable.version);
  assert.equal(manifest.mcpServers.corpus.url, url);
  assert.equal(manifest.mcpServers.corpus.type, transport);
  assert.equal(manifest.mcpServers.corpus.headers, undefined, 'anonymous install must be headerless');
  if (manifest.logo) assert.ok(existsSync(root + manifest.logo));
  const market = read(folder + '/marketplace.json');
  assert.ok(market.plugins.some(p => p.name === 'corpus'), 'marketplace must expose Corpus');
}
for (const name of ['corpus-business-formation', 'corpus-legal-research']) {
  assert.ok(existsSync(root + 'skills/' + name + '/SKILL.md'));
}
const openai = read(root + '.codex-plugin/plugin.json');
assert.equal(openai.name, portable.name);
assert.match(openai.version, /^\d+\.\d+\.\d+$/);
assert.equal(openai.skills, './skills/');
assert.equal(openai.mcpServers, './.mcp.json');
assert.deepEqual(read(root + '.mcp.json'), {
  mcpServers: { corpus: { type: 'http', url } },
}, 'OpenAI MCP must use HTTP and stay headerless');
assert.ok(existsSync(root + openai.interface.logo));
for (const [field, limit] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000], ['developerName', 80]]) {
  assert.equal(typeof openai.interface[field], 'string');
  assert.ok(openai.interface[field].trim() && openai.interface[field].length <= limit, `${field} exceeds submission limit`);
}
for (const field of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  const parsed = new URL(openai.interface[field]);
  assert.equal(parsed.protocol, 'https:');
  assert.ok(!parsed.username && !parsed.password, `${field} must not contain credentials`);
}
for (const field of ['logo', 'composerIcon']) {
  const path = openai.interface[field];
  assert.ok(path.startsWith('./') && !path.split('/').includes('..'), `${field} must stay inside the plugin`);
  const icon = readFileSync(resolve(root, path));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.subarray(12, 16).toString(), 'IHDR');
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), `${field} must be square`);
  assert.ok(icon.readUInt32BE(16) >= 48 && icon.readUInt32BE(16) <= 4096);
  assert.ok(icon.length <= 5 * 1024 * 1024);
}
const cases = openai.extensions['com.openai'].review.test_cases;
assert.equal(cases.positive.length, 5);
assert.equal(cases.negative.length, 3);
for (const prompt of openai.interface.defaultPrompt) assert.ok(prompt.length <= 128);
const openaiMarket = read('.agents/plugins/marketplace.json');
assert.equal(openaiMarket.name, 'corpus-agent-kit');
assert.deepEqual(openaiMarket.plugins, [{
  name: 'corpus',
  source: { source: 'local', path: './plugins/corpus' },
  policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  category: 'Productivity',
}]);
assert.ok(existsSync(root + 'skills/corpus-business-formation/references/intake.md'));
console.log('Plugin manifests, transports, marketplace entries, skills and assets agree.');
