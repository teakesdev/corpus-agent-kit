import test from "node:test";
import assert from "node:assert/strict";
import { handleMessage } from "../dist/bridge.js";

const deps = {
  forward: async (msg) => ({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "search_law" }] } }),
};

test("initialize answered locally with server info", async () => {
  const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, deps);
  assert.equal(res.result.serverInfo.name, "corpus-agent-kit");
  assert.ok(res.result.capabilities.tools);
});

test("notifications get no response", async () => {
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps), null);
});

test("tools/list and tools/call are forwarded to the hosted endpoint", async () => {
  const res = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps);
  assert.equal(res.result.tools[0].name, "search_law");
});

test("forward failure returns a JSON-RPC error, not a crash", async () => {
  const res = await handleMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_law", arguments: { query: "x" } } },
    { forward: async () => { throw new Error("network down"); } },
  );
  assert.equal(res.error.code, -32000);
  assert.match(res.error.message, /network down/);
});
