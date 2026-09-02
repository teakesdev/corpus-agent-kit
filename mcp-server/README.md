# @corpuslaw/mcp-server

MCP server giving any AI agent **571,582 provisions of US federal, state and
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
Anonymous access gets 100 searches/month per IP; a free key gets 1,000/month at
30/min.

> **If your client speaks HTTP MCP**, skip this package entirely and point it
> straight at `https://corpuslaw.us/api/mcp`. This bridge exists for stdio-only
> clients.

## Tools

`law.search` · `law.get_node` · `law.list_coverage` · `formation.requirements` ·
`formation.lookup_naics` · `formation.handoff` · `account.status`

Formation tools are never metered.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CORPUS_API_KEY` | _(optional)_ | Raises rate limits; attributes formation handoffs to you |
| `CORPUS_BASE_URL` | `https://corpuslaw.us` | Point at your own deployment |

Apache-2.0 · [source](https://github.com/teakesdev/corpus-agent-kit) · [security policy](https://github.com/teakesdev/corpus-agent-kit/blob/main/SECURITY.md)
