import type { PlanInput } from "./plan-contract.js";

export class PlanError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const STATES: Record<string, string> = Object.fromEntries([
  "AL:Alabama", "AK:Alaska", "AZ:Arizona", "AR:Arkansas", "CA:California", "CO:Colorado",
  "CT:Connecticut", "DE:Delaware", "DC:District of Columbia", "FL:Florida", "GA:Georgia",
  "HI:Hawaii", "ID:Idaho", "IL:Illinois", "IN:Indiana", "IA:Iowa", "KS:Kansas", "KY:Kentucky",
  "LA:Louisiana", "ME:Maine", "MD:Maryland", "MA:Massachusetts", "MI:Michigan", "MN:Minnesota",
  "MS:Mississippi", "MO:Missouri", "MT:Montana", "NE:Nebraska", "NV:Nevada", "NH:New Hampshire",
  "NJ:New Jersey", "NM:New Mexico", "NY:New York", "NC:North Carolina", "ND:North Dakota",
  "OH:Ohio", "OK:Oklahoma", "OR:Oregon", "PA:Pennsylvania", "RI:Rhode Island", "SC:South Carolina",
  "SD:South Dakota", "TN:Tennessee", "TX:Texas", "UT:Utah", "VT:Vermont", "VA:Virginia",
  "WA:Washington", "WV:West Virginia", "WI:Wisconsin", "WY:Wyoming",
].map(s => s.split(":")));

export const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const FIELDS = ["mode", "activity", "operatingState", "operatingCity", "formationState", "entityType", "campaign"];
export function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function validatePlanInput(v: unknown): PlanInput {
  const bad = () => { throw new PlanError(400, "Invalid planning input."); };
  if (!record(v) || Object.keys(v).some(k => !FIELDS.includes(k)) || FIELDS.some(k => !Object.hasOwn(v, k))) return bad();
  if (!["exploring", "ready", "formed"].includes(v.mode as string)) return bad();
  if (v.entityType !== null && v.entityType !== "llc" && v.entityType !== "nonprofit") return bad();
  for (const key of ["formationState", "operatingState"]) {
    if (v[key] !== null && (typeof v[key] !== "string" || !Object.hasOwn(STATES, v[key] as string))) return bad();
  }
  if (typeof v.activity !== "string" || v.activity.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v.activity)) return bad();
  if (typeof v.operatingCity !== "string" || v.operatingCity.length > 100 || /[\x00-\x1f\x7f]/.test(v.operatingCity)) return bad();
  if (!record(v.campaign) || Object.keys(v.campaign).some(k => !CAMPAIGN_KEYS.includes(k as typeof CAMPAIGN_KEYS[number]))) return bad();
  if (Object.values(v.campaign).some(s => typeof s !== "string" || s.length > 100 || !/^[A-Za-z0-9_.~-]*$/.test(s))) return bad();
  return { ...v, activity: v.activity.replace(/\s+/g, " ").trim(), operatingCity: v.operatingCity.trim(), campaign: { ...v.campaign } } as PlanInput;
}
