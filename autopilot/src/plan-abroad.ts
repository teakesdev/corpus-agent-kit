/**
 * Fixed, reviewed wording for a founder who lives outside the US, plus the small helpers that tidy tool text before it
 * is shown. Nothing here is written by a model: the planner picks among these strings, and the only tool text it lets
 * through is checked line by line first.
 *
 * Provenance. The legal statements below paraphrase the Corpus guide
 * https://corpuslaw.us/guides/form-a-us-llc-as-a-non-resident (last checked 2026-11-05 in apps/web, lib/guide-llc-non-resident.ts),
 * which read each one from the IRS pages named in the text. Nothing is added beyond what that guide states.
 *
 * Why the URLs sit in the item text and not in the source ledger: the live web client (apps/web
 * src/app/autopilot/autopilot-plan-client.ts, safeCorpusUrl) rejects the WHOLE plan if any guide source has a URL
 * outside a three-URL allowlist, and this server deploys before the web does. Until the web allowlist also accepts the
 * four URLs below, a ledger source for them would turn every non-US plan into "invalid-plan". Plain text cannot.
 */
import { STATES } from "./plan-validation.js";

export const NON_RESIDENT_GUIDE = "https://corpuslaw.us/guides/form-a-us-llc-as-a-non-resident";
const IRS_EIN = "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number";
const IRS_SS4 = "https://www.irs.gov/instructions/iss4";
const IRS_5472 = "https://www.irs.gov/instructions/i5472";

/** Prefixed to the EIN item only when the Qwen flag, not the request, switched the non-US items on. */
export const ABROAD_FLAG_NOTE = "Your description suggests you're based outside the US. ";

export const ABROAD_EIN_TITLE = "Get an EIN without an SSN or ITIN";
export const ABROAD_EIN =
  "An EIN is the LLC's US tax number. Banks and payment processors ask for it, and it is free from the IRS. " +
  "The IRS online application needs the responsible party's SSN or ITIN and can't be used when the principal place of business is outside the US, " +
  "so a founder without an SSN or ITIN requests the EIN with Form SS-4 by phone, fax or mail instead: with no legal residence, " +
  "principal place of business or principal office in the US, call +1 267-941-1099 (not toll-free; 6 a.m.-11 p.m. Eastern, Monday-Friday), " +
  "fax Form SS-4 to +1 304-707-9471 from outside the US, or mail it to the IRS EIN International Operation in Cincinnati, which takes about four weeks. " +
  "Corpus's EIN add-on uses the online application, so it can't get this EIN for you; apply directly with the IRS after the LLC is formed. " +
  `Sources: Corpus guide ${NON_RESIDENT_GUIDE}; IRS ${IRS_EIN}; IRS Form SS-4 instructions ${IRS_SS4}.`;

export const FORM_5472_TITLE = "File the yearly Form 5472 for a foreign-owned LLC";
export const FORM_5472 =
  "A single-member LLC owned by a non-US person is \"disregarded\" for US income tax, but the IRS still requires it to file a pro forma Form 1120 with Form 5472 attached. " +
  "The filing is required for any year with a reportable transaction between you and the LLC, and putting money into the LLC or taking money out counts. " +
  "The guide gives the penalty for not filing as $25,000 per year (26 U.S.C. § 6038A(d)). " +
  "With two or more owners the LLC is taxed as a partnership by default instead; see the guide. " +
  "Corpus doesn't prepare Form 5472 or other tax filings, so plan for a US tax adviser who works with non-resident owners. " +
  `Sources: Corpus guide ${NON_RESIDENT_GUIDE}; IRS Form 5472 instructions ${IRS_5472}.`;

export const PRINCIPAL_OFFICE_TITLE = "Check where the principal office can be";
const OFFICE_GENERAL =
  "Corpus's formation intake accepts a principal office outside the US only for Wyoming and Delaware: give its street, city and two-letter country code. " +
  "For other states the intake needs a US street address (many founders abroad use a US mail-forwarding service), and for Maryland and New York the address must be in that state. " +
  "The registered agent's address can't double as your business address. This is Corpus's intake rule, not a statement of state law. ";

/** The general rule, plus one sentence about the formation state if the founder chose one. */
export function principalOfficeBody(formationState: string | null): string {
  const name = formationState ? STATES[formationState] : undefined;
  const chosen = !formationState || !name ? ""
    : formationState === "WY" || formationState === "DE" ? `You selected ${name}, where the intake accepts an address abroad. `
    : formationState === "MD" || formationState === "NY" ? `You selected ${name}, where the intake needs an office address in ${name}. `
    : `You selected ${name}, where the intake needs a US street address. `;
  return OFFICE_GENERAL + chosen + `More: ${NON_RESIDENT_GUIDE}`;
}

/**
 * The one sentence run in the live formation catalog that states that rule, so the item can quote Corpus's own intake
 * text as its source. Null when the catalog does not carry it (then the item stays unsourced rather than guessing).
 */
export function officeRuleFromCatalog(catalog: string): string | null {
  const match = catalog.match(/In Wyoming and Delaware only, [^\n]*?Maryland and New York need an office in that state\./);
  return match && match[0].length <= 600 ? match[0] : null;
}

export const ABROAD_STATE_TAX = "Operating location: outside the US. Whether the LLC must register for tax in any US state has not been determined.";
export const ABROAD_EIN_PRICING_LINE = "The EIN add-on isn't available without an SSN or ITIN; see the EIN step.";

/**
 * A pricing line as the founder should read it. The hosted text is written for an AI agent, so sentences that give the
 * agent an instruction ("Tell the founder before they pay.") are dropped. Prices are never touched. For a founder
 * abroad the $75 EIN add-on clause also goes: that add-on files the online IRS application, which needs an SSN or ITIN
 * and refuses a principal office abroad.
 */
export function pricingLineForDisplay(line: string, abroad: boolean): string {
  const sentences = line.split(/(?<=[.!?])\s+/).filter(s => !/^tell (?:the|your) (?:founder|user)\b/i.test(s.trim()));
  const kept = sentences.join(" ").trim();
  return abroad ? kept.replace(/\s*Optional EIN add-on: \+\$\d[\d,]*\.\d{2}\.?/gi, "").trim() : kept;
}

/**
 * The candidate lines of a formation.lookup_naics reply. The reply's first line quotes the founder's own words back, so
 * only lines of the exact "- 123456 — Title" shape survive. Null when there are none.
 */
export function parseNaicsCandidates(text: string): string[] | null {
  const rows = text.split("\n").map(l => l.trimEnd()).filter(l => /^- \d{6} — [^\n\x00-\x1f]{1,150}$/.test(l)).slice(0, 6);
  return rows.length ? rows : null;
}
