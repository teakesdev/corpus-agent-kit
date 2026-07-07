import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAutopilot } from "./agent.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server.js → ../public/index.html
const INDEX_HTML = readFileSync(join(here, "..", "public", "index.html"), "utf8");

interface Deps {
  run?: typeof runAutopilot;
}

export function createServer(deps: Deps = {}): http.Server {
  const run = deps.run ?? runAutopilot;
  // Naive global budget guard: judges + demo traffic share ~$23 of credit.
  let windowStart = Date.now();
  let turnsThisWindow = 0;
  function underCap(): boolean {
    const cap = Number(process.env.SPEND_CAP_TURNS_PER_HOUR || 120);
    if (Date.now() - windowStart > 3_600_000) {
      windowStart = Date.now();
      turnsThisWindow = 0;
    }
    return ++turnsThisWindow <= cap;
  }
  return http.createServer(async (req, res) => {
    try {
      // The demo page may be hosted off-origin (FC's default fcapp.run domain
      // force-downloads text/html via an injected Content-Disposition header),
      // so the API must be callable cross-origin. Public read-only demo — "*".
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") {
        res
          .writeHead(204, {
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          })
          .end();
        return;
      }
      if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        return;
      }
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(INDEX_HTML);
        return;
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        if (!underCap()) {
          res.writeHead(429, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Hourly budget cap reached — try again later." }));
          return;
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        let body: any;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Body must be JSON." }));
          return;
        }
        const messages = Array.isArray(body?.messages) ? body.messages.slice(-20) : null;
        if (!messages || !messages.every((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "messages must be {role:'user'|'assistant', content:string}[]" }));
          return;
        }
        const result = await run(messages);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
        return;
      }
      res.writeHead(404).end();
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    }
  });
}

// Started directly (FC custom runtime / local dev), not under test.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const port = Number(process.env.PORT || 9000);
  createServer().listen(port, () => console.log(`Formation Autopilot listening on :${port}`));
}
