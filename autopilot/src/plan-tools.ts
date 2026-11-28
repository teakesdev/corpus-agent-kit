import { corpusBase } from "./tools/law-search.js";
import { PlanError, record } from "./plan-validation.js";

export type ToolName = "formation.requirements" | "law.search" | "law.get_node" | "law.list_coverage" | "formation.handoff" | "formation.lookup_naics";
export type ToolCall = (name: ToolName, args: Record<string, unknown>, signal: AbortSignal) => Promise<string>;
export const TOOL_TIMEOUT_MS = 4500;
export const PLAN_TIMEOUT_MS = 24000;
export const MAX_TOOL_BYTES = 131072;

/** Only a known hosted semantic failure is exposed, using our own categorical copy. */
export class UnsupportedFormationError extends PlanError {
  constructor() {
    super(400, "Corpus does not currently support formation for the selected state and entity. Choose another state or entity before continuing.");
  }
}

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

/** Reads whether the EIN without an SSN or ITIN is on sale: its price in cents, or null when it is not (or unreadable). */
export type EinNoSsnOffer = (signal: AbortSignal) => Promise<number | null>;
export const EIN_OFFER_TIMEOUT_MS = 2000;

/**
 * The web's public price list (`GET /api/v1/formation/prices`, CDN-cached, no key) says whether the EIN for a responsible
 * party with no SSN or ITIN is on sale (`einAddon.noSsnAvailable`, true only while EIN_NO_SSN_ENABLED=on) and its price
 * (`einAddon.noSsnCents`). It is the same signal the /autopilot answer card reads, so the plan's EIN step and the card
 * flip together. Anything but an explicit `true` with a sane whole-cent amount is null, and null keeps the old wording.
 */
export const hostedEinNoSsnOffer: EinNoSsnOffer = async (signal) => {
  const response = await fetch(`${corpusBase()}/api/v1/formation/prices`, { signal, headers: { Accept: "application/json" } });
  const json: unknown = JSON.parse(await readBoundedResponse(response, signal));
  return einNoSsnCentsFrom(json);
};

export function einNoSsnCentsFrom(json: unknown): number | null {
  if (!record(json) || json.ok !== true || !record(json.einAddon)) return null;
  const { noSsnAvailable, noSsnCents } = json.einAddon;
  return noSsnAvailable === true && typeof noSsnCents === "number" && Number.isSafeInteger(noSsnCents) && noSsnCents > 0 && noSsnCents < 100_000
    ? noSsnCents : null;
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
  let text: unknown = record(result.structuredContent) ? result.structuredContent.text : undefined;
  if (text === undefined && Array.isArray(result.content)) {
    text = result.content.filter(c => record(c) && c.type === "text" && typeof c.text === "string").map(c => c.text).join("\n");
  }
  if (result.isError || (record(result.structuredContent) && result.structuredContent.isError)) {
    const kind = args.entityType === "llc" ? "LLC" : args.entityType === "nonprofit" ? "Nonprofit" : null;
    if ((name === "formation.requirements" || name === "formation.handoff") && kind &&
      typeof args.state === "string" && /^[A-Z]{2}$/.test(args.state) && typeof text === "string" &&
      text.startsWith(`${kind} formation is not available in US-${args.state}. LLC formation is available in `)) {
      throw new UnsupportedFormationError();
    }
    throw new Error("Tool failed");
  }
  if (typeof text !== "string" || !text.trim() || /^Error:/i.test(text.trim())) throw new Error("Tool text missing");
  return text;
};
