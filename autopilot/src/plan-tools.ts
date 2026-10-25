import { corpusBase } from "./tools/law-search.js";
import { PlanError, record } from "./plan-validation.js";

export type ToolName = "formation.requirements" | "law.search" | "law.get_node" | "law.list_coverage" | "formation.handoff";
export type ToolCall = (name: ToolName, args: Record<string, unknown>, signal: AbortSignal) => Promise<string>;
export const TOOL_TIMEOUT_MS = 4500;
export const PLAN_TIMEOUT_MS = 24000;
export const MAX_TOOL_BYTES = 131072;

/** Enforces a deadline even when an injected/third-party implementation ignores abort. */
export async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, ms: number): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  if (parent.aborted) abort();
  const timer = setTimeout(abort, ms);
  let rejectAbort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new PlanError(504, "Planning request timed out."));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  try {
    if (controller.signal.aborted) return await stopped;
    return await Promise.race([work(controller.signal), stopped]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

export async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok || !response.body) throw new Error("Tool unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TOOL_BYTES) throw new Error("Tool response too large");
      chunks.push(value);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
}

/** MCP tools return prose in structuredContent.text / content[].text, not result objects. */
export const hostedTool: ToolCall = async (name, args, signal) => {
  const response = await fetch(`${corpusBase()}/api/mcp`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...(process.env.CORPUS_API_KEY ? { Authorization: `Bearer ${process.env.CORPUS_API_KEY}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const json: unknown = JSON.parse(await readBoundedResponse(response, signal));
  if (!record(json) || json.error || !record(json.result)) throw new Error("Tool failed");
  const result = json.result;
  if (result.isError || (record(result.structuredContent) && result.structuredContent.isError)) throw new Error("Tool failed");
  let text: unknown = record(result.structuredContent) ? result.structuredContent.text : undefined;
  if (text === undefined && Array.isArray(result.content)) {
    text = result.content.filter(c => record(c) && c.type === "text" && typeof c.text === "string").map(c => c.text).join("\n");
  }
  if (typeof text !== "string" || !text.trim() || /^Error:/i.test(text.trim())) throw new Error("Tool text missing");
  return text;
};
