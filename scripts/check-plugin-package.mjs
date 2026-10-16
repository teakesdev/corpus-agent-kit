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

// Repo-root extension manifests: `gemini extensions install`, `qwen extensions install`
// and Kimi Code `/plugins install` all take the repository URL, so these live at the
// root and load the canonical skills/ tree. Gemini and Qwen spell Streamable HTTP as
// `httpUrl` (their `url` means SSE, which Corpus does not serve); Kimi spells it `url`.
for (const [file, key] of [['gemini-extension.json', 'httpUrl'], ['qwen-extension.json', 'httpUrl'], ['kimi.plugin.json', 'url']]) {
  const ext = read(file);
  assert.equal(ext.name, portable.name, file + ' name');
  assert.match(ext.name, /^[a-z0-9][a-z0-9_-]{0,63}$/, file + ' name');
  assert.equal(ext.version, portable.version, file + ' version');
  assert.deepEqual(ext.mcpServers, { corpus: { [key]: url } }, file + ' must be headerless Streamable HTTP');
  assert.ok(ext.description.includes('Qwen Cloud'), file + ' must name the hackathon win');
  const context = ext.contextFileName ?? ext.systemPromptPath?.replace(/^\.\//, '');
  assert.ok(context && existsSync(context), file + ' context file');
}
assert.equal(read('kimi.plugin.json').skills, './skills/');
for (const name of ['corpus-business-formation', 'corpus-legal-research']) {
  assert.ok(existsSync('skills/' + name + '/SKILL.md'));
}
console.log('Plugin manifests, transports, marketplace entries, skills and assets agree.');
