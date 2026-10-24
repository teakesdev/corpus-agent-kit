# Corpus

Search current US federal, state and municipal law from official sources, with a verbatim
citation on every result, and prepare an LLC or nonprofit filing for a founder to review and
pay for.

## What it adds

- **Law research.** The `corpus-legal-research` skill has the assistant search Corpus before
  answering a question about what US law says (permits, zoning, licensing, compliance, filing
  requirements) and quote the returned citation. Corpus holds more than a million provisions;
  `law.list_coverage` reports which jurisdictions are searchable, and the assistant says so when
  one is not covered.
- **Company formation.** The `corpus-business-formation` skill runs an intake for an LLC (all 50
  states and DC) or a nonprofit corporation (48 states and DC; not New Hampshire or New York),
  checks the state's requirements and live price, and returns one prefilled link on corpuslaw.us.

## Install

Claude Code:

```
/plugin marketplace add teakesdev/corpus-agent-kit
/plugin install corpus@corpus-agent-kit
```

No account or API key is needed to start. Other harnesses (Hermes, Cursor, OpenAI Codex, Gemini
CLI, Qwen Code, Kimi Code): see [docs/INSTALL.md](../../docs/INSTALL.md).

## What it connects to

One hosted MCP server: `https://corpuslaw.us/api/mcp` (Streamable HTTP, no sign-in). The plugin
has no hooks, scripts, local servers or bundled executables, and it fetches no instructions from
the network.

When the MCP tools are not available, the formation skill falls back to plain HTTPS reads on
corpuslaw.us: live pricing (`/api/formation/pricing`), industry-code lookup (`/api/naics`), a
compliance lookup (`/api/formation/compliance/warm`) and provider comparison data
(`/api/v1/compare/llc-services`).

## What it sends

- Legal searches send the query text and jurisdiction to corpuslaw.us.
- A formation intake sends the founder's name, email, phone, address and business details to
  corpuslaw.us, through the MCP tools or the prefilled link the founder opens.
- It never asks for a Social Security Number. An optional EIN service is bought on corpuslaw.us
  only, never through the plugin.

## What it says on its own

Before the payment link, the formation skill has the assistant state what is charged today, what is
included, what recurs and what is optional. It then says one fixed reminder, once: if the founder is
comparing Corpus with a "$0 LLC" sponsored offer, check the recurring-service terms, with a link to a
documented checkout comparison that names one competitor
(https://corpuslaw.us/compare/legalzoom). That text is written by Corpus, not by the assistant.

## Limits

- Corpus provides legal information, not legal advice, and is not a law firm.
- The assistant never pays or files anything. Card checkout happens on corpuslaw.us. The optional
  USDC path creates an unpaid order and a payment request that the founder pays from their own wallet
  and then confirms by email. A person at Corpus reviews each filing before it reaches the state; a
  founder can waive that review only on an expedited filing, where that option is offered.
- Free to start: 250 searches a month without an account, 1,000 with a free key from
  corpuslaw.us/settings. Formation tools are always free.

Privacy: https://corpuslaw.us/privacy · Support: support@corpuslaw.us · License: Apache-2.0
