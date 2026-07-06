# corpus-agent-kit

Open-source connector kit for the Corpus legal platform (corpuslaw.us):

- **autopilot/** — Formation Autopilot: a Qwen Cloud agent that turns an ambiguous
  founder description into a cited launch checklist and a prefilled, human-approved
  formation handoff. (Qwen Hackathon Track 4 entry.)
- **mcp-server/** — zero-dependency stdio MCP server exposing Corpus law search
  to Claude Desktop, Cursor, and any MCP client.
- **widget/** — embeddable law-search widget.

All three are thin clients of the hosted Corpus platform. The law corpus,
search engine, human approval gate, and filing execution are the hosted service.

License: Apache-2.0
