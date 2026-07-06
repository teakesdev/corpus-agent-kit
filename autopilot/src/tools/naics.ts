// Ported verbatim from the Corpus monorepo (Apache-2.0 relicense by the author).
/** Keyword-relevance NAICS lookup over the bundled dataset. Pure, no network. */
import { NAICS_CODES, type NaicsEntry } from "./naics-data.js";

export type NaicsMatch = NaicsEntry;

export function lookupNaics(description: string, limit = 6): NaicsMatch[] {
  const words = (description ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];
  const scored = NAICS_CODES.map((entry) => {
    const title = entry.title.toLowerCase();
    let score = 0;
    for (const w of words) if (title.includes(w)) score += 1;
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code));
  return scored.slice(0, limit).map((x) => x.entry);
}
