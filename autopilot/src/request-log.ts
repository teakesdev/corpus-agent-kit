/**
 * One structured log line per /api/plan and /api/plan/handoff request.
 *
 * Why: the plan review (corpus 2026-11-01) could not say what a plan costs. FC kept no request logs and the Qwen
 * `usage` object was read and thrown away. Each line records how many hosted tool calls the request made and how many
 * Qwen tokens it used, so a month of plans can be priced from the log store without guessing.
 *
 * Privacy: choices and counts only. The founder's activity and city are never logged, nor the operating state, the
 * campaign tags, any tool text, any plan text or any error message. The three choices (mode, entity, formation state)
 * are the same fields the web page sends to its own analytics.
 */
import type { PlanInput } from "./plan-contract.js";

export interface PlanMetrics {
  /** Hosted MCP calls attempted, failed ones included. The planner allows at most 6. */
  toolCalls: number;
  /** Names of the tools that returned, in order, plus `qwen.order_known_items` when the ordering call succeeded (the live array the planner appends to). */
  tools: string[];
  /** Qwen chat calls attempted, and the tokens the provider reported for the ones that returned. */
  qwenCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  itemCount: number;
  warningCount: number;
}

export const newMetrics = (): PlanMetrics => ({
  toolCalls: 0, tools: [], qwenCalls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, itemCount: 0, warningCount: 0,
});

/** The OpenAI-shaped `usage` block; DashScope's compatible mode returns the same three numbers. */
export interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

export function recordUsage(metrics: Pick<PlanMetrics, "promptTokens" | "completionTokens" | "totalTokens">, usage: Usage | null | undefined): void {
  const add = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
  metrics.promptTokens += add(usage?.prompt_tokens);
  metrics.completionTokens += add(usage?.completion_tokens);
  metrics.totalTokens += add(usage?.total_tokens);
}

export interface RequestLogEntry {
  route: "plan" | "handoff";
  status: number;
  durationMs: number;
  input?: Pick<PlanInput, "mode" | "entityType" | "formationState">;
  metrics?: PlanMetrics;
}

export function requestLogLine(entry: RequestLogEntry): string {
  const m = entry.metrics ?? newMetrics();
  return JSON.stringify({
    event: "autopilot_request",
    ts: new Date().toISOString(),
    route: entry.route,
    status: entry.status,
    duration_ms: Math.max(0, Math.round(entry.durationMs)),
    mode: entry.input?.mode ?? null,
    entity: entry.input?.entityType ?? null,
    formation_state: entry.input?.formationState ?? null,
    tool_calls: m.toolCalls,
    tools: m.tools,
    qwen_calls: m.qwenCalls,
    qwen_prompt_tokens: m.promptTokens,
    qwen_completion_tokens: m.completionTokens,
    qwen_total_tokens: m.totalTokens,
    item_count: m.itemCount,
    warning_count: m.warningCount,
  });
}
