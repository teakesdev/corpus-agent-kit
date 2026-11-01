import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// The real selectKnown runs against a fake Qwen client, so its `usage` handling is what is tested. No network.
const create = vi.hoisted(() => vi.fn());
vi.mock("../src/qwen.js", () => ({ getQwen: () => ({ chat: { completions: { create } } }), chat: vi.fn() }));

import { buildPlan, handoffPlan } from "../src/plan.js";
import { createServer } from "../src/server.js";
import { newMetrics, recordUsage, requestLogLine, type PlanMetrics } from "../src/request-log.js";
import type { PlanInput } from "../src/plan-contract.js";
import type { ToolCall } from "../src/plan-tools.js";
import hostedTranscripts from "./fixtures/autopilot-hosted-transcripts.json";

const PRIVATE_ACTIVITY = "PRIVATE_ACTIVITY_TOKEN custom lamps";
const PRIVATE_CITY = "PRIVATE_CITY_TOKEN";
const input: PlanInput = { mode: "ready", activity: PRIVATE_ACTIVITY, formationState: "MS", operatingState: "TX", operatingCity: PRIVATE_CITY, entityType: "llc", campaign: { utm_source: "PRIVATE_UTM" } };
const tool: ToolCall = async name => name === "formation.requirements" ? hostedTranscripts.requirements : name === "law.list_coverage" ? hostedTranscripts.coverage : "No results found.";

afterEach(() => { create.mockReset(); vi.unstubAllEnvs(); });

function useQwen() {
  vi.stubEnv("QWEN_API_KEY", "test-key");
  vi.stubEnv("QWEN_BASE_URL", "https://qwen.invalid/v1");
}
const ordering = (usage?: object) => ({ choices: [{ message: { content: '["entity","ein"]' } }], ...(usage ? { usage } : {}) });

describe("PlanMetrics", () => {
  it("counts every hosted call attempted, failed ones too, and the items and warnings returned", async () => {
    let seen: PlanMetrics | undefined;
    const flaky: ToolCall = async (name, args, signal) => {
      if (name === "law.search" && args.jurisdiction === "TX") throw new Error("upstream down");
      return tool(name, args, signal);
    };
    const plan = await buildPlan(input, { tool: flaky, onMetrics: m => { seen = m; } });
    // requirements, annual-report search (MS), business-tax search (TX, fails), coverage: 4 attempted.
    expect(seen!.toolCalls).toBe(4);
    expect(seen!.tools).toEqual(plan.tools);
    expect(seen!.tools).toContain("formation.requirements");
    expect(seen!.itemCount).toBe(plan.items.length);
    expect(seen!.warningCount).toBe(plan.warnings.length);
    expect(seen!.qwenCalls).toBe(0);
  });

  it("hands the live counters out before any work, so a request that is cut off can still be logged", async () => {
    const order: string[] = [];
    await buildPlan(input, { tool: (name, args, signal) => { order.push("tool"); return tool(name, args, signal); }, onMetrics: () => order.push("metrics") });
    expect(order[0]).toBe("metrics");
    expect(order).toContain("tool");
  });

  it("counts the handoff's single hosted call and no Qwen call", async () => {
    let seen: PlanMetrics | undefined;
    await handoffPlan(input, { tool: async () => hostedTranscripts.handoff, onMetrics: m => { seen = m; } });
    expect(seen).toMatchObject({ toolCalls: 1, qwenCalls: 0, totalTokens: 0 });
    expect(seen!.tools).toEqual(["formation.handoff"]);
  });
});

