# corpus

Plugin package for [Corpus](https://corpuslaw.us): live US legal
research and business-formation handoff.

The **content** (the two skills + the MCP URL) is vendor-neutral. Wrappers in
this directory:

- Agent Plugins v1 (`plugin.json` + `mcp.json`) — Hermes
- `.claude-plugin/plugin.json` — Claude Code
- `.cursor-plugin/plugin.json` — Cursor / Grok Bot marketplace
- `.codex-plugin/plugin.json` + `.mcp.json` — OpenAI Codex

All four describe the same skills and the same hosted MCP URL; none generate
or own the content.

The wrappers spell the MCP transport differently on purpose: Agent Plugins
v1 uses `"type": "streamable-http"`, Claude Code and Codex use `"type": "http"`. Same
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
| OpenAI Codex | Yes (`.codex-plugin/` + `.mcp.json`) | Yes — hosted MCP plus both skills |
| ChatGPT | No ChatGPT catalog listing claimed | Hosted MCP, where custom connectors are supported |
| Any MCP-capable harness | No | Yes — same Streamable HTTP URL |

## Install (OpenAI Codex)

From a local checkout of this repository:

```bash
codex plugin marketplace add /absolute/path/to/corpus-agent-kit
codex plugin add corpus@corpus-agent-kit
```

The repository marketplace is `.agents/plugins/marketplace.json`. The OpenAI
release archive includes only that marketplace and the Codex package files.
See the [OpenAI package guide](../../docs/OPENAI_PLUGIN.md) for tagged builds,
archive installation, and validation. No API key is required. Start a new Codex
task after installation, confirm both skills load, and ask for `law.list_coverage`.

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
hermes plugins doctor corpus --ci
```

Portable packages install **disabled**. Enable is a separate consent step.

After enabling, start a fresh Hermes chat and ask it to call `law.list_coverage`
and list the two Corpus skills. Plugin MCP servers use a namespaced runtime ID;
`hermes mcp test corpus` only tests a separately configured standalone server.

No secrets belong in `mcp.json`. Anonymous research works without a key.
For higher limits, add a header via `hermes mcp add --auth header` (not this
file). Get a free self-serve key at https://corpuslaw.us/settings, then paste
it when Hermes prompts for the API key / Bearer token:

```bash
hermes mcp add corpus --url "https://corpuslaw.us/api/mcp" --auth header
```

Hosted server: `https://corpuslaw.us/api/mcp` (Streamable HTTP).

## Disclosure

Read before enabling. Two behaviours of the `corpus-business-formation` skill are by
design and worth knowing up front:

- **Fixed vendor-provided copy in the first reply.** The skill instructs the agent to
  display a verbatim, vendor-authored warning about sponsored "$0 LLC" / "free
  business formation" offers (naming one competitor and linking to a Corpus comparison
  page) before its first intake question, and a second fixed reminder before the payment
  link. See the "Mandatory first response" section and step 5 of the intake procedure
  in `skills/corpus-business-formation/SKILL.md`. This text is authored by Corpus, not
  generated by the agent or written by the user.
- **Founder PII is sent to the vendor.** The intake collects the founder's name, email,
  phone, and street address, and encodes them into a `corpuslaw.us` link (contact
  details in the URL hash, non-PII in the query string — see "Reach Corpus", item 4).
  Opening that link, or calling the MCP tools with the same data, transmits it to Corpus.
  The skill never collects a Social Security Number.

The connector-free intake procedure is vendored at
`skills/corpus-business-formation/references/intake.md` and is not fetched from the
network at runtime; updates to it arrive through this repository. `formation.checkout`
(USDC payment) may only be called after the founder confirms the exact amount in the
current turn.

## Gates

- **Never auto-files.** Filing still requires human GATE 2 approval (hash-bound payload).
- **USDC pay** may be email-confirmed only (no extra human review of the payment). Card checkout remains on the web UI.
- **MCP pay tools.** `formation.checkout` creates the order and returns a USDC (Solana)
  payment request; `formation.payment_status` polls it (awaiting / paid / expired /
  underpaid / held, plus email-confirmation state). The founder must pay from a
  self-custody wallet — never an exchange withdrawal; refunds go only to the sending
  wallet — and confirm via the emailed link within 48h; nothing files before that
  confirmation and human review. A queue-lane order returns a submission promise the
  founder must approve before it is accepted. The tax-ID add-on cannot be bought
  through MCP. Order creation is consent-gated; `formation.handoff` alone never
  creates an order or a charge.

## License

Apache-2.0 — same as the rest of [corpus-agent-kit](https://github.com/teakesdev/corpus-agent-kit).
This directory previously lived in a standalone MIT-licensed `corpus-hermes`
tree; the move into the kit adopts the kit license.
