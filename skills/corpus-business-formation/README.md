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

Hermes can also install this skill plus `corpus-legal-research` and the MCP URL
as one Agent Plugins v1 package:

```bash
hermes plugins install teakesdev/corpus-agent-kit/plugins/corpus
hermes plugins enable corpus
```

## Distribution note

This is the canonical copy. The Hermes plugin at `plugins/corpus/` ships a
generated copy of this skill; edit here, then run
`scripts/check-plugin-skill-drift.sh --write`.

Apache-2.0.
