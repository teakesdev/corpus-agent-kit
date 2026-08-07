# corpus-agent-kit

**Live demo:** [corpuslaw.us/autopilot](https://corpuslaw.us/autopilot) — the Formation
Autopilot chat, backed by this repo's agent running on **Alibaba Cloud Function Compute**
(`us-west-1`, config in [`autopilot/deploy/alibaba/s.yaml`](autopilot/deploy/alibaba/s.yaml)).
API health: `curl https://formatiutopilot-bfmjghskwt.us-west-1.fcapp.run/healthz` → `ok`.
(The raw `fcapp.run` URL force-downloads HTML on FC's default domain — use the hosted page in a browser.)

Open-source connector kit for the [Corpus legal platform](https://corpuslaw.us).

**Hosted MCP server (no local install):** [`https://corpuslaw.us/api/mcp`](https://corpuslaw.us/api/mcp) — also listed on [Smithery as corpus-legal](https://smithery.ai/servers/renaissanceaisolutions/corpus-legal).

[![smithery badge](https://smithery.ai/badge/renaissanceaisolutions/corpus-legal)](https://smithery.ai/servers/renaissanceaisolutions/corpus-legal)

Packages in this repo:

- **autopilot/** — Formation Autopilot: a Qwen Cloud agent that turns an ambiguous
  founder description into a cited launch checklist and a prefilled, human-approved
  formation handoff. (Qwen Hackathon Track 4 entry.)
- **mcp-server/** — zero-dependency stdio MCP server exposing Corpus law search
  to Claude Desktop, Cursor, and any MCP client.
- **widget/** — embeddable law-search widget (Preact, ~12 kB gzipped).

All three are thin clients of the hosted Corpus platform. The law corpus,
hybrid search engine, human approval gate, and filing execution live in the
hosted service — this repo never touches money or files anything.

## Architecture

[![Architecture diagram](docs/architecture.png)](docs/architecture.md)

See [docs/architecture.md](docs/architecture.md) for the Mermaid source.

## What's open vs. what's hosted

| Layer | This repo (Apache-2.0) | Hosted Corpus platform (closed) |
|---|---|---|
| Formation Autopilot agent | ✅ `autopilot/` | — |
| Two-lane Qwen routing | ✅ `autopilot/src/` | — |
| MCP stdio bridge (`corpus-mcp`) | ✅ `mcp-server/` | — |
| Embeddable widget | ✅ `widget/` | — |
| Law database (~186 K nodes, Aurora) | — | ✅ |
| Hybrid search engine + `/api/mcp` | — | ✅ |
| `/formation` checkout + GATE 2 | — | ✅ |
| Stripe payment + state filing execution | — | ✅ |

## Two-lane model routing

The autopilot uses two Qwen models with different cost/quality profiles:

- **Fast lane** (`QWEN_MODEL_FAST`, default `qwen-flash`): all standard turns —
  intent parsing, law search, checklist generation. Low latency, low spend.
- **Critical lane** (`QWEN_MODEL_CRITICAL`, default `qwen3.7-max`): the final
  pre-handoff draft review only. Higher quality for the one turn that shapes the
  prefilled filing URL.

The lane switch is automatic. Routing logic lives in `autopilot/src/agent.ts`.
The hourly spend cap (`SPEND_CAP_TURNS_PER_HOUR`) applies across both lanes.

## Human in the loop (GATE 2)

The autopilot produces a **prefilled draft URL** — it never initiates a filing or
charges a card. On the Corpus platform side, every order passes GATE 2: a human
reviews and approves a snapshot of the exact filing payload, and that approval is
cryptographically bound to a hash of the payload. If the payload changes by a
single byte after approval, the gate rejects it. The agent is architecturally
incapable of bypassing this.

## Quickstart

### Prerequisites

```
node >=20
npm >=9
```

Clone and install all workspaces:

```bash
git clone https://github.com/teakesdev/corpus-agent-kit.git
cd corpus-agent-kit
npm install
```

### Environment variables

Copy and fill `.env.example` (required for autopilot; mcp-server and widget
read `CORPUS_BASE_URL` / `CORPUS_API_KEY` from env at runtime):

```bash
cp .env.example .env
# edit .env — at minimum set QWEN_API_KEY and CORPUS_API_KEY
```

| Variable | Default | Purpose |
|---|---|---|
| `QWEN_API_KEY` | _(required)_ | Qwen Cloud API key |
| `QWEN_BASE_URL` | _(required)_ | Qwen OpenAI-compatible base URL (e.g. `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`) |
| `QWEN_MODEL_FAST` | `qwen-flash` | Fast-lane model — standard turns |
| `QWEN_MODEL_CRITICAL` | `qwen3.7-max` | Critical-lane model — pre-handoff review |
| `CORPUS_BASE_URL` | `https://corpuslaw.us` | Hosted Corpus platform base URL |
| `CORPUS_API_KEY` | _(optional)_ | Corpus platform API key (optional — anonymous is rate-limited) |
| `SPEND_CAP_TURNS_PER_HOUR` | `120` | Abuse guard: max agent turns per hour |
| `PORT` | `9000` | HTTP server port (autopilot backend) |

### autopilot — Formation Autopilot agent

```bash
cp .env.example .env        # fill QWEN_API_KEY + CORPUS_API_KEY
npm install
npm run build               # compiles all workspaces
cd autopilot && npm start   # starts the autopilot HTTP server
# open http://localhost:9000
```

The server exposes:

- `GET  /healthz` — liveness probe
- `POST /api/chat` — agent turn endpoint
- `GET  /` — chat UI

Deploy to Alibaba Cloud Function Compute: see
[autopilot/deploy/alibaba/README.md](autopilot/deploy/alibaba/README.md).

### mcp-server — stdio MCP bridge

Build locally:

```bash
cd mcp-server && npm install && npm run build
```

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "corpus-law": {
      "command": "node",
      "args": ["/absolute/path/to/corpus-agent-kit/mcp-server/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/corpus-agent-kit` with the actual path to your clone.

> **Note:** The package name `@corpus-agent-kit/mcp-server` is reserved for a future npm publish; until then, build locally and point your MCP client at `mcp-server/dist/index.js`. **HTTP MCP clients:** the hosted endpoint `https://corpuslaw.us/api/mcp` supports the streamable-HTTP MCP transport directly — no local bridge needed.

This exposes three tools: `search_law`, `get_law_node`, `list_coverage`.

### widget — embeddable law-search

```bash
cd widget
npm run build               # outputs dist/widget.js (loader) and dist/widget-app.js (app)
```

Embed in any page using the hosted loader. Point `src` at the Corpus host (a relative
path would 404 on the host page's own origin) and pass your widget key (`pk_…`):

```html
<script async src="https://corpuslaw.us/widget/widget.js"
        data-corpus-key="pk_live_…"
        data-corpus-origin="https://corpuslaw.us"></script>
```

## Deploy to Alibaba Cloud

See [autopilot/deploy/alibaba/README.md](autopilot/deploy/alibaba/README.md) for
Function Compute deploy instructions (Serverless Devs `s` CLI).

## License

Apache-2.0 — see [LICENSE](LICENSE).
