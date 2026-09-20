import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
