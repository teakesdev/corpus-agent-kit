/** Pure MCP message handler: stdio notifications/ping are local; MCP requests are forwarded. */
export interface BridgeDeps {
  forward: (msg: object) => Promise<object | null>;
}

export async function handleMessage(msg: any, deps: BridgeDeps): Promise<object | null> {
  if (!msg || typeof msg !== "object") return null;
  if (typeof msg.method === "string" && msg.method.startsWith("notifications/")) return null;
  if (msg.method === "ping") return { jsonrpc: "2.0", id: msg.id ?? null, result: {} };
  try {
    return await deps.forward(msg);
  } catch (err) {
    return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32000, message: String((err as Error).message ?? err) } };
  }
}

export function makeForward(mcpUrl: string, apiKey?: string): BridgeDeps["forward"] {
  return async (msg: object) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(msg) });
    if (!res.ok && res.status !== 202) throw new Error(`hosted MCP returned HTTP ${res.status}`);
    if (res.status === 202) return null;
    return (await res.json()) as object;
  };
}
