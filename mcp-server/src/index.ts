#!/usr/bin/env node
/** MCP stdio transport: newline-delimited JSON-RPC on stdin/stdout. */
import { createInterface } from "node:readline";
import { handleMessage, makeForward } from "./bridge.js";

const base = process.env.CORPUS_BASE_URL || "https://corpuslaw.us";
const forward = makeForward(process.env.CORPUS_MCP_URL || `${base}/api/mcp`, process.env.CORPUS_API_KEY);

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: unknown;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
    return;
  }
  const res = await handleMessage(msg, { forward });
  if (res) process.stdout.write(JSON.stringify(res) + "\n");
});
