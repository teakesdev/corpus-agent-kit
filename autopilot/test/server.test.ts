import { afterEach, describe, it, expect, vi } from "vitest";
import { clientIp, createServer, MAX_PLAN_BODY_BYTES, MAX_PLAN_RESPONSE_BYTES } from "../src/server.js";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// Invoke the real request listener without opening sockets or making network calls.
function client(deps: Parameters<typeof createServer>[0] = {}) {
  const server = createServer(deps);
  function request(path: string, options: { method?: string; body?: string; incomplete?: boolean; contentLength?: number; headers?: Record<string, string> } = {}) {
    const req = new PassThrough() as PassThrough & { method: string; url: string; headers: Record<string, string>; complete: boolean };
    req.method = options.method ?? "POST"; req.url = path;
    req.headers = { ...(options.contentLength === undefined ? {} : { "content-length": String(options.contentLength) }), ...options.headers };
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
  const post = (path: string, body: unknown, headers?: Record<string, string>) => request(path, { body: JSON.stringify(body), headers }).response;
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

describe("rate limits", () => {
  const plan = { version: 1 as const, createdAt: "now", items: [], sources: [], pricing: { available: false, state: null, lines: [], checkedAt: "now" }, tools: [], warnings: [] };
  const ok = async () => plan;
  const ip = (address: string) => ({ "x-forwarded-for": address });
  const capBody = { error: "Hourly request cap reached — try again later." };

  it("defaults to 60 plan requests per hour per IP, then 429 with the unchanged body", async () => {
    const c = client({ plan: ok });
    for (let i = 0; i < 60; i++) expect((await c.post("/api/plan", input, ip("203.0.113.7"))).status).toBe(200);
    const blocked = await c.post("/api/plan", input, ip("203.0.113.7"));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual(capBody);
    expect(blocked.headers.get("connection")).toBe("close");
    expect((await c.post("/api/plan", input, ip("203.0.113.8"))).status).toBe(200);
  });
  it("defaults to 120 handoff requests per hour per IP, counted apart from plan", async () => {
    const handoff = async () => ({ url: "https://corpuslaw.us/formation#prefill=t", missing: [] });
    const c = client({ plan: ok, handoff });
    for (let i = 0; i < 60; i++) await c.post("/api/plan", input, ip("203.0.113.7"));
    expect((await c.post("/api/plan", input, ip("203.0.113.7"))).status).toBe(429);
    for (let i = 0; i < 120; i++) expect((await c.post("/api/plan/handoff", input, ip("203.0.113.7"))).status).toBe(200);
    expect((await c.post("/api/plan/handoff", input, ip("203.0.113.7"))).status).toBe(429);
  });
  it("can be tuned by environment", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "2"); vi.stubEnv("HANDOFF_PER_IP_PER_HOUR", "1");
    const c = client({ plan: ok, handoff: async () => ({ url: "https://corpuslaw.us/formation#prefill=t", missing: [] }) });
    const statuses = [];
    for (const path of ["/api/plan", "/api/plan", "/api/plan", "/api/plan/handoff", "/api/plan/handoff"]) statuses.push((await c.post(path, input, ip("198.51.100.1"))).status);
    expect(statuses).toEqual([200, 200, 429, 200, 429]);
  });
  it("does not run the planner for a blocked caller", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1");
    const planner = vi.fn(ok);
    const c = client({ plan: planner });
    await c.post("/api/plan", input, ip("198.51.100.1"));
    await c.post("/api/plan", input, ip("198.51.100.1"));
    expect(planner).toHaveBeenCalledTimes(1);
  });
  it("keeps a blocked caller from spending the process-wide budget", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1"); vi.stubEnv("SPEND_CAP_TURNS_PER_HOUR", "3");
    const c = client({ plan: ok });
    expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(200); // global 1
    for (let i = 0; i < 20; i++) expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(429); // none counted
    expect((await c.post("/api/plan", input, ip("198.51.100.2"))).status).toBe(200); // global 2
    expect((await c.post("/api/plan", input, ip("198.51.100.3"))).status).toBe(200); // global 3
    const over = await c.post("/api/plan", input, ip("198.51.100.4"));
    expect(over.status).toBe(429); // global exhausted
    expect(await over.json()).toEqual(capBody);
  });
  it("uses a 600 per hour process-wide budget by default, shared with chat", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "100000");
    const c = client({ plan: ok, run: async () => ({ reply: "x", toolCalls: [] }) });
    for (let i = 0; i < 599; i++) expect((await c.post("/api/plan", input, ip(`10.1.${i >> 8}.${i & 255}`))).status).toBe(200);
    expect((await c.post("/api/chat", messages)).status).toBe(200); // 600th
    expect((await c.post("/api/plan", input, ip("10.9.9.9"))).status).toBe(429);
    expect((await c.post("/api/chat", messages)).status).toBe(429);
  });
  it("limits chat per IP too: 20 an hour by default, counted apart from plan, with chat's own 429 body", async () => {
    const c = client({ plan: ok, run: async () => ({ reply: "x", toolCalls: [] }) });
    for (let i = 0; i < 20; i++) expect((await c.post("/api/chat", messages, ip("203.0.113.7"))).status).toBe(200);
    const blocked = await c.post("/api/chat", messages, ip("203.0.113.7"));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Hourly budget cap reached — try again later." });
    expect((await c.post("/api/chat", messages, ip("203.0.113.8"))).status).toBe(200);
    expect((await c.post("/api/plan", input, ip("203.0.113.7"))).status).toBe(200); // plan has its own counter
  });
  it("tunes chat by CHAT_PER_IP_PER_HOUR and checks it before the process budget", async () => {
    vi.stubEnv("CHAT_PER_IP_PER_HOUR", "1"); vi.stubEnv("SPEND_CAP_TURNS_PER_HOUR", "2");
    const run = vi.fn(async () => ({ reply: "x", toolCalls: [] }));
    const c = client({ run });
    expect((await c.post("/api/chat", messages, ip("198.51.100.1"))).status).toBe(200); // global 1
    for (let i = 0; i < 10; i++) expect((await c.post("/api/chat", messages, ip("198.51.100.1"))).status).toBe(429); // none counted
    expect((await c.post("/api/chat", messages, ip("198.51.100.2"))).status).toBe(200); // global 2
    expect((await c.post("/api/chat", messages, ip("198.51.100.3"))).status).toBe(429); // global exhausted
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("does not apply any per-IP limit to health or OPTIONS", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1"); vi.stubEnv("CHAT_PER_IP_PER_HOUR", "1");
    const c = client({});
    for (let i = 0; i < 5; i++) {
      expect((await c.request("/healthz", { method: "GET", headers: ip("198.51.100.1") }).response).status).toBe(200);
      expect((await c.request("/api/plan", { method: "OPTIONS", headers: ip("198.51.100.1") }).response).status).toBe(204);
    }
  });
  it("buckets by the LAST X-Forwarded-For entry: forged first entries share the gateway's bucket", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1");
    const c = client({ plan: ok });
    expect((await c.post("/api/plan", input, ip("198.51.100.1, 203.0.113.9"))).status).toBe(200);
    // Different spoofed first entries, same entry appended by the gateway: one bucket.
    expect((await c.post("/api/plan", input, ip("198.51.100.2, 203.0.113.9"))).status).toBe(429);
    expect((await c.post("/api/plan", input, ip("6.6.6.6, 7.7.7.7, 203.0.113.9"))).status).toBe(429);
    expect((await c.post("/api/plan", input, ip("203.0.113.9"))).status).toBe(429);
    expect((await c.post("/api/plan", input, ip("203.0.113.9:5555"))).status).toBe(429);
    // A different gateway entry is a different caller, whatever the first entry says.
    expect((await c.post("/api/plan", input, ip("198.51.100.1, 203.0.113.10"))).status).toBe(200);
  });
  it("cannot be talked out of its bucket by thirty forged addresses", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "3");
    const c = client({ plan: ok });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await c.post("/api/plan", input, ip(`10.0.0.${i}, 203.0.113.50`))).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });
  it("forgets a caller after an hour", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1");
      const c = client({ plan: ok });
      expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(200);
      expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(429);
      vi.advanceTimersByTime(3_600_001);
      expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(200);
    } finally { vi.useRealTimers(); }
  });
  it("bounds its memory: past the tracked-client limit the oldest window is dropped", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1");
    const c = client({ plan: ok, maxTrackedClients: 2 });
    for (const address of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) expect((await c.post("/api/plan", input, ip(address))).status).toBe(200);
    // .1 was evicted by .3, so it starts a fresh window; .3 is still remembered.
    expect((await c.post("/api/plan", input, ip("198.51.100.3"))).status).toBe(429);
    expect((await c.post("/api/plan", input, ip("198.51.100.1"))).status).toBe(200);
  });
  it("reads the last entry, and falls back to the socket address, then to one shared bucket, when it is absent or junk", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.9" }, socket: { remoteAddress: "192.0.2.5" } as never })).toBe("10.0.0.9");
    expect(clientIp({ headers: { "x-forwarded-for": "203.0.113.9" }, socket: {} as never })).toBe("203.0.113.9");
    expect(clientIp({ headers: { "x-forwarded-for": "a, b, 203.0.113.9 " }, socket: {} as never })).toBe("203.0.113.9");
    expect(clientIp({ headers: { "x-forwarded-for": "203.0.113.9, " }, socket: {} as never })).toBe("203.0.113.9");
    expect(clientIp({ headers: {}, socket: { remoteAddress: "192.0.2.5" } as never })).toBe("192.0.2.5");
    expect(clientIp({ headers: { "x-forwarded-for": "198.51.100.1, not an ip" }, socket: { remoteAddress: "192.0.2.5" } as never })).toBe("192.0.2.5");
    expect(clientIp({ headers: { "x-forwarded-for": "" }, socket: { remoteAddress: "192.0.2.5" } as never })).toBe("192.0.2.5");
    expect(clientIp({ headers: {}, socket: undefined as never })).toBe("unknown");
    expect(clientIp({ headers: { "x-forwarded-for": "10.0.0.1, 2001:DB8::1" }, socket: {} as never })).toBe("2001:db8::1");
    expect(clientIp({ headers: { "x-forwarded-for": ["1.1.1.1, 10.0.0.1", "203.0.113.9"] }, socket: {} as never })).toBe("203.0.113.9");
  });
  it("logs a per-IP refusal as 429 without the address", async () => {
    vi.stubEnv("PLAN_PER_IP_PER_HOUR", "1");
    const lines: string[] = [];
    const c = client({ plan: ok, log: l => lines.push(l) });
    await c.post("/api/plan", input, ip("198.51.100.77"));
    await c.post("/api/plan", input, ip("198.51.100.77"));
    expect(lines.map(l => JSON.parse(l).status)).toEqual([200, 429]);
    expect(lines.join("")).not.toContain("198.51.100.77");
  });
});
