# @corpuslaw/mcp-server

MCP server giving any AI agent **2.9 million+ provisions of US federal, state and
municipal law** with verbatim citations — plus a complete LLC / nonprofit
formation intake.

```bash
npx -y @corpuslaw/mcp-server
```

## Claude Desktop / Cursor / any MCP client

```json
{
  "mcpServers": {
    "corpus-law": {
      "command": "npx",
      "args": ["-y", "@corpuslaw/mcp-server"],
      "env": { "CORPUS_API_KEY": "your-key-here" }
    }
  }
}
```

`CORPUS_API_KEY` is optional but recommended — [free and instant](https://corpuslaw.us/settings).
Anonymous access gets 250 searches/month per IP; a free key gets 1,000/month at
30/min, and 5,000/month at 60/min once you form a company through Corpus. Call `account.status` for the live numbers.

> **If your client speaks HTTP MCP**, skip this package entirely and point it
> straight at `https://corpuslaw.us/api/mcp`. This bridge exists for stdio-only
> clients.

## Tools

The bridge forwards whatever the hosted server lists, so this follows the live contract:
`law.search` · `law.get_node` · `law.list_coverage` · `account.status` ·
`formation.requirements` · `formation.compare` · `formation.lookup_naics` ·
`formation.check_name` · `formation.handoff` · `formation.status`, plus
`formation.checkout` · `formation.payment_status` when agent checkout is enabled and
`formation.webhook` when signed webhooks are.

Formation tools are never metered. `formation.checkout` creates an order only after
explicit same-turn amount confirmation and consent, and returns a hosted Stripe link
by default, a USDC (Solana) pay request when the founder chooses it, or a prepaid
formation-pack redemption with the owner's formation-scoped key. The founder confirms
by email; filing remains human-reviewed unless the founder waives review on an
expedited filing.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CORPUS_API_KEY` | _(optional)_ | Raises rate limits; attributes formation handoffs to you |
| `CORPUS_BASE_URL` | `https://corpuslaw.us` | Point at your own deployment |

Apache-2.0 · [source](https://github.com/teakesdev/corpus-agent-kit) · [security policy](https://github.com/teakesdev/corpus-agent-kit/blob/main/SECURITY.md)
