# corpus

Agent Plugins v1 package for [Corpus](https://corpuslaw.us): live US legal
research and business-formation handoff.

The **content** (the two skills + the MCP URL) is vendor-neutral. The **package
wrapper** is Agent Plugins v1 (`plugin.json` + `mcp.json` in this directory),
which installs directly in Hermes. A second wrapper for the same content lives
in `.claude-plugin/plugin.json`, so Claude Code installs it too — both
manifests describe the same skills and the same MCP URL, and neither one
generates or owns the content. Codex/ChatGPT use a third folder shape; they
reuse the same URL.

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
| Codex / ChatGPT | No (own layout: `.codex-plugin/` + `.mcp.json`) | Yes — `codex mcp add corpus --url https://corpuslaw.us/api/mcp` |
| Any MCP-capable harness | No | Yes — same Streamable HTTP URL |

A Codex folder-adapter is a later package, not this one.

## Install (Claude Code)

The repo root is a plugin marketplace:

```
/plugin marketplace add teakesdev/corpus-agent-kit
/plugin install corpus@corpus-agent-kit
```

Both skills are auto-discovered from `skills/`, and the `corpus` MCP server is
registered from `.claude-plugin/plugin.json`. No API key is required.

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
