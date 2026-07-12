// Ported verbatim from the Corpus monorepo (Apache-2.0 relicense by the author).
/** Keyword-relevance NAICS lookup over the bundled dataset. Pure, no network. */
import { NAICS_CODES, type NaicsEntry } from "./naics-data.js";

export type NaicsMatch = NaicsEntry;

/**
 * Layperson → NAICS-title synonyms. The 2022 NAICS revision renamed the entire
 * 44–45 retail sector "Stores" → "Retailers", but founders still say "store"/"shop",
 * so those must still match the "Retailers" titles. A query word maps to the set of
 * title terms that count as a hit for it (substring match). Keep this small and
 * high-signal — broad synonyms add noise across 1,000+ titles.
 */
const SYNONYMS: Record<string, string[]> = {
  store: ["retailer", "store"],
  stores: ["retailer", "store"],
  shop: ["retailer", "shop"],
  shops: ["retailer", "shop"],
  retail: ["retailer", "retail"],
  retailer: ["retailer", "store"],
  seller: ["retailer", "seller"],
};

/**
 * Connector words that appear in almost every NAICS title ("… and …", "Other …")
 * — matching on them made unrelated titles rank ("Land Subdivision" contains
 * "and"). Never count these as query words.
 */
const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "into", "that", "this",
  "other", "all", "any", "etc", "inc", "llc", "will", "our",
]);

/**
 * Tiny plural/singular normalizer so "bakery" matches "Bakeries" and "shoes"
 * matches "Shoe". Applied to BOTH query words and title words — both sides land
 * on the same stem ("bakeries"→"bakery", "cakes"→"cake", "services"→"service").
 * Deliberately conservative: no real stemming, just plural suffixes.
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("ches") || w.endsWith("shes")))
    return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function lookupNaics(description: string, limit = 6): NaicsMatch[] {
  const words = (description ?? "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return [];
  const scored = NAICS_CODES.map((entry) => {
    // Stem the title word-by-word so plural titles match singular queries.
    const title = entry.title.toLowerCase().split(/\W+/).map(stem).join(" ");
    let score = 0;
    for (const w of words) {
      const terms = SYNONYMS[w] ?? [w];
      if (terms.some((t) => title.includes(stem(t)))) score += 1;
    }
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    // Prefer more query-word hits; break ties toward shorter (more specific) titles,
    // then a stable code order.
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.title.length - b.entry.title.length ||
        a.entry.code.localeCompare(b.entry.code),
    );
  return scored.slice(0, limit).map((x) => x.entry);
}
