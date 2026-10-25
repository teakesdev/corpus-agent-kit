import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAutopilot } from "./agent.js";
import { buildPlan, handoffPlan } from "./plan.js";
import { PlanError, validatePlanInput } from "./plan-validation.js";
import { bounded } from "./plan-tools.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server.js → ../public/index.html
const INDEX_HTML = readFileSync(join(here, "..", "public", "index.html"), "utf8");

interface Deps {
  run?: typeof runAutopilot;
  plan?: typeof buildPlan;
  handoff?: typeof handoffPlan;
  bodyTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export const MAX_PLAN_BODY_BYTES = 16384;
export const MAX_PLAN_RESPONSE_BYTES = 98304;
const BODY_TIMEOUT_MS = 5000;

/** Event-based reader stops buffering immediately on size, disconnect or deadline. */
function readBody(req: http.IncomingMessage, limit: number, timeoutMs: number, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", data); req.off("end", end); req.off("error", error);
      signal.removeEventListener("abort", abort);
    };
    const fail = (e: Error) => { cleanup(); req.pause(); reject(e); };
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) return fail(new PlanError(413, "Request body is too large."));
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new PlanError(400, "Body must be JSON.")); }
    };
    const error = () => fail(new PlanError(400, "Request body could not be read."));
    const abort = () => fail(new PlanError(408, "Request body timed out."));
    const timer = setTimeout(abort, timeoutMs);
    req.on("data", data); req.once("end", end); req.once("error", error);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    const length = req.headers["content-length"];
    if (length && Number(length) > limit) fail(new PlanError(413, "Request body is too large."));
  });
}

export function createServer(deps: Deps = {}): http.Server {
  const run = deps.run ?? runAutopilot;
  // Shared per-process request guard; this is not a global spending/dollar cap.
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
    const isPlan = req.url === "/api/plan" || req.url === "/api/plan/handoff";
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    req.once("aborted", disconnect);
    res.once("close", () => { if (!res.writableFinished) disconnect(); });
    try {
      // The demo page may be hosted off-origin (FC's default fcapp.run domain
      // force-downloads text/html via an injected Content-Disposition header),
      // so the API must be callable cross-origin. Public read-only demo — "*".
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (isPlan) res.setHeader("Cache-Control", "no-store");
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
      if (req.method === "POST" && isPlan) {
        if (!underCap()) {
          res.writeHead(429, { "Content-Type": "application/json", "Connection": "close" }).end(JSON.stringify({ error: "Hourly request cap reached — try again later." }));
          return;
        }
        const body = await readBody(req, MAX_PLAN_BODY_BYTES, Math.min(deps.bodyTimeoutMs ?? BODY_TIMEOUT_MS, BODY_TIMEOUT_MS), controller.signal);
        const input = validatePlanInput(body);
        const execute = req.url === "/api/plan/handoff" ? deps.handoff ?? handoffPlan : deps.plan ?? buildPlan;
        const result = await bounded<unknown>(s => execute(input, {}, s), controller.signal, Math.min(deps.requestTimeoutMs ?? 25000, 25000));
        const json = JSON.stringify(result);
        if (Buffer.byteLength(json) > MAX_PLAN_RESPONSE_BYTES) throw new PlanError(502, "Planning response is unavailable.");
        if (!res.destroyed) res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(json);
        return;
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        if (!underCap()) {
          res.writeHead(429, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Hourly budget cap reached — try again later." }));
          return;
        }
        let body: any;
        try {
          body = await readBody(req, 65536, BODY_TIMEOUT_MS, controller.signal);
        } catch (error) {
          if (error instanceof PlanError && error.status !== 400) throw error;
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
      if (res.destroyed) return;
      const status = err instanceof PlanError ? err.status : 500;
      const error = isPlan ? (err instanceof PlanError ? err.message : "Planning request failed.") : String(err instanceof Error ? err.message : err);
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Connection": "close" }).end(JSON.stringify({ error }));
      // For a rejected/incomplete body, release the paused socket after sending the error.
      if (!req.complete) res.once("finish", () => req.destroy());
    } finally {
      req.off("aborted", disconnect);
    }
  });
}

// Started directly (FC custom runtime / local dev), not under test.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const port = Number(process.env.PORT || 9000);
  createServer().listen(port, () => console.log(`Formation Autopilot listening on :${port}`));
}
