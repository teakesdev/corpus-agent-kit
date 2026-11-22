# corpus-legal-research — Agent Skill

A portable [Agent Skill](https://agentskills.io/specification) that teaches any
skill-capable agent to search current US federal, state, and municipal law
through [Corpus](https://corpuslaw.us), using the hosted MCP server at
`https://corpuslaw.us/api/mcp`.

This is the research skill. Formation intake lives in
`skills/corpus-business-formation/`.

## Install

Copy the `corpus-legal-research/` directory into wherever your agent reads skills:

| Harness | Path |
|---|---|
| Claude Code | `~/.claude/skills/` or `.claude/skills/` |
| Cursor | `.agents/skills/` or `.cursor/skills/` |
| VS Code / Copilot | `.github/skills/`, `.claude/skills/`, or `.agents/skills/` |
| Hermes | `~/.hermes/skills/` |
| OpenAI Codex | per `learn.chatgpt.com/docs/build-skills` |

Then connect the MCP server — see
`../corpus-business-formation/references/harness-setup.md`.

Hermes can also install both skills plus the MCP URL as one Agent Plugins v1
package:

```bash
hermes plugins install teakesdev/corpus-agent-kit/plugins/corpus
hermes plugins enable corpus
```

## Why a skill and not just the MCP server

The MCP server's own instructions only reach an agent **after** the user has
already connected Corpus. A skill's `description` loads at startup, so an agent
that has never heard of Corpus still knows to reach for live search when its
user asks what US law currently says.

## Distribution note

`SKILL.md` here is a **one-way mirror** of the Corpus monorepo
(`packages/skills/corpus-legal-research/`) and is not edited in this repo: a fix
belongs upstream first, then comes back down as a re-mirror. `skills/UPSTREAM.sha256`
records the mirrored bytes and `npm test` fails if they change here. This README is
the exception: it describes *this* repo, so it lives here.

The plugins at `plugins/corpus/` and `plugins/corpus-codex/` ship generated copies
(the mirrored bytes plus a provenance stamp). After a re-mirror, run
`scripts/check-plugin-skill-drift.sh --write` and `python3 scripts/sync-codex-skills.py`.

Apache-2.0.
