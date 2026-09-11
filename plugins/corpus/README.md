# corpus

Agent Plugins v1 package for [Corpus](https://corpuslaw.us): live US legal
research and business-formation handoff.

The **content** (the two skills + the MCP URL) is vendor-neutral. Wrappers in
this directory:

- Agent Plugins v1 (`plugin.json` + `mcp.json`) — Hermes
- `.claude-plugin/plugin.json` — Claude Code
- `.cursor-plugin/plugin.json` — Cursor / Grok Bot marketplace

All three describe the same skills and the same hosted MCP URL; none generate
or own the content. Codex/ChatGPT use a fourth folder shape and reuse the same
URL.

The two wrappers spell the MCP transport differently on purpose: Agent Plugins
v1 uses `"type": "streamable-http"`, Claude Code uses `"type": "http"`. Same
endpoint.

Manifest `name` is `corpus`. Files under `skills/` are **generated copies** of
the canonical skill trees at the repo root (`SKILL.md` plus any
`references/`) — edit `skills/corpus-legal-research/` and
`skills/corpus-business-formation/` there, then run
`scripts/check-plugin-skill-drift.sh --write`.

## Compatibility

| Harness | Package installs directly | Same MCP URL + skill instructions |
|---|---|---|
| Hermes (Agent Plugins v1) | Yes | Yes |
| Claude Code (`.claude-plugin/`) | Yes | Yes |
| Grok Bot / Cursor | Yes (`.cursor-plugin/`) | Yes — marketplace package or add `https://corpuslaw.us/api/mcp` (see [docs/GROK_BOT.md](../../docs/GROK_BOT.md)) |
| Codex / ChatGPT | No (own layout: `.codex-plugin/` + `.mcp.json`) | Yes — `codex mcp add corpus --url https://corpuslaw.us/api/mcp` |
| Any MCP-capable harness | No | Yes — same Streamable HTTP URL |

A Codex folder-adapter is a later package, not this one. Cursor/Grok listing uses `.cursor-plugin/` in this directory.

## Install (Claude Code)

The repo root is a plugin marketplace:

```
/plugin marketplace add teakesdev/corpus-agent-kit
/plugin install corpus@corpus-agent-kit
```

Both skills are auto-discovered from `skills/`, and the `corpus` MCP server is
registered from `.claude-plugin/plugin.json`. No API key is required.

## Install (Cursor Marketplace / Grok Bot listing)

This package is also a **Cursor Plugin** via `.cursor-plugin/plugin.json`
(same skills + hosted MCP URL as Hermes/Claude). The repo root has
`.cursor-plugin/marketplace.json` so Cursor can discover `plugins/corpus`.

**Local test**

```bash
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)/plugins/corpus" ~/.cursor/plugins/local/corpus
# then: Cursor → Developer: Reload Window → Customize → confirm Corpus
```

**Publish (Ty's Cursor account — manual review)**

1. Confirm this branch is on a public GitHub repo (it is).
2. Submit the repository URL at https://cursor.com/marketplace/publish
3. Wait for Cursor's curated review (open-source required; updates re-reviewed).

Optional `CORPUS_API_KEY`: declared as a plugin variable (not stored in the
repo). Marketplace MCP stays **headerless** (same as Hermes) so an unset key
cannot expand to `Bearer ` and break anonymous use. Formation stays free;
set a key under Plugins → Configure / connector settings when you want higher
research quota.

## Install (Grok Bot / Cursor)

Add the hosted MCP as a remote connector (no clone required):

1. Connector name: `corpus`
2. URL: `https://corpuslaw.us/api/mcp`
3. Optional header: `Authorization: Bearer <key>` from https://corpuslaw.us/settings

Optional: copy `skills/corpus-business-formation/` (and
`skills/corpus-legal-research/`) from the repo root into the bot's skill
library for richer formation intake.

Full notes + optional **Company Formation Bot — powered by Corpus** template:
[docs/GROK_BOT.md](../../docs/GROK_BOT.md).

## Install (Hermes)

```bash
hermes plugins install teakesdev/corpus-agent-kit/plugins/corpus
hermes plugins enable corpus
hermes mcp test corpus
```

Portable packages install **disabled**. Enable is a separate consent step.

No secrets belong in `mcp.json`. Anonymous research works without a key.
For higher limits, add a header via `hermes mcp add --auth header` (not this
file). Get a free self-serve key at https://corpuslaw.us/settings, then paste
it when Hermes prompts for the API key / Bearer token:

```bash
hermes mcp add corpus --url "https://corpuslaw.us/api/mcp" --auth header
```

Hosted server: `https://corpuslaw.us/api/mcp` (Streamable HTTP).

## License

Apache-2.0 — same as the rest of [corpus-agent-kit](https://github.com/teakesdev/corpus-agent-kit).
This directory previously lived in a standalone MIT-licensed `corpus-hermes`
tree; the move into the kit adopts the kit license.
