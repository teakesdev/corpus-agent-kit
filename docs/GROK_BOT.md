# Grok Bot / Cursor integration

Corpus Agent Kit connects to Grok Bot (and Cursor) over the **hosted MCP**
endpoint. No fork of Corpus is required: add the remote server, optionally
install the formation skill, and keep Hermes / Claude / Codex targets intact.

## Hosted MCP

```
https://corpuslaw.us/api/mcp
```

Streamable HTTP. Eight tools, including `formation.requirements`,
`formation.lookup_naics`, and `formation.handoff`. Formation tools are free
(no credit burn). Research is rate-limited anonymously; optional Bearer key
from https://corpuslaw.us/settings raises the quota.

## Install in Grok Bot (fastest path)

1. Add a remote MCP connector named `corpus` with URL
   `https://corpuslaw.us/api/mcp`.
2. Optional: attach `Authorization: Bearer <key>` for higher research limits.
   Do **not** put secrets in the repo or in a bot template.
3. Prompt: *Help me form an LLC for Acme AI in Mississippi.*

Verified dry-run (2026-09-10): `formation.requirements` for MS LLC returns the
live checklist and all-in pricing; `formation.handoff` returns **COMPLETE** and
a prefilled approval link. Agents never auto-file (GATE 2 human approval). USDC pay is email-confirmed; filing still needs human approval. Sept 15 demo stops at the handoff link — USDC pay is optional.

## Install skills (optional, richer intake)

Copy from this repo into your Grok Bot / Cursor skills library:

- [`skills/corpus-business-formation/`](../skills/corpus-business-formation/)
- [`skills/corpus-legal-research/`](../skills/corpus-legal-research/) (optional)

Same skill trees ship inside [`plugins/corpus/`](../plugins/corpus/) for
Hermes (Agent Plugins v1) and Claude Code (`.claude-plugin/`).

## Cursor / Grok Bot marketplace packaging

`plugins/corpus/` now includes `.cursor-plugin/plugin.json` (Cursor Plugin
manifest) alongside Agent Plugins `plugin.json` / `mcp.json` and Claude's
`.claude-plugin/`. Same hosted MCP + skills — no second Corpus surface.

Repo root: `.cursor-plugin/marketplace.json` (pluginRoot `plugins`).

**Publish:** Ty submits https://github.com/teakesdev/corpus-agent-kit at
https://cursor.com/marketplace/publish (manual review). Local test:
symlink `plugins/corpus` into `~/.cursor/plugins/local/corpus`, reload Cursor.

Optional `CORPUS_API_KEY` is declared but MCP stays headerless (no empty
Bearer). Formation intake remains free to start; GATE 2 (never auto-file) stays intact. Logo: `plugins/corpus/assets/logo.png`.

## Optional bot template

**Name:** Company Formation Bot — powered by Corpus

Template contents (no credentials):

- MCP URL: `https://corpuslaw.us/api/mcp`
- Pointer to `skills/corpus-business-formation/`
- Starter prompt: *Create an LLC for Acme AI in Mississippi.*
- Guardrail text: never auto-file; stop at the approval / handoff link; USDC pay is email-confirmed if used


## Demo punchline

> Grok Bot can help build the company — Corpus lets Grok Bot actually form the
> company (with you still in the loop).

See also the outreach pack notes in the SDLC workstream (demo script + Sawyer
paragraph) when preparing livestream assets.
