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

  it("critical-lane review parses fenced JSON and uses reviewed draft over tool-call args", async () => {
    // Tool-call args use US-MS; the critical lane returns fenced JSON with US-WY.
    // The reviewed jurisdiction (US-WY) must win — proving the fence-stripped parse
    // path is used, not the silent fallback to raw args.
    const fakeChat = async (lane: string, messages: any[]) => {
      if (lane === "critical") {
        return fakeCompletion({
          role: "assistant",
          content: "```json\n{\"v\":1,\"entityType\":\"llc\",\"jurisdiction\":\"US-WY\",\"proposedName\":\"Fenced LLC\"}\n```",
        });
      }
      const last = messages[messages.length - 1];
      if (last.role === "tool") return fakeCompletion({ role: "assistant", content: "Handoff ready." });
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "t5",
          type: "function",
          function: {
            name: "finalize_handoff",
            arguments: JSON.stringify({ entityType: "llc", jurisdiction: "US-MS", proposedName: "Original LLC" }),
          },
        }],
      });
    };
    const res = await runAutopilot([{ role: "user", content: "file in Wyoming" }], { chat: fakeChat as any });
    expect(res.handoffUrl).toMatch(/\/formation\?prefill=/);
    const b64 = res.handoffUrl!.split("prefill=")[1];
    const prefill = JSON.parse(Buffer.from(b64, "base64url").toString());
    expect(prefill.jurisdiction).toBe("US-WY");
    expect(prefill.proposedName).toBe("Fenced LLC");
  });

  it("repeat-call guard: identical search_law call is not re-fetched and surfaces a dedupe message", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "§ 79-29-101 — Mississippi LLC Act…" }] },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const fakeChat = async (_lane: string, messages: any[]) => {
      const last = messages[messages.length - 1];
      // After the dedupe message, return a final text so the loop exits cleanly
      if (last.role === "tool" && String(last.content).includes("already made this exact call")) {
        return fakeCompletion({ role: "assistant", content: "Got it, using existing results." });
      }
      // After any ordinary tool result, re-issue the SAME search_law call (simulates a stuck loop)
      if (last.role === "tool") {
        return fakeCompletion({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "t2",
              type: "function",
              function: {
                name: "search_law",
                arguments: JSON.stringify({ query: "llc fee", jurisdiction: "MS" }),
              },
            },
          ],
        });
      }
      // First turn: issue a search_law call
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "t1",
            type: "function",
            function: {
              name: "search_law",
              arguments: JSON.stringify({ query: "llc fee", jurisdiction: "MS" }),
            },
          },
        ],
      });
    };

    const res = await runAutopilot(
      [{ role: "user", content: "I want to form an LLC in MS" }],
      { chat: fakeChat as any },
    );

    // The second identical call must NOT have invoked fetch (guard swallowed it)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The dedupe string must have been visible to the model (it drove the final reply)
    expect(res.reply).toContain("existing results");
  });

  it("returns the rendered checklist even when the model doesn't echo it", async () => {
    let n = 0;
    const fakeChat = async (_lane: string) => {
      n++;
      if (n === 1) {
        return fakeCompletion({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "c1",
            type: "function",
            function: {
              name: "format_checklist",
              arguments: JSON.stringify({ items: [{ task: "Register as a cottage food operation", citation: "Miss. Code § 75-29-951" }] }),
            },
          }],
        });
      }
      return fakeCompletion({ role: "assistant", content: "You've now received a fully cited checklist." });
    };
    const res = await runAutopilot([{ role: "user", content: "what does MS require?" }], { chat: fakeChat as any });
    expect(res.checklist).toContain("1. Register as a cottage food operation (Miss. Code § 75-29-951)");
  });

  it("drops a fabricated contactEmail the founder never typed; keeps one they did", async () => {
    const makeChat = (email: string) => async (lane: string, messages: any[]) => {
      if (lane === "critical") {
        return fakeCompletion({ role: "assistant", content: JSON.stringify({ v: 1, entityType: "llc", jurisdiction: "US-MS", contactEmail: email }) });
      }
      const last = messages[messages.length - 1];
      if (last.role === "tool") return fakeCompletion({ role: "assistant", content: "Handoff ready." });
      return fakeCompletion({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t9", type: "function", function: { name: "finalize_handoff", arguments: JSON.stringify({ entityType: "llc", jurisdiction: "US-MS", contactEmail: email }) } }],
      });
    };
    const decode = (url: string) => JSON.parse(Buffer.from(url.split("prefill=")[1], "base64url").toString());

    const fabricated = await runAutopilot([{ role: "user", content: "LLC in Mississippi please" }], { chat: makeChat("founder@example.com") as any });
    expect(decode(fabricated.handoffUrl!).contactEmail).toBeUndefined();

    const genuine = await runAutopilot([{ role: "user", content: "LLC in Mississippi — reach me at Ty@Bakery.com" }], { chat: makeChat("ty@bakery.com") as any });
    expect(decode(genuine.handoffUrl!).contactEmail).toBe("ty@bakery.com");
  });

  it("enforces the 3-search budget in code: 4th distinct search_law is not fetched", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "§ 75-29-951 — cottage food…" }] },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    let n = 0;
    let budgetMsgSeen = "";
    const fakeChat = async (_lane: string, messages: any[]) => {
      const last = messages[messages.length - 1];
      if (last.role === "tool" && /search budget/i.test(String(last.content))) budgetMsgSeen = String(last.content);
      n++;
      if (n <= 5) {
        return fakeCompletion({
          role: "assistant",
          content: null,
          tool_calls: [{ id: "s" + n, type: "function", function: { name: "search_law", arguments: JSON.stringify({ query: "distinct query " + n }) } }],
        });
      }
      return fakeCompletion({ role: "assistant", content: "Here is what the law requires." });
    };

    const res = await runAutopilot([{ role: "user", content: "I bake bread in Jackson MS" }], { chat: fakeChat as any });
    // Only the first 3 distinct searches hit the network; 4 and 5 got the budget message.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(budgetMsgSeen).toMatch(/finalize_handoff/);
    expect(res.reply).toContain("law requires");
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

describe("international founders prompt block", () => {
  it("bakes the no-SSN rule and key international facts into the system prompt", async () => {
    const { SYSTEM } = await import("../src/agent.js");
    // Deterministic context, not model weights: these facts must ride every conversation.
    expect(SYSTEM).toMatch(/no US citizenship\/residency is needed/);
    expect(SYSTEM).toMatch(/NEVER ask for, collect, or accept an SSN/);
    expect(SYSTEM).toMatch(/Form SS-4 by mail\/fax/);
    expect(SYSTEM).toMatch(/1361\(b\)\(1\)\(C\)/);
    expect(SYSTEM).toMatch(/registered agent/i);
    expect(SYSTEM).toMatch(/out of scope/);
  });
});
