# corpus

Agent Plugins v1 package for [Corpus](https://corpuslaw.us): live US legal
research and business-formation handoff.

The **content** (the two skills + the MCP URL) is vendor-neutral. The **package
wrapper** is Agent Plugins v1 (`plugin.json` + `mcp.json` in this directory).
That layout installs directly in Hermes today. Codex/ChatGPT use a different
folder shape; they reuse the same URL.

Manifest `name` is `corpus`. Skills in `skills/` are **generated copies** of the
canonical files at the repo root — edit `skills/corpus-legal-research/` and
`skills/corpus-business-formation/` there, then run
`scripts/check-plugin-skill-drift.sh --write`.

## Compatibility

| Harness | Package installs directly | Same MCP URL + skill instructions |
|---|---|---|
| Hermes (Agent Plugins v1) | Yes | Yes |
| Codex / ChatGPT | No (own layout: `.codex-plugin/` + `.mcp.json`) | Yes — `codex mcp add corpus --url https://corpuslaw.us/api/mcp` |
| Any MCP-capable harness | No | Yes — same Streamable HTTP URL |

A Codex folder-adapter is a later package, not this one.

## Install (Hermes)

```bash
hermes plugins install teakesdev/corpus-agent-kit/plugins/corpus
hermes plugins enable corpus
hermes mcp test corpus
```

Portable packages install **disabled**. Enable is a separate consent step.

No secrets belong in `mcp.json`. Anonymous research works without a key.
For higher limits, add a header via `hermes mcp add` (not this file):

```bash
# free self-serve key — https://corpuslaw.us/settings
hermes mcp add corpus --url "https://corpuslaw.us/api/mcp"
```

Hosted server: `https://corpuslaw.us/api/mcp` (Streamable HTTP).

## License

Apache-2.0 — same as the rest of [corpus-agent-kit](https://github.com/teakesdev/corpus-agent-kit).
This directory previously lived in a standalone MIT-licensed `corpus-hermes`
tree; the move into the kit adopts the kit license.
