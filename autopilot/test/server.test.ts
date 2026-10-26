import { afterEach, describe, it, expect, vi } from "vitest";
import { createServer, MAX_PLAN_BODY_BYTES, MAX_PLAN_RESPONSE_BYTES } from "../src/server.js";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// Invoke the real request listener without opening sockets or making network calls.
function client(deps: Parameters<typeof createServer>[0] = {}) {
  const server = createServer(deps);
  function request(path: string, options: { method?: string; body?: string; incomplete?: boolean; contentLength?: number } = {}) {
    const req = new PassThrough() as PassThrough & { method: string; url: string; headers: Record<string, string>; complete: boolean };
    req.method = options.method ?? "POST"; req.url = path;
    req.headers = options.contentLength === undefined ? {} : { "content-length": String(options.contentLength) };
    req.complete = !options.incomplete;
    const res = new EventEmitter() as any;
    res.destroyed = false; res.writableFinished = false;
    const headers = new Headers();
    res.setHeader = (key: string, value: string) => headers.set(key, value);
    let status = 200;
    res.writeHead = (code: number, extra: Record<string, string> = {}) => {
      status = code; Object.entries(extra).forEach(([k, v]) => headers.set(k, v)); return res;
    };
    const response = new Promise<Response>(resolve => {
      res.end = (body = "") => {
        res.writableFinished = true;
        resolve(new Response(status === 204 ? null : body, { status, headers }));
        queueMicrotask(() => res.emit("finish"));
      };
    });
    server.emit("request", req, res);
    if (options.incomplete) { if (options.body) req.write(options.body); }
    else req.end(options.body ?? "");
    return { response, req, res };
  }
  const post = (path: string, body: unknown) => request(path, { body: JSON.stringify(body) }).response;
  return { request, post };
}
const messages = { messages: [{ role: "user", content: "hello" }] };
const input = { mode: "ready", activity: "Software", operatingState: "TX", operatingCity: "Austin", formationState: "MS", entityType: "llc", campaign: {} };
afterEach(() => vi.unstubAllEnvs());

describe("server (no network)", () => {
  it("healthz responds ok", async () => {
    expect(await (await client().request("/healthz", { method: "GET" }).response).text()).toBe("ok");
  });
  it("POST /api/chat runs the legacy agent", async () => {
    const res = await client({ run: async () => ({ reply: "hi", toolCalls: [] }) }).post("/api/chat", messages);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("hi");
  });
  it("answers CORS preflight and sets allow-origin", async () => {
    const c = client({ run: async () => ({ reply: "hi", toolCalls: [] }) });
    const pre = await c.request("/api/plan", { method: "OPTIONS" }).response;
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    expect(pre.headers.get("access-control-allow-headers")).toContain("Content-Type");
    expect((await c.post("/api/chat", messages)).headers.get("access-control-allow-origin")).toBe("*");
  });
  it.each(["/api/chat", "/api/plan"])("rejects malformed JSON on %s", async path => {
    expect((await client().request(path, { body: "not json" }).response).status).toBe(400);
  });
  it("preserves legacy error behavior", async () => {
    const res = await client({ run: async () => { throw "oops"; } }).post("/api/chat", messages);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("oops");
  });
  it("returns PlanResponse and PlanHandoff directly", async () => {
    const plan = { version: 1 as const, createdAt: "now", items: [], sources: [], pricing: { available: false, state: null, lines: [], checkedAt: "now" }, tools: [], warnings: [] };
    const handoff = { url: "https://corpuslaw.us/formation#prefill=test", missing: ["name"] };
    const c = client({ plan: async () => plan, handoff: async () => handoff });
    const res = await c.post("/api/plan", input);
    expect(await res.json()).toEqual(plan);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await (await c.post("/api/plan/handoff", input)).json()).toEqual(handoff);
  });
  it("rejects client source records before executing a plan", async () => {
    const plan = vi.fn();
    expect((await client({ plan }).post("/api/plan", { ...input, sources: [] })).status).toBe(400);
    expect(plan).not.toHaveBeenCalled();
  });
  it.each([false, true])("bounds body bytes (declared length=%s)", async declared => {
    const plan = vi.fn();
    const res = await client({ plan }).request("/api/plan", { body: "x".repeat(MAX_PLAN_BODY_BYTES + 1), ...(declared ? { contentLength: MAX_PLAN_BODY_BYTES + 1 } : {}) }).response;
    expect(res.status).toBe(413); expect(plan).not.toHaveBeenCalled();
  });
  it("bounds legacy body buffering", async () => {
    expect((await client().request("/api/chat", { body: "x".repeat(65537) }).response).status).toBe(413);
  });
  it("bounds serialized plan output", async () => {
    const plan = async () => ({ version: 1 as const, createdAt: "now", items: [], sources: [], pricing: { available: false, state: null, lines: [], checkedAt: "now" }, tools: [], warnings: ["x".repeat(MAX_PLAN_RESPONSE_BYTES)] });
    expect((await client({ plan }).post("/api/plan", input)).status).toBe(502);
  });
  it("times out a partial body", async () => {
    expect((await client({ bodyTimeoutMs: 5 }).request("/api/plan", { body: "{", incomplete: true }).response).status).toBe(408);
  });
  it("cancels timed-out handlers and hides diagnostics", async () => {
    let signal: AbortSignal | undefined;
    const res = await client({ requestTimeoutMs: 5, plan: async (_i, _d, s) => { signal = s; return new Promise(() => {}); } }).post("/api/plan", input);
    expect(res.status).toBe(504); expect(signal?.aborted).toBe(true);
    const failed = await client({ plan: async () => { throw new Error("private provider/key diagnostic"); } }).post("/api/plan", input);
    expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("private");
  });
  it("cancels downstream work when the client disconnects", async () => {
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const { response, res } = client({ plan: async (_i, _d, s) => { signal = s; started(); return new Promise(() => {}); } }).request("/api/plan", { body: JSON.stringify(input) });
    await ready; res.emit("close"); await response;
    expect(signal?.aborted).toBe(true);
  });
  it("shares the existing cap across chat, plan and handoff", async () => {
    vi.stubEnv("SPEND_CAP_TURNS_PER_HOUR", "1");
    const plan = vi.fn(); const handoff = vi.fn();
    const c = client({ run: async () => ({ reply: "x", toolCalls: [] }), plan, handoff });
    expect((await c.post("/api/chat", messages)).status).toBe(200);
    expect((await c.post("/api/plan", input)).status).toBe(429);
    expect((await c.post("/api/plan/handoff", input)).status).toBe(429);
    expect(plan).not.toHaveBeenCalled(); expect(handoff).not.toHaveBeenCalled();
  });
  it("does not consume the cap for health and OPTIONS", async () => {
    vi.stubEnv("SPEND_CAP_TURNS_PER_HOUR", "1");
    const c = client({ run: async () => ({ reply: "x", toolCalls: [] }) });
    await c.request("/healthz", { method: "GET" }).response;
    await c.request("/api/plan", { method: "OPTIONS" }).response;
    expect((await c.post("/api/chat", messages)).status).toBe(200);
  });
});
