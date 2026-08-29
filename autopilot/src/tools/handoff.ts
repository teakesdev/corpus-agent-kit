import { corpusBase } from "./law-search.js";

/** The ONLY payload shape that crosses into the hosted /formation#prefill handoff. */
export interface HandoffDraft {
  v: 1;
  entityType: "llc" | "nonprofit";
  jurisdiction: string; // e.g. "US-MS"
  proposedName?: string;
  contactEmail?: string;
  naicsCode?: string;
}

// prettier-ignore
const STATE_CODES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO",
  CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID",
  ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA",
  "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC",
};

export function validateDraft(raw: unknown): { ok: true; draft: HandoffDraft } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const src = (raw ?? {}) as Record<string, unknown>;
  // Models emit "LLC" / "501(c)(3) nonprofit" / "Wyoming" as often as the canonical
  // forms, and the critical-lane reviewer is itself a model — normalize
  // deterministically here, reject only what can't be normalized.
  const entityRaw = typeof src.entityType === "string" ? src.entityType.trim().toLowerCase() : "";
  let entityType: "llc" | "nonprofit" | null =
    entityRaw === "llc" || entityRaw === "nonprofit" ? (entityRaw as "llc" | "nonprofit") : null;
  if (!entityType && /\bllc\b|limited liability/.test(entityRaw)) entityType = "llc";
  if (!entityType && /non.?profit|501\s*\(?c\)?/.test(entityRaw)) entityType = "nonprofit";
  if (!entityType) errors.push("entityType must be 'llc' or 'nonprofit'");
  let jurisRaw = typeof src.jurisdiction === "string" ? src.jurisdiction.trim().toUpperCase() : "";
  if (/^[A-Z]{2}$/.test(jurisRaw)) jurisRaw = `US-${jurisRaw}`;
  else if (STATE_CODES[jurisRaw]) jurisRaw = `US-${STATE_CODES[jurisRaw]}`;
  const jurisdiction = /^US-[A-Z]{2}$/.test(jurisRaw) ? jurisRaw : null;
  if (!jurisdiction) errors.push("jurisdiction must look like 'US-MS'");
  if (errors.length) return { ok: false, errors };
  const draft: HandoffDraft = { v: 1, entityType: entityType!, jurisdiction: jurisdiction! };
  if (typeof src.proposedName === "string" && src.proposedName.trim() && src.proposedName.length <= 200)
    draft.proposedName = src.proposedName.trim();
  if (typeof src.contactEmail === "string" && src.contactEmail.includes("@") && src.contactEmail.length <= 254)
    draft.contactEmail = src.contactEmail.trim();
  if (typeof src.naicsCode === "string" && /^\d{2,6}$/.test(src.naicsCode)) draft.naicsCode = src.naicsCode;
  return { ok: true, draft };
}

/** Prefill wire format mirrors the hosted IntakeDraft field names. */
export function buildHandoffUrl(draft: HandoffDraft): string {
  const wire: Record<string, unknown> = {
    v: 1,
    entityType: draft.entityType,
    jurisdiction: draft.jurisdiction,
    ...(draft.proposedName ? { proposedName: draft.proposedName } : {}),
    ...(draft.contactEmail ? { contactEmail: draft.contactEmail } : {}),
    ...(draft.naicsCode ? { llc: { naicsCode: draft.naicsCode } } : {}),
  };
  const b64 = Buffer.from(JSON.stringify(wire)).toString("base64url");
  return `${corpusBase()}/formation#prefill=${b64}`;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * The hosted `formation.handoff` tool is THE ONLY PLACE that can record which
 * agent sent a founder: it stamps `formation_order.source_api_key_id` from an
 * opaque `#src=` token minted against the calling API key. The key *id* is a
 * server-side UUID that no client is told — `account.status` returns the key's
 * NAME — so a locally built link is structurally unattributable, and there is
 * no server-side trace to reconstruct the channel from afterwards.
 *
 * Hence this: build the link on the hosted side when we hold a key, so orders
 * arriving from this agent are distinguishable from organic ones. Routing
 * through the hosted tool also picks up server-side draft validation and the
 * supported-combo check (e.g. nonprofit formation is unavailable in NH/NY),
 * which the local whitelist cannot know about.
 *
 * ATTRIBUTION NEVER COSTS THE HANDOFF. Every failure — no key, network error,
 * JSON-RPC error, timeout, a response carrying no link — falls back to the
 * local link, which is exactly what this agent produced before attribution
 * existed. A founder must never lose their draft because we wanted a metric.
 */
const HOSTED_HANDOFF_TIMEOUT_MS = 8000;

let handoffRpcId = 0;

/** Pull the handoff link out of the hosted tool's prose response. */
export function extractHandoffUrl(text: string): string | null {
  return text.match(/https?:\/\/\S*?\/formation#prefill=[A-Za-z0-9_\-=&]+/)?.[0] ?? null;
}

export async function resolveHandoffUrl(draft: HandoffDraft): Promise<string> {
  const local = buildHandoffUrl(draft);
  const apiKey = process.env.CORPUS_API_KEY;
  // No key → nothing to attribute to. Skip the round trip entirely.
  if (!apiKey) return local;
  try {
    const res = await fetch(`${corpusBase()}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HOSTED_HANDOFF_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++handoffRpcId,
        method: "tools/call",
        params: {
          name: "formation.handoff",
          arguments: {
            entityType: draft.entityType,
            // The hosted tool takes a bare state ("MS"); we carry US-XX.
            state: draft.jurisdiction.replace(/^US-/, ""),
            ...(draft.proposedName ? { proposedName: draft.proposedName } : {}),
            ...(draft.contactEmail ? { contactEmail: draft.contactEmail } : {}),
            ...(draft.naicsCode ? { naicsCode: draft.naicsCode } : {}),
          },
        },
      }),
    });
    if (!res.ok) return local;
    const json: any = await res.json();
    if (json.error) return local;
    const text: string = (json.result?.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    return extractHandoffUrl(text) ?? local;
  } catch {
    return local;
  }
}
