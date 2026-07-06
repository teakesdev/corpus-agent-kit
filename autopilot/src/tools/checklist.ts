import { corpusBase } from "./law-search.js";

export interface ChecklistItem {
  task: string;
  citation?: string;
  nodeId?: string;
}

/** Deterministic markdown renderer — the model supplies items, this guarantees format. */
export function formatChecklist(items: ChecklistItem[]): string {
  return items
    .map((item, i) => {
      const cite = item.citation
        ? ` (${item.citation}${item.nodeId ? ` — ${corpusBase()}/code/${item.nodeId}` : ""})`
        : "";
      return `${i + 1}. ${item.task}${cite}`;
    })
    .join("\n");
}
