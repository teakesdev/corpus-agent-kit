// Types mirrored from the hosted Corpus API contract (chat stream, v1).

export const JURISDICTION_LEVELS = ["federal", "state", "county", "municipal"] as const;
export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A clickable source backing a claim in the answer. */
export interface Citation {
  nodeId: string;
  citation: string;
  heading: string | null;
  /** Human-readable jurisdiction name, e.g. "Mississippi" or "United States". */
  jurisdiction: string;
  level?: JurisdictionLevel;
  /** Convenience link for the UI: `/code/${nodeId}`. */
  url: string;
}

export type ChatStatusPhase = "searching" | "reading" | "synthesizing";

/** One line of the NDJSON response stream. */
export type ChatStreamEvent =
  | { type: "status"; phase: ChatStatusPhase; detail: string }
  | { type: "token"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "error"; message: string }
  | { type: "done" };
