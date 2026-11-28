/**
 * Fixed, reviewed wording for a founder who lives outside the US, plus the small helpers that tidy tool text before it
 * is shown. Nothing here is written by a model: the planner picks among these strings, and the only tool text it lets
 * through is checked line by line first.
 *
 * Provenance. The legal statements below paraphrase the Corpus guide
 * https://corpuslaw.us/guides/form-a-us-llc-as-a-non-resident (last checked 2026-11-05 in apps/web, lib/guide-llc-non-resident.ts),
 * which read each one from the IRS pages named in the text. Nothing is added beyond what that guide states.
 *
 * DEPLOY ORDER: the sources below carry four URLs the web client's allowlist (apps/web
 * src/app/autopilot/autopilot-plan-client.ts, safeCorpusUrl) learned about on 2026-11-07. That client rejects the WHOLE
 * plan if any guide source has a URL outside its list, so the web change must be live before this service emits them.
 */
import type { PlanSource } from "./plan-contract.js";
import { STATES } from "./plan-validation.js";

export const NON_RESIDENT_GUIDE = "https://corpuslaw.us/guides/form-a-us-llc-as-a-non-resident";
const IRS_EIN = "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number";
const IRS_SS4 = "https://www.irs.gov/instructions/iss4";
const IRS_5472 = "https://www.irs.gov/instructions/i5472";

/** Prefixed to the EIN item only when the Qwen flag, not the request, switched the non-US items on. */
export const ABROAD_FLAG_NOTE = "Your description suggests you're based outside the US. ";

export const ABROAD_EIN_TITLE = "Check how to get an EIN";
const ABROAD_EIN_LEAD =
  "An EIN is the LLC's US tax number. The IRS issues EINs for free after formation. Living abroad by itself does not determine online eligibility. " +
  "The IRS online application requires a U.S. principal place of business (or one in a U.S. territory) and the responsible party’s SSN or ITIN. " +
  "If online filing is not available to you, see the IRS Form SS-4 instructions for the applicable phone, fax or mail route. ";

export const ABROAD_EIN =
  ABROAD_EIN_LEAD + "Check checkout or your dashboard for current Corpus add-on availability.";

const dollars = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** Only a confirmed live price signal can advertise the optional paper filing service. */
export function abroadEinBody(noSsnCents: number | null): string {
  if (noSsnCents === null) return ABROAD_EIN;
  return ABROAD_EIN_LEAD +
    `If the responsible party has no SSN or ITIN, Corpus offers optional paper Form SS-4 filing for ${dollars(noSsnCents)} when shown at checkout or in your dashboard. ` +
    "Corpus prepares the form; the responsible party signs it by hand and returns a scan or clear photo before the filing partner submits it. " +
    "You can still apply directly with the IRS for free.";
}

export const FORM_5472_TITLE = "File the yearly Form 5472 for a foreign-owned LLC";
export const FORM_5472 =
  "A single-member LLC owned by a non-US person is \"disregarded\" for US income tax, but the IRS still requires it to file a pro forma Form 1120 with Form 5472 attached. " +
  "The filing is required for any year with a reportable transaction between you and the LLC, and putting money into the LLC or taking money out counts. " +
  "The guide gives the penalty for not filing as $25,000 per year (26 U.S.C. § 6038A(d)). " +
  "With two or more owners the LLC is taxed as a partnership by default instead; see the guide. " +
  "Corpus doesn't prepare Form 5472 or other tax filings, so plan for a US tax adviser who works with non-resident owners.";

const IRS_PAGE_NOTE = "Official IRS page. No excerpt was retrieved; open the page for the current guidance.";
const guideSource = (id: string, label: string, excerpt: string): PlanSource => ({ id, kind: "guide", label, url: NON_RESIDENT_GUIDE, excerpt });

// Do not represent cached offer details as a verbatim quote from the current guide.
export function abroadEinGuideExcerpt(): string {
  return "See the Corpus non-resident guide for IRS application routes and the current optional paper Form SS-4 service.";
}
const irsSource = (id: string, label: string, url: string): PlanSource => ({ id, kind: "guide", label, url, excerpt: IRS_PAGE_NOTE });

