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
- GATE 2 stays sacred for **filing**: handoff → human approval; never auto-file. Spend: USDC may be email-confirmed (see later entry).

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

## 2026-09-10 (later) — Cursor marketplace packaging

### Decisions
- Add `.cursor-plugin/plugin.json` under `plugins/corpus/` + repo-root
  `.cursor-plugin/marketplace.json` for Cursor/Grok marketplace submit.
- Keep Hermes Agent Plugins `mcp.json` headerless; Cursor manifest inlines
  MCP URL headerless (optional CORPUS_API_KEY declared, not empty-Bearer-injected).
- No second MCP surface; never-auto-file language kept (spend copy updated later).

### Files
- `plugins/corpus/.cursor-plugin/plugin.json`
- `plugins/corpus/assets/logo.png` (copy of AgentkitLogo for path rules)
- `.cursor-plugin/marketplace.json`
- README / `docs/GROK_BOT.md` publish steps

### Next
- Ty submits repo at https://cursor.com/marketplace/publish after merge.

## 2026-09-10 — Reviewer fixes on PR #4
- Logo: commit `plugins/corpus/assets/logo.png`; marketplace + plugin manifest `logo: assets/logo.png`
- Bearer: drop `Authorization: Bearer ${CORPUS_API_KEY}` from Cursor manifest; discover headerless `mcp.json` so keyless works

## 2026-09-10 — Reviewer follow-up
- Restore headerless `mcpServers.url` in `.cursor-plugin/plugin.json` (no Authorization headers)

## 2026-09-10 — USDC / gate copy

### Spec AC
- Filing GATE 2 unchanged (never auto-file).
- Spend: USDC (Solana) email-confirmed; no extra human review of payment.
- Demo path unchanged; USDC pay not required for Sept 15.
- Ban “never spends”; no invented pay tool id.

### Files
- plugin + marketplace descriptions, README gates section, docs/GROK_BOT.md, plugin README gates note, WORKLOG
