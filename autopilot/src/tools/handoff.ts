import { corpusBase } from "./law-search.js";

/** The ONLY payload shape that crosses into the hosted /formation prefill. */
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
  return `${corpusBase()}/formation?prefill=${b64}`;
}
