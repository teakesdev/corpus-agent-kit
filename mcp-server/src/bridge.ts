/** Pure MCP message handler: local handshake, everything tool-shaped forwarded. */
export interface BridgeDeps {
  forward: (msg: object) => Promise<object>;
}

const SERVER_INFO = { name: "corpus-agent-kit", version: "0.1.0" };

export async function handleMessage(msg: any, deps: BridgeDeps): Promise<object | null> {
  if (!msg || typeof msg !== "object") return null;
  if (typeof msg.method === "string" && msg.method.startsWith("notifications/")) return null;
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Corpus law search bridge. Tools are served by the hosted Corpus platform; anonymous use is rate-limited — set CORPUS_API_KEY for higher limits.",
      },
    };
  }
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
    return res.status === 202 ? {} : ((await res.json()) as object);
  };
}
