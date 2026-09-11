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
a prefilled approval link. Nothing files or charges until a human acts on that
link (GATE 2).

## Install skills (optional, richer intake)

Copy from this repo into your Grok Bot / Cursor skills library:

- [`skills/corpus-business-formation/`](../skills/corpus-business-formation/)
- [`skills/corpus-legal-research/`](../skills/corpus-legal-research/) (optional)

Same skill trees ship inside [`plugins/corpus/`](../plugins/corpus/) for
Hermes (Agent Plugins v1) and Claude Code (`.claude-plugin/`).

## Why there is no `.cursor-plugin/` yet

Grok Bot and Cursor already speak remote MCP connectors. Connecting the hosted
URL is enough for the livestream demo. A Cursor Agent Plugins adapter would
duplicate Hermes / Claude wrappers without unlocking a new capability — add it
only if marketplace / Agent Plugins load fails without a native manifest.

## Optional bot template

**Name:** Company Formation Bot — powered by Corpus

Template contents (no credentials):

- MCP URL: `https://corpuslaw.us/api/mcp`
- Pointer to `skills/corpus-business-formation/`
- Starter prompt: *Create an LLC for Acme AI in Mississippi.*
- Guardrail text: stop at the approval / handoff link; never file or spend
  automatically.

## Demo punchline

> Grok Bot can help build the company — Corpus lets Grok Bot actually form the
> company (with you still in the loop).

See also the outreach pack notes in the SDLC workstream (demo script + Sawyer
paragraph) when preparing livestream assets.
