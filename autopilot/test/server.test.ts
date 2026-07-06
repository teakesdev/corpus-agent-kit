import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import type { AddressInfo } from "node:net";

let server: ReturnType<typeof createServer> | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

function start(deps?: any) {
  server = createServer(deps);
  return new Promise<string>((resolve) => {
    server!.listen(0, () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
}

describe("server", () => {
  it("healthz responds ok", async () => {
    const base = await start();
    expect(await (await fetch(`${base}/healthz`)).text()).toBe("ok");
  });
  it("POST /api/chat runs the agent", async () => {
    const base = await start({ run: async () => ({ reply: "hi", toolCalls: [] }) });
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("hi");
  });
  it("rejects malformed bodies with 400", async () => {
    const base = await start({ run: async () => ({ reply: "x", toolCalls: [] }) });
    const res = await fetch(`${base}/api/chat`, { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });
  it("enforces the hourly spend cap with 429", async () => {
    process.env.SPEND_CAP_TURNS_PER_HOUR = "1";
    const base = await start({ run: async () => ({ reply: "x", toolCalls: [] }) });
    const post = () =>
      fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
    delete process.env.SPEND_CAP_TURNS_PER_HOUR;
  });
  it("preserves non-Error throw values in 500 error body", async () => {
    const base = await start({ run: async () => { throw "oops"; } });
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("oops");
  });
});
