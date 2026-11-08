/**
 * Ceilings the plan stays under, set below what the web client enforces. The web (apps/web autopilot-plan-client.ts,
 * parsePlanResponse) throws away the WHOLE plan if any limit is passed: more than 40 items, 60 sources or 30 warnings,
 * a warning over 500 characters, an item title over 240 or body over 3,000, a source label over 400 or excerpt over
 * 5,000, or an item that names a source that is not in the list. Ours are tighter, so a catalog reply that is odd
 * (hundreds of sections, a runaway line) makes a smaller plan instead of no plan.
 */
import type { PlanItem, PlanSource } from "./plan-contract.js";

export const MAX_ITEMS = 30;
export const MAX_SOURCES = 45;
export const MAX_WARNINGS = 20;
export const MAX_WARNING_CHARS = 480;
/** Intake sections shown: REQUIRED plus the state's own questions, with room to spare. */
export const MAX_INTAKE_SECTIONS = 3;
const MAX_TITLE = 240;
const MAX_BODY = 3000;
const MAX_LABEL = 400;
const MAX_EXCERPT = 5000;

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

/**
 * Brings items, sources and warnings under the ceilings above without ever leaving an item that names a missing source.
 * Order is kept; when something must go, later items, then sources no kept item names, then later warnings go. Under the
 * ceilings (every normal plan) the input comes back unchanged apart from a de-duplicated warning list.
 */
export function clampPlan(items: PlanItem[], sources: PlanSource[], warnings: string[]): { items: PlanItem[]; sources: PlanSource[]; warnings: string[] } {
  const keptItems = items.slice(0, MAX_ITEMS).map(i => ({ ...i, title: cut(i.title, MAX_TITLE), body: cut(i.body, MAX_BODY) }));
  let keptSources = sources;
  if (sources.length > MAX_SOURCES) {
    // Past the ceiling only sources some kept item names are worth carrying.
    const referenced = new Set(keptItems.flatMap(i => i.sourceIds));
    keptSources = sources.filter(s => referenced.has(s.id)).slice(0, MAX_SOURCES);
  }
  keptSources = keptSources.map(s => ({ ...s, label: cut(s.label, MAX_LABEL), excerpt: cut(s.excerpt, MAX_EXCERPT) }));
  const present = new Set(keptSources.map(s => s.id));
  return {
    items: keptItems.map(i => i.sourceIds.every(id => present.has(id)) ? i : { ...i, sourceIds: i.sourceIds.filter(id => present.has(id)) }),
    sources: keptSources,
    warnings: [...new Set(warnings.map(w => cut(w, MAX_WARNING_CHARS)))].slice(0, MAX_WARNINGS),
  };
}
