/** Consume the /api/widget/query NDJSON stream, firing a callback per event. */
import type { ChatStreamEvent } from "./types";

export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as ChatStreamEvent);
      } catch {
        /* skip malformed line */
      }
    }
  }
}
