/** Wire contract shared with corpus-agent-kit /api/plan, version 1. */
export type PlanningMode = "exploring" | "ready" | "formed";
export type EntityChoice = "llc" | "nonprofit" | null;
export type Campaign = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term", string>>;
export interface PlanInput {
  mode: PlanningMode;
  activity: string;
  operatingState: string | null;
  operatingCity: string;
  formationState: string | null;
  entityType: EntityChoice;
  campaign: Campaign;
}
export interface PlanSource {
  id: string;
  kind: "law" | "catalog" | "guide";
  label: string;
  url: string;
  excerpt: string;
  nodeId?: string;
}
export interface PlanItem {
  id: string;
  category: "entity" | "registered_agent" | "ein" | "annual_report" | "state_tax" | "local";
  title: string;
  body: string;
  sourceIds: string[];
  needsCheck: boolean;
}
export interface PlanResponse {
  version: 1;
  createdAt: string;
  items: PlanItem[];
  sources: PlanSource[];
  pricing: { available: boolean; state: string | null; lines: string[]; checkedAt: string };
  tools: string[];
  warnings: string[];
}
export type ItemProgress = "todo" | "done" | "not_applicable" | "needs_check";
export interface PlanHandoff { url: string; missing: string[] }
export interface ServiceOffer {
  id: "annual_report" | "renewal_bundle" | "registered_agent";
  title: string;
  available: boolean;
  description: string;
  href: string;
}
