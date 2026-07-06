/** Two-lane model routing: cheap default, flagship only at gate-critical steps. */
export type Lane = "fast" | "critical";

export function lane(name: Lane): string {
  if (name === "critical") return process.env.QWEN_MODEL_CRITICAL || "qwen3.7-max";
  return process.env.QWEN_MODEL_FAST || "qwen-flash";
}