describe("Qwen usage", () => {
  it("records the tokens the provider reports for the ordering call", async () => {
    useQwen();
    create.mockResolvedValue(ordering({ prompt_tokens: 210, completion_tokens: 30, total_tokens: 240 }));
    let seen: PlanMetrics | undefined;
    const plan = await buildPlan(input, { tool, onMetrics: m => { seen = m; } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(seen).toMatchObject({ qwenCalls: 1, promptTokens: 210, completionTokens: 30, totalTokens: 240 });
    expect(plan.tools).toContain("qwen.order_known_items");
  });

  it("counts the attempt but no tokens when the provider returns no usage block", async () => {
    useQwen();
    create.mockResolvedValue(ordering());
    let seen: PlanMetrics | undefined;
    await buildPlan(input, { tool, onMetrics: m => { seen = m; } });
    expect(seen).toMatchObject({ qwenCalls: 1, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("counts the attempt when the call fails or times out, and the plan still returns", async () => {
    useQwen();
    create.mockRejectedValue(new Error("timeout"));
    let seen: PlanMetrics | undefined;
    const plan = await buildPlan(input, { tool, onMetrics: m => { seen = m; } });
    expect(seen).toMatchObject({ qwenCalls: 1, totalTokens: 0 });
    expect(plan.warnings.join(" ")).toContain("Qwen ordering was unavailable");
  });

  it("makes no Qwen call, and counts none, without a key", async () => {
    let seen: PlanMetrics | undefined;
    await buildPlan(input, { tool, onMetrics: m => { seen = m; } });
    expect(create).not.toHaveBeenCalled();
    expect(seen!.qwenCalls).toBe(0);
  });

  it("ignores usage that is not a non-negative number", () => {
    const m = newMetrics();
    recordUsage(m, { prompt_tokens: -5, completion_tokens: Number.NaN, total_tokens: "12" as unknown as number });
    recordUsage(m, undefined);
    recordUsage(m, { prompt_tokens: 10.4, completion_tokens: 2, total_tokens: 12 });
    expect(m).toMatchObject({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });
});

// The real request listener without sockets, as in server.test.ts.
function client(deps: Parameters<typeof createServer>[0] = {}) {
  const server = createServer(deps);
  function request(path: string, options: { method?: string; body?: string } = {}) {
    const req = new PassThrough() as PassThrough & { method: string; url: string; headers: Record<string, string>; complete: boolean };
    req.method = options.method ?? "POST"; req.url = path; req.headers = {}; req.complete = true;
    const res = new EventEmitter() as any;
    res.destroyed = false; res.writableFinished = false;
    res.setHeader = () => {};
    let status = 200;
    res.writeHead = (code: number) => { status = code; return res; };
    const response = new Promise<Response>(resolve => {
      res.end = (body = "") => { res.writableFinished = true; resolve(new Response(status === 204 ? null : body, { status })); queueMicrotask(() => res.emit("finish")); };
    });
    server.emit("request", req, res);
    req.end(options.body ?? "");
    return response;
  }
  return { request, post: (path: string, body: unknown) => request(path, { body: JSON.stringify(body) }) };
}

describe("the request log line", () => {
  function logged(deps: Parameters<typeof createServer>[0] = {}) {
    const lines: string[] = [];
    return { lines, ...client({ ...deps, log: line => lines.push(line) }) };
  }

  it("is written once per plan request, with choices, counts and tokens, and no typed text", async () => {
    useQwen();
    create.mockResolvedValue(ordering({ prompt_tokens: 210, completion_tokens: 30, total_tokens: 240 }));
    const c = logged({ plan: (raw, deps, signal) => buildPlan(raw, { ...deps, tool }, signal) });
    const res = await c.post("/api/plan", input);
    expect(res.status).toBe(200);
    expect(c.lines).toHaveLength(1);
    const line = JSON.parse(c.lines[0]!);
    expect(line).toMatchObject({
      event: "autopilot_request", route: "plan", status: 200, mode: "ready", entity: "llc", formation_state: "MS",
      qwen_calls: 1, qwen_prompt_tokens: 210, qwen_completion_tokens: 30, qwen_total_tokens: 240,
    });
    expect(line.tool_calls).toBeGreaterThanOrEqual(1);
    expect(line.tools).toContain("formation.requirements");
    expect(line.item_count).toBeGreaterThan(0);
    expect(typeof line.duration_ms).toBe("number");
    expect(c.lines[0]).not.toContain("\n");
    expect(c.lines[0]).not.toMatch(/PRIVATE_|custom lamps|"TX"|Austin/);
    expect(Object.keys(line).sort()).toEqual([
      "duration_ms", "entity", "event", "formation_state", "item_count", "mode", "qwen_calls", "qwen_completion_tokens",
      "qwen_prompt_tokens", "qwen_total_tokens", "route", "status", "tool_calls", "tools", "ts", "warning_count",
    ]);
  });

  it("names the handoff route and its one hosted call", async () => {
    const c = logged({ handoff: (raw, deps, signal) => handoffPlan(raw, { ...deps, tool: async () => hostedTranscripts.handoff }, signal) });
    expect((await c.post("/api/plan/handoff", input)).status).toBe(200);
    expect(JSON.parse(c.lines[0]!)).toMatchObject({ route: "handoff", status: 200, tool_calls: 1, qwen_calls: 0, tools: ["formation.handoff"] });
  });

  it("records a rejected input as its status, with no choices and no message", async () => {
    const c = logged();
    expect((await c.post("/api/plan", { ...input, extra: PRIVATE_ACTIVITY })).status).toBe(400);
    expect(JSON.parse(c.lines[0]!)).toMatchObject({ route: "plan", status: 400, mode: null, entity: null, formation_state: null, tool_calls: 0 });
    expect(c.lines[0]).not.toContain("PRIVATE_");
  });

  it("records a planner failure as 500 without the error text", async () => {
    const c = logged({ plan: async () => { throw new Error(`boom ${PRIVATE_ACTIVITY}`); } });
    expect((await c.post("/api/plan", input)).status).toBe(500);
    expect(JSON.parse(c.lines[0]!)).toMatchObject({ status: 500, mode: "ready", formation_state: "MS" });
    expect(c.lines[0]).not.toMatch(/boom|PRIVATE_/);
  });

  it("records the hourly cap as 429", async () => {
    vi.stubEnv("SPEND_CAP_TURNS_PER_HOUR", "1");
    const c = logged({ plan: async () => ({ ok: true }) as never });
    await c.post("/api/plan", input);
    expect((await c.post("/api/plan", input)).status).toBe(429);
    expect(c.lines.map(l => JSON.parse(l).status)).toEqual([200, 429]);
  });

  it("keeps the counters of a request that timed out", async () => {
    const hang: ToolCall = (name, args, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const c = logged({ requestTimeoutMs: 60, plan: (raw, deps, signal) => buildPlan(raw, { ...deps, tool: hang }, signal) });
    const res = await c.post("/api/plan", input);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.parse(c.lines[0]!)).toMatchObject({ tool_calls: 1, mode: "ready" });
  });

  it("logs nothing for health checks, the page or the legacy chat route", async () => {
    const c = logged({ run: async () => ({ reply: "hi", toolCalls: [] }) });
    await c.request("/healthz", { method: "GET" });
    await c.request("/api/plan", { method: "OPTIONS" });
    await c.post("/api/chat", { messages: [{ role: "user", content: "hello" }] });
    expect(c.lines).toEqual([]);
  });

  it("never lets a failing logger change the answer", async () => {
    const c = client({ plan: async () => ({ ok: true }) as never, log: () => { throw new Error("disk full"); } });
    expect((await c.post("/api/plan", input)).status).toBe(200);
  });

  it("writes to stdout by default", async () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await client({ plan: async () => ({ ok: true }) as never }).post("/api/plan", input);
      expect(out).toHaveBeenCalledTimes(1);
      expect(JSON.parse(out.mock.calls[0]![0] as string).event).toBe("autopilot_request");
    } finally { out.mockRestore(); }
  });
});

describe("requestLogLine", () => {
  it("defaults to zero counters and null choices", () => {
    expect(JSON.parse(requestLogLine({ route: "plan", status: 499, durationMs: -3 }))).toMatchObject({
      status: 499, duration_ms: 0, mode: null, tool_calls: 0, tools: [], qwen_total_tokens: 0,
    });
  });
});
