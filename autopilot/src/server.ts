import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAutopilot } from "./agent.js";
import { buildPlan, handoffPlan } from "./plan.js";
import { PlanError, validatePlanInput } from "./plan-validation.js";
import { bounded } from "./plan-tools.js";
import { requestLogLine, type PlanMetrics } from "./request-log.js";
import type { PlanInput } from "./plan-contract.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server.js → ../public/index.html
const INDEX_HTML = readFileSync(join(here, "..", "public", "index.html"), "utf8");

interface Deps {
  run?: typeof runAutopilot;
  plan?: typeof buildPlan;
  handoff?: typeof handoffPlan;
  bodyTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** One line per plan/handoff request. Defaults to stdout, which FC ships to its log store once `logConfig` is set. */
  log?: (line: string) => void;
  /** Most distinct clients the per-IP limiter remembers at once (default 10,000); the oldest window is dropped past it. */
  maxTrackedClients?: number;
}

export const MAX_PLAN_BODY_BYTES = 16384;
export const MAX_PLAN_RESPONSE_BYTES = 98304;
const BODY_TIMEOUT_MS = 5000;

const HOUR_MS = 3_600_000;
// Per-process budgets (FC may run several instances; each counts alone). Env overrides keep them tunable without a deploy of code.
const DEFAULT_GLOBAL_CAP = 600;
// Per-IP defaults are generous on purpose: one address is often a whole office, campus or carrier-grade NAT.
const DEFAULT_PLAN_PER_IP = 60;
const DEFAULT_HANDOFF_PER_IP = 120;
const DEFAULT_CHAT_PER_IP = 20;
const DEFAULT_MAX_TRACKED_CLIENTS = 10_000;

function capFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Who is calling. The function sits behind FC's HTTP gateway, so the socket's remote address is the gateway, not the
 * caller; the caller's address has to come from X-Forwarded-For, and we take its LAST entry.
 *
 * Why last: a live probe on 2026-11-07 showed FC passes the caller's OWN X-Forwarded-For through (30 requests sent with
 * XFF 198.51.100.77 drew a 429 on the 31st; a request with XFF 198.51.100.78 then got a 400, not a 429, so a made-up
 * header chose the bucket). Taking the first entry therefore lets a caller pick any bucket it likes. The gateway is
 * APPENDS the address it actually saw, so the last entry is the one the caller cannot forge. Probed after deploying
 * this: 61 requests from one host, each with a different made-up XFF, drew 60 × 400 then a 429 (2026-11-07), so a
 * forged header no longer picks the bucket; and on 2026-11-08 a host that had exhausted its /api/chat bucket kept
 * drawing 429s while a second host got a 400, so separate callers get separate buckets (per process; FC may run
 * several instances). If either probe ever flips, re-check this function first.
 * Without the header (local dev, tests) we fall back to the socket address. The address is held in memory for an hour
 * and never logged.
 */
