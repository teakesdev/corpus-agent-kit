# WORKLOG — Grok Bot integration

## 2026-09-10 (America/Chicago)

### Sources researched
- Hosted MCP: `https://corpuslaw.us/api/mcp`
- Repo: `teakesdev/corpus-agent-kit` (`plugins/corpus`, skills, README)
- Grok Bot surface: remote MCP connectors + plugins + bot templates (no catalog entry for Corpus; AddMcpServer URL works)

### Decisions
- **Path:** MCP-first + thin packaging (not a Corpus fork, not a native rewrite).
- **No `.cursor-plugin/`** unless Agent Plugins load fails — remote MCP URL is sufficient.
- Preserve Hermes / Claude / Codex install paths; Grok Bot is an additional target.
- GATE 2 stays sacred: handoff → human approval link only; no auto-file / no spend.

### Prove (Grok Bot live)
- Connected `user-corpus` → 8 tools.
- Dry-ran `formation.requirements` for MS LLC (live checklist; EIN add-on temporarily unavailable; ~$250 all-in).
- Dry-ran `formation.handoff` for Acme AI LLC (MS) → **COMPLETE** + prefill approval URL (placeholder demo fields; NAICS `541511`).

### Files changed (this PR)
- `docs/GROK_BOT.md` — install notes + optional bot template
- `plugins/corpus/README.md` — Cursor / Grok Bot compatibility + install
- `README.md` — point Grok Bot / Cursor at hosted MCP + docs
- `WORKLOG.md` — this log

### Commands / tests run
- Grok Bot: AddMcpServer `https://corpuslaw.us/api/mcp`
- MCP: `formation.requirements` `{entityType: llc, state: MS}`
- MCP: `formation.lookup_naics` (AI software)
- MCP: `formation.handoff` (Acme AI LLC demo draft → COMPLETE)

### Blockers
- None for the live MCP prove/demo path.
- Cloud Agents unavailable on plan; packaging done from local checkout `/Users/ty/dev/corpus-agent-kit`.

### Next action
- Reviewer: AC fit on this PR (approval gate intact, Hermes/Claude unbroken, install notes usable).
- Shipper: merge when green; Spec already has outreach pack for Sawyer / livestream.