/**
 * The ledger entries behind the three non-US items. The Corpus excerpts are quoted from the guide's own sections
 * (checked 2026-11-05); the IRS pages were not fetched here, so they carry the same no-excerpt note as the existing IRS source.
 */
export const ABROAD_SOURCES: Record<string, PlanSource> = Object.fromEntries([
  guideSource("guide:nonres:ein", "Corpus guide — getting an EIN without an SSN", abroadEinGuideExcerpt()),
  irsSource("guide:irs-ein", "IRS — Get an employer identification number", IRS_EIN),
  irsSource("guide:irs-ss4", "IRS — Instructions for Form SS-4", IRS_SS4),
  guideSource("guide:nonres:5472", "Corpus guide — Form 5472",
    "A single-member LLC owned by a non-US person is \"disregarded\" for US income tax, but the IRS still requires it to file a pro forma Form 1120 with Form 5472 attached. " +
    "It is required for any year with a reportable transaction between you and the LLC, and putting money into the LLC or taking money out counts. " +
    "The penalty for not filing is $25,000 per year (26 U.S.C. § 6038A(d))."),
  irsSource("guide:irs-5472", "IRS — Instructions for Form 5472", IRS_5472),
  guideSource("guide:nonres:office", "Corpus guide — the principal office address",
    "Corpus can use an address outside the United States for an LLC formed in Wyoming or Delaware. Other states need a US street address, so many founders abroad use a US mail-forwarding service. " +
    "Maryland and New York need the office to be in that state. The registered agent's address can't double as your business address."),
].map(source => [source.id, source]));

export const ABROAD_EIN_SOURCE_IDS = ["guide:nonres:ein", "guide:irs-ein", "guide:irs-ss4"];
export const FORM_5472_SOURCE_IDS = ["guide:nonres:5472", "guide:irs-5472"];
export const PRINCIPAL_OFFICE_SOURCE_IDS = ["guide:nonres:office"];

export const PRINCIPAL_OFFICE_TITLE = "Check where the principal office can be";
const OFFICE_GENERAL =
  "Corpus's formation intake accepts a principal office outside the US only for Wyoming and Delaware: give its street, city and two-letter country code. " +
  "For other states the intake needs a US street address (many founders abroad use a US mail-forwarding service), and for Maryland and New York the address must be in that state. " +
  "The registered agent's address can't double as your business address. This is Corpus's intake rule, not a statement of state law.";

/** The general rule, plus one sentence about the formation state if the founder chose one. */
export function principalOfficeBody(formationState: string | null): string {
  const name = formationState ? STATES[formationState] : undefined;
  const chosen = !formationState || !name ? ""
    : formationState === "WY" || formationState === "DE" ? `You selected ${name}, where the intake accepts an address abroad.`
    : formationState === "MD" || formationState === "NY" ? `You selected ${name}, where the intake needs an office address in ${name}.`
    : `You selected ${name}, where the intake needs a US street address.`;
  return (OFFICE_GENERAL + " " + chosen).trim();
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
export const ABROAD_LOCAL = "You're operating from outside the US, so no US city's local rules were checked. If you'll have a location in a US city, add it and refresh the plan.";
export const ABROAD_EIN_PRICING_LINE = "Check checkout for current EIN add-on availability; see the EIN step.";

/** The pricing line for a founder abroad: only a verified offer shows a price. */
export function abroadEinPricingLine(noSsnCents: number | null): string {
  return noSsnCents === null ? ABROAD_EIN_PRICING_LINE
    : `Optional EIN without an SSN or ITIN: +$${(noSsnCents / 100).toFixed(2)}, paper Form SS-4 with a handwritten signature, not included above; see the EIN step.`;
}

/**
 * A pricing line as the founder should read it. The hosted text is written for an AI agent, so sentences that give the
 * agent an instruction ("Tell the founder before they pay.") are dropped. Prices are never touched. For a founder
 * abroad the $75 EIN add-on clause also goes: that add-on files the online IRS application, which needs an SSN or ITIN
 * and requires a U.S. principal place of business. Residence alone does not establish either condition.
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
