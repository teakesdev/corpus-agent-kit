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
 * Curated layperson-phrase → NAICS code aliases, consulted BEFORE the title scorer.
 * These are a correctness floor for common founder intents whose correct code does
 * not share a word with its NAICS title.
 */
const ALIAS_CODES: Record<string, readonly string[]> = {
  // ── Software / technology ──
  "software": ["541511", "513210"],
  "saas": ["541511", "513210"],
  "app": ["541511"],
  "apps": ["541511"],
  "mobile app": ["541511"],
  "web app": ["541511"],
  "web development": ["541511"],
  "web design": ["541511", "541430"],
  "website": ["541511", "541430"],
  "programming": ["541511"],
  "developer": ["541511"],
  "coding": ["541511"],
  "information technology": ["541512", "541519"],
  "it consulting": ["541512", "541511"],
  "tech consulting": ["541512", "541511"],
  "cybersecurity": ["541512", "541519"],
  "artificial intelligence": ["541511", "541512"],
  "machine learning": ["541511", "541512"],
  "data analytics": ["541511", "541519"],
  // ── Food and drink ──
  "coffee shop": ["722515"],
  "coffee": ["722515"],
  "cafe": ["722515"],
  "restaurant": ["722511"],
  "food truck": ["722330"],
  "catering": ["722320"],
  "bakery": ["311811"],
  // ── Trades and construction ──
  "plumbing": ["238220"],
  "plumber": ["238220"],
  "hvac": ["238220"],
  "electrician": ["238210"],
  "roofing": ["238160"],
  "landscaping": ["561730"],
  "lawn care": ["561730"],
  "cleaning": ["561720"],
  "janitorial": ["561720"],
  "handyman": ["236118"],
  "remodeling": ["236118"],
  "general contractor": ["236118"],
  // ── Professional services ──
  "marketing agency": ["541810", "541613"],
  "marketing": ["541613", "541810"],
  "advertising": ["541810"],
  "consulting": ["541611"],
  "bookkeeping": ["541219"],
  "accounting": ["541211"],
  "graphic design": ["541430"],
  "photography": ["541921", "541922"],
  "videography": ["512110"],
  "real estate": ["531210"],
  "trucking": ["484110"],
  "freight": ["484110"],
  "tutoring": ["611691"],
  "personal training": ["611620"],
  // ── Personal services and retail ──
  "nail salon": ["812113"],
  "hair salon": ["812112"],
  "barber": ["812111"],
  "ecommerce": ["455219"],
  "e-commerce": ["455219"],
  "online store": ["455219"],
  "online retail": ["455219"],
  // ── Second alias batch ──
  "gym": ["713940"],
  "fitness": ["713940"],
  "yoga": ["713940"],
  "pilates": ["713940"],
  "crossfit": ["713940"],
  "dog grooming": ["812910"],
  "pet grooming": ["812910"],
  "pet sitting": ["812910"],
  "dog walking": ["812910"],
  "grooming": ["812910"],
  "tattoo": ["812199"],
  "piercing": ["812199"],
  "massage": ["621399"],
  "day care": ["624410"],
  "daycare": ["624410"],
  "preschool": ["624410"],
  "event planning": ["561920"],
  "event planner": ["561920"],
  "wedding planning": ["561920"],
  "staffing": ["561320", "561311"],
  "recruiting": ["561311"],
  "recruitment": ["561311"],
  "junk removal": ["562111"],
  "hauling": ["562111"],
  "pressure washing": ["561790"],
  "power washing": ["561790"],
  "podcast": ["512240", "516210"],
  "t-shirt": ["458110"],
  "t shirts": ["458110"],
  "apparel": ["458110"],
  "clothing brand": ["458110"],
};

/** Alias matchers, longest phrase first so "coffee shop" wins over "coffee". */
const ALIAS_MATCHERS: readonly (readonly [RegExp, readonly string[]])[] = Object.entries(ALIAS_CODES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(
    ([phrase, codes]) =>
      [new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), codes] as const,
  );

/** Codes named by ALIAS_CODES, in preference order, for a raw description. */
function aliasCodes(description: string): string[] {
  const hits: string[] = [];
  for (const [re, codes] of ALIAS_MATCHERS) {
    if (re.test(description)) for (const c of codes) if (!hits.includes(c)) hits.push(c);
  }
  return hits;
}

/** Exported for tests: every code an alias can name must exist in the dataset. */
export const ALIAS_CODE_LIST: readonly string[] = Array.from(
  new Set(Object.values(ALIAS_CODES).flat()),
);

/**
 * Connector words that appear in almost every NAICS title ("… and …", "Other …")
 * — matching on them made unrelated titles rank ("Land Subdivision" contains
 * "and"). Never count these as query words. Entity-type nouns are also ignored;
 * founders append them out of habit and they otherwise bias toward "Companies".
 */
const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "into", "that", "this",
  "other", "all", "any", "etc", "inc", "llc", "will", "our",
  "company", "companies", "business", "businesses",
  "corp", "corporation", "startup", "venture",
]);

/**
 * Tiny plural/singular normalizer so "bakery" matches "Bakeries" and "shoes"
 * matches "Shoe". Applied to BOTH query words and title words.
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("ches") || w.endsWith("shes")))
    return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Code → entry, for resolving curated alias codes. */
const BY_CODE: Map<string, NaicsEntry> = new Map(NAICS_CODES.map((e) => [e.code, e]));

/** Match an exact title word or a four-character-plus title prefix. */
function matchesTitle(q: string, titleWordSet: Set<string>, titleWords: string[]): boolean {
  if (titleWordSet.has(q)) return true;
  if (q.length < 4) return false;
  return titleWords.some((t) => t.startsWith(q));
}

export function lookupNaics(description: string, limit = 6): NaicsMatch[] {
  const raw = description ?? "";
  // Curated aliases first: these are the intents whose correct code shares no
  // word with its NAICS title, so the scorer below cannot reach them at all.
  const pinned = aliasCodes(raw)
    .map((c) => BY_CODE.get(c))
    .filter((e): e is NaicsEntry => e !== undefined)
    .slice(0, limit);
  const words = raw
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return pinned;
  const scored = NAICS_CODES.map((entry) => {
    // Stem title words individually and match against a set. This avoids the
    // old substring false positives: "bar" in "barber", "pet" in "petroleum",
    // and "cat" in "catering".
    const titleWords = entry.title.toLowerCase().split(/\W+/).filter(Boolean).map(stem);
    const titleWordSet = new Set(titleWords);
    let score = 0;
    for (const w of words) {
      const terms = SYNONYMS[w] ?? [w];
      if (terms.some((t) => matchesTitle(stem(t), titleWordSet, titleWords))) score += 1;
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
  const pinnedCodes = new Set(pinned.map((e) => e.code));
  const rest = scored.map((x) => x.entry).filter((e) => !pinnedCodes.has(e.code));
  return [...pinned, ...rest].slice(0, limit);
}

/** Reverse lookup: exact NAICS title for a 6-digit code, or null if unknown. */
const TITLE_BY_CODE: Map<string, string> = new Map(NAICS_CODES.map((e) => [e.code, e.title]));
export function naicsTitleForCode(code: string): string | null {
  return TITLE_BY_CODE.get((code ?? "").trim()) ?? null;
}
