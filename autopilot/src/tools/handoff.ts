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

export function validateDraft(raw: unknown): { ok: true; draft: HandoffDraft } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const src = (raw ?? {}) as Record<string, unknown>;
  const entityType = src.entityType === "llc" || src.entityType === "nonprofit" ? src.entityType : null;
  if (!entityType) errors.push("entityType must be 'llc' or 'nonprofit'");
  const jurisdiction = typeof src.jurisdiction === "string" && /^US-[A-Z]{2}$/.test(src.jurisdiction) ? src.jurisdiction : null;
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