export function clientIp(req: Pick<http.IncomingMessage, "headers" | "socket">): string {
  const header = req.headers["x-forwarded-for"];
  const entries = (Array.isArray(header) ? header.join(",") : header ?? "").split(",").map(e => e.trim()).filter(Boolean);
  const last = entries.at(-1)?.toLowerCase().replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");
  if (last && /^[0-9a-f:.]{2,45}$/.test(last)) return last;
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Hits per key in a fixed one-hour window. Memory is bounded: past `max` keys the oldest window is dropped, and
 * expired windows are always the oldest, because insertion order is window-start order (a key is re-inserted when its
 * window rolls over).
 */
class HourlyCounter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private max: number) {}
  /** Counts one hit; false once the key has used up `limit` hits in its current hour. */
  hit(key: string, limit: number, now = Date.now()): boolean {
    let w = this.windows.get(key);
    if (w && now - w.start > HOUR_MS) { this.windows.delete(key); w = undefined; }
    if (!w) {
      while (this.windows.size >= Math.max(1, this.max)) {
        const oldest = this.windows.entries().next().value as [string, { start: number }];
        this.windows.delete(oldest[0]);
      }
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    return ++w.count <= limit;
  }
}

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
    const cap = capFromEnv("SPEND_CAP_TURNS_PER_HOUR", DEFAULT_GLOBAL_CAP);
    if (Date.now() - windowStart > HOUR_MS) {
      windowStart = Date.now();
      turnsThisWindow = 0;
    }
    return ++turnsThisWindow <= cap;
  }
  // Per client, plan and handoff counted apart because their budgets differ. Checked BEFORE the global cap so that one
  // caller who is already over its own limit cannot spend the whole process's budget.
  const perClient = new HourlyCounter(deps.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS);
  function clientAllowed(route: "plan" | "handoff" | "chat", ip: string): boolean {
    const limit = route === "handoff" ? capFromEnv("HANDOFF_PER_IP_PER_HOUR", DEFAULT_HANDOFF_PER_IP)
      : route === "chat" ? capFromEnv("CHAT_PER_IP_PER_HOUR", DEFAULT_CHAT_PER_IP)
      : capFromEnv("PLAN_PER_IP_PER_HOUR", DEFAULT_PLAN_PER_IP);
    return perClient.hit(`${route}:${ip}`, limit);
  }
  return http.createServer(async (req, res) => {
    const isPlan = req.url === "/api/plan" || req.url === "/api/plan/handoff";
    const started = Date.now();
    // What the request log line reports. status stays 0 if the client went away before an answer was written.
    let logStatus = 0;
    let logInput: PlanInput | undefined;
    let metrics: PlanMetrics | undefined;
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
        if (!clientAllowed(req.url === "/api/plan/handoff" ? "handoff" : "plan", clientIp(req)) || !underCap()) {
          logStatus = 429;
          res.writeHead(429, { "Content-Type": "application/json", "Connection": "close" }).end(JSON.stringify({ error: "Hourly request cap reached — try again later." }));
          return;
        }
        const body = await readBody(req, MAX_PLAN_BODY_BYTES, Math.min(deps.bodyTimeoutMs ?? BODY_TIMEOUT_MS, BODY_TIMEOUT_MS), controller.signal);
        const input = validatePlanInput(body);
        logInput = input;
        const execute = req.url === "/api/plan/handoff" ? deps.handoff ?? handoffPlan : deps.plan ?? buildPlan;
        const result = await bounded<unknown>(s => execute(input, { onMetrics: m => { metrics = m; } }, s), controller.signal, Math.min(deps.requestTimeoutMs ?? 25000, 25000));
        const json = JSON.stringify(result);
        if (Buffer.byteLength(json) > MAX_PLAN_RESPONSE_BYTES) throw new PlanError(502, "Planning response is unavailable.");
        if (!res.destroyed) { logStatus = 200; res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(json); }
        return;
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        if (!clientAllowed("chat", clientIp(req)) || !underCap()) {
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
      logStatus = status;
      const error = isPlan ? (err instanceof PlanError ? err.message : "Planning request failed.") : String(err instanceof Error ? err.message : err);
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Connection": "close" }).end(JSON.stringify({ error }));
      // For a rejected/incomplete body, release the paused socket after sending the error.
      if (!req.complete) res.once("finish", () => req.destroy());
    } finally {
      req.off("aborted", disconnect);
      if (isPlan && req.method === "POST") {
        try {
          (deps.log ?? console.log)(requestLogLine({
            route: req.url === "/api/plan/handoff" ? "handoff" : "plan",
            status: logStatus || 499,
            durationMs: Date.now() - started,
            input: logInput, metrics,
          }));
        } catch { /* a log failure never changes the answer */ }
      }
    }
  });
}

// Started directly (FC custom runtime / local dev), not under test.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const port = Number(process.env.PORT || 9000);
  createServer().listen(port, () => console.log(`Formation Autopilot listening on :${port}`));
}
