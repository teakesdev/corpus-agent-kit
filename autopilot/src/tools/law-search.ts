/** Thin client of the hosted Corpus MCP endpoint (anonymous, rate-limited). */
let rpcId = 0;

export function corpusBase(): string {
  return (process.env.CORPUS_BASE_URL || "https://corpuslaw.us").replace(/\/$/, "");
}

export async function searchLaw(query: string, jurisdiction?: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CORPUS_API_KEY) headers.Authorization = `Bearer ${process.env.CORPUS_API_KEY}`;
  try {
    const res = await fetch(`${corpusBase()}/api/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name: "law.search", arguments: { query, ...(jurisdiction ? { jurisdiction } : {}), limit: 6 } },
      }),
    });
    if (!res.ok) return `Law search is temporarily unavailable (HTTP ${res.status}). Continue the intake and note that citations are pending.`;
    const json: any = await res.json();
    if (json.error) return `Law search is temporarily unavailable (${json.error.message}). Continue the intake and note that citations are pending.`;
    const parts: string[] = (json.result?.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text);
    return parts.join("\n") || "No results found for that query.";
  } catch (err) {
    return `Law search is temporarily unavailable (${(err as Error).message}). Continue the intake and note that citations are pending.`;
  }
}
