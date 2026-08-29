# Contributing

Thanks for looking. This kit is Apache-2.0 and contributions are welcome.

## Before you start

Open an issue first for anything beyond a bug fix or docs change. Some parts of
this repo are **one-way mirrors** of the upstream Corpus monorepo and cannot
accept changes here:

| Path | Status |
|---|---|
| `autopilot/`, `mcp-server/`, `widget/` | Open to contributions |
| `autopilot/src/tools/naics-data.ts` | Mirrored from upstream — file an issue instead |
| `skills/corpus-business-formation/` | Mirrored from upstream — file an issue instead |

## Development

```bash
npm install
npm run build                       # all workspaces
cd autopilot && npx vitest run      # 39 tests
cd mcp-server && npm test           # 6 tests
```

Requires Node >= 20. Both suites must be green, and `npx tsc --noEmit` clean,
before a PR is reviewed.

## Ground rules

- **Never collect an SSN.** See [SECURITY.md](SECURITY.md).
- **Keep founder PII on the URL fragment**, never a query string.
- **Attribution must never block a handoff.** Every failure path in
  `resolveHandoffUrl` falls back to the local link on purpose — keep it that way.
- **Cited claims only.** This kit surfaces statutory text with verbatim
  citations. Do not add code that paraphrases law as fact without a citation,
  and do not add anything that gives legal advice.

## Testing against the hosted platform

The kit talks to `https://corpuslaw.us`. A [free API key](https://corpuslaw.us/settings)
is instant and self-serve; anonymous access works too at a lower rate limit.
Point `CORPUS_BASE_URL` elsewhere to test against your own deployment.
