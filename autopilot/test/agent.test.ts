import { describe, it, expect, vi, afterEach } from "vitest";
import { runAutopilot } from "../src/agent.js";

function fakeCompletion(msg: any) {
  return { choices: [{ message: msg }] } as any;
}

afterEach(() => vi.unstubAllGlobals());

describe("runAutopilot", () => {
  it("dispatches a tool call then returns the final reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0", id: 1,
      result: { content: [{ type: "text", text: "§ 79-29-101 — Mississippi LLC Act…" }] },
    }))));
    const calls: string[] = [];
    const fakeChat = async (_lane: string, messages: any[]) => {
      const last = messages[messages.length - 1];
      if (last.role === "tool") {
        return fakeCompletion({ role: "assistant", content: "Here is your cited checklist." });
      }
      calls.push("first");
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t1", type: "function", function: { name: "search_law", arguments: JSON.stringify({ query: "llc fee", jurisdiction: "MS" }) } }],
      });
    };
    const res = await runAutopilot([{ role: "user", content: "I bake bread in Jackson MS" }], { chat: fakeChat as any });
    expect(res.reply).toContain("checklist");
    expect(res.toolCalls).toContain("search_law");
  });

  it("finalize_handoff routes through the critical lane and yields handoffUrl", async () => {
    const lanesUsed: string[] = [];
    const fakeChat = async (lane: string, messages: any[]) => {
      lanesUsed.push(lane);
      const last = messages[messages.length - 1];
      if (lane === "critical") {
        return fakeCompletion({ role: "assistant", content: JSON.stringify({ v: 1, entityType: "llc", jurisdiction: "US-MS", proposedName: "Magnolia Loaf LLC" }) });
      }
      if (last.role === "tool") return fakeCompletion({ role: "assistant", content: "All set — here's your handoff link." });
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t2", type: "function", function: { name: "finalize_handoff", arguments: JSON.stringify({ entityType: "llc", jurisdiction: "US-MS", proposedName: "Magnolia Loaf LLC" }) } }],
      });
    };
    const res = await runAutopilot([{ role: "user", content: "ready to file" }], { chat: fakeChat as any });
    expect(lanesUsed).toContain("critical");
    expect(res.handoffUrl).toMatch(/\/formation\?prefill=/);
  });

  it("critical-lane failure falls back to the fast lane with a reduced-confidence marker", async () => {
    const fakeChat = async (lane: string, messages: any[]) => {
      if (lane === "critical") throw new Error("model overloaded");
      const last = messages[messages.length - 1];
      if (last.role === "system" || String(last.content).startsWith("Candidate draft:")) {
        return fakeCompletion({ role: "assistant", content: JSON.stringify({ v: 1, entityType: "llc", jurisdiction: "US-MS" }) });
      }
      if (last.role === "tool") return fakeCompletion({ role: "assistant", content: String(last.content) });
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t3", type: "function", function: { name: "finalize_handoff", arguments: JSON.stringify({ entityType: "llc", jurisdiction: "US-MS" }) } }],
      });
    };
    const res = await runAutopilot([{ role: "user", content: "ready" }], { chat: fakeChat as any });
    expect(res.handoffUrl).toMatch(/\/formation\?prefill=/);
    expect(res.reply).toMatch(/fast lane/);
  });

  it("caps the loop at 8 turns", async () => {
    const fakeChat = async () =>
      fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "x", type: "function", function: { name: "lookup_naics", arguments: JSON.stringify({ description: "bread" }) } }],
      });
    const res = await runAutopilot([{ role: "user", content: "loop" }], { chat: fakeChat as any });
    expect(res.reply).toMatch(/taking longer than expected/i);
  });
});
