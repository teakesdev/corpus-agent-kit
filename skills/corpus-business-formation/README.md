# corpus-business-formation — Agent Skill

A portable [Agent Skill](https://agentskills.io/specification) that teaches any
skill-capable agent to form a US LLC or nonprofit through
[Corpus](https://corpuslaw.us), using the hosted MCP server at
`https://corpuslaw.us/api/mcp`.

## Install

Copy the `corpus-business-formation/` directory into wherever your agent reads skills:

| Harness | Path |
|---|---|
| Claude Code | `~/.claude/skills/` or `.claude/skills/` |
| Cursor | `.agents/skills/` or `.cursor/skills/` |
| VS Code / Copilot | `.github/skills/`, `.claude/skills/`, or `.agents/skills/` |
| Hermes | `~/.hermes/skills/` |
| OpenAI Codex | per `learn.chatgpt.com/docs/build-skills` |

Then connect the MCP server — see `references/harness-setup.md`.

## Why a skill and not just the MCP server

The MCP server's own instructions are excellent, but they only reach an agent **after** the
user has already connected Corpus. A skill's `description` loads at startup, so an agent
that has never heard of Corpus still knows to reach for it when its user says
"help me start a company."

The two compose: the skill gets the agent to connect; the server's instructions take over
from there.

## Distribution note

This is the upstream copy. Per the one-way mirror rule in
`strategy_docs/canonical/KIT_OPEN_SOURCE_STRATEGY.md` §1, changes are made here and
mirrored into the public `corpus-agent-kit` repo — never the reverse.

Apache-2.0.
