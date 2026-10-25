import type { PlanInput, PlanResponse, PlanHandoff, PlanItem, PlanSource } from "./plan-contract.js";
import { bounded, hostedTool, MAX_TOOL_BYTES, PLAN_TIMEOUT_MS, TOOL_TIMEOUT_MS, UnsupportedFormationError, type ToolCall, type ToolName } from "./plan-tools.js";
import { CAMPAIGN_KEYS, PlanError, STATES, validatePlanInput } from "./plan-validation.js";
import { exactLocalCoverage, parseNode, parseSearch } from "./plan-evidence.js";
import { getQwen } from "./qwen.js";
import { lane } from "./routing.js";

type Selector = (ids: string[], signal: AbortSignal, context: { input: PlanInput; items: Pick<PlanItem, "id" | "title" | "category">[] }) => Promise<unknown>;
export interface PlanDeps {
  tool?: ToolCall;
  select?: Selector;
  toolTimeoutMs?: number;
  modelTimeoutMs?: number;
  timeoutMs?: number;
}
const GUIDE = "https://corpuslaw.us/guides/after-forming-an-llc";
const CHECKLIST = "https://corpuslaw.us/checklist";
// Reviewed wording from funnel-content.ts and the after-forming-an-llc guide (2026-10-19).
const EIN = "A single-member LLC with no employees, no relevant excise-tax obligations, and no corporate tax election generally does not need a separate EIN for federal tax purposes. A multi-member LLC generally does. A bank or state requirement may also make an EIN necessary for your next step.";
const RA = "Most states require an LLC to name a registered agent — it can be the owner in many states, or a paid service. Minnesota, Pennsylvania and West Virginia make the agent optional (Minnesota and Pennsylvania still require a registered office address).";
const ANNUAL = "Most states also charge a recurring fee to keep an LLC alive (often called an annual report or franchise tax) — the amount and due date vary by state.";
const ENTITY = "An LLC, an EIN, and a registered agent are three different things: the LLC is the legal entity your state creates; the EIN is the federal tax ID the IRS issues; the registered agent is the person or company that receives legal mail for the entity at a street address in the formation state.";

const FINISH_RESERVE_MS = 500;
const MIN_TOOL_BUDGET_MS = 100;

function requestTools(deps: PlanDeps, signal: AbortSignal, tools: string[], warnings: string[], deadline = Date.now() + PLAN_TIMEOUT_MS) {
  let calls = 0;
  return async (name: ToolName, args: Record<string, unknown>): Promise<string | null> => {
    signal.throwIfAborted();
    const budget = Math.min(deps.toolTimeoutMs ?? TOOL_TIMEOUT_MS, TOOL_TIMEOUT_MS, deadline - Date.now() - FINISH_RESERVE_MS);
    if (budget < Math.min(MIN_TOOL_BUDGET_MS, deps.toolTimeoutMs ?? TOOL_TIMEOUT_MS)) {
      warnings.push(`${name} was skipped to finish within the planning deadline; related items need checking.`);
      return null;
    }
    if (++calls > 6) throw new Error("Tool limit reached");
    try {
      const text = await bounded(s => (deps.tool ?? hostedTool)(name, args, s), signal, budget);
      if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > MAX_TOOL_BYTES || /^Error:/i.test(text.trim())) throw new Error("Invalid tool text");
      if (!tools.includes(name)) tools.push(name);
      return text;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof UnsupportedFormationError) {
        if (name === "formation.handoff") throw error;
        warnings.push(error.message);
        return null;
      }
      warnings.push(`${name} was unavailable or returned an unreadable response; related items need checking.`);
      return null;
    }
  };
}

const selectKnown: Selector = async (ids, signal, context) => {
  const response = await getQwen().chat.completions.create({
    model: lane("fast"), temperature: 0, max_tokens: 256,
    messages: [{ role: "system", content: "Return only a JSON array ordering the supplied item IDs. Do not add IDs, prose or sources." }, { role: "user", content: JSON.stringify({ ids, ...context }) }],
  }, { signal, timeout: 2000, maxRetries: 0 });
  const text = response.choices[0]?.message.content;
  if (!text || text.length > 4096) throw new Error("Invalid ordering");
  return JSON.parse(text);
};

/** No user source records or model legal prose can enter the request-local ledger. */
export async function buildPlan(raw: PlanInput, deps: PlanDeps = {}, parent = new AbortController().signal): Promise<PlanResponse> {
  const input = validatePlanInput(raw);
  const timeout = Math.min(deps.timeoutMs ?? PLAN_TIMEOUT_MS, PLAN_TIMEOUT_MS);
  const deadline = Date.now() + timeout;
  return bounded(async signal => {
    const createdAt = new Date().toISOString();
    const tools: string[] = [];
    const warnings = ["Source binding establishes provenance, not applicability or completeness. Search matches and unresolved items need checking."];
    const call = requestTools(deps, signal, tools, warnings, deadline);
    const ledger = new Map<string, PlanSource>();
    const items: PlanItem[] = [];
    function guide(id: string, label: string, url: string, excerpt: string) {
      ledger.set(id, { id, kind: "guide", label, url, excerpt });
      return id;
    }
    function item(id: string, category: PlanItem["category"], title: string, body: string, sourceIds: string[] = []) {
      items.push({ id, category, title, body, sourceIds, needsCheck: true });
    }
    const checklistEntity = guide("guide:entity", "The founder legal checklist", CHECKLIST, ENTITY);
    const state = input.formationState;
    let catalog: string | null = null;
    if (state && input.entityType) {
      const returned = await call("formation.requirements", { state, entityType: input.entityType });
      const header = `Formation requirements — ${input.entityType === "llc" ? "LLC" : "nonprofit corporation"} in ${state} (US-${state}):`;
      if (returned?.startsWith(header + "\n") && returned.includes("\nREQUIRED (collect ALL of these from your user, in conversation):\n")) {
        catalog = returned;
        ledger.set("catalog:formation", { id: "catalog:formation", kind: "catalog", label: header.slice(0, -1), url: "https://corpuslaw.us/formation", excerpt: header });
        item("entity", "entity", input.mode === "formed" ? "Review the existing entity" : "Review the selected entity and formation state", header, ["catalog:formation", checklistEntity]);
        if (input.mode !== "formed") {
          const sections = returned.split(/\n\n/).filter(section => section.startsWith("REQUIRED (") || section.startsWith(`STATE-SPECIFIC QUESTIONS for ${state} (`));
          for (const [index, section] of sections.entries()) {
            const body = section.split("\n").filter(line => line.startsWith("- ")).join("\n");
            if (!body || body.length > 3000) {
              warnings.push("Some formation intake fields could not be displayed; check the complete intake with Corpus before proceeding.");
              continue;
            }
            const id = `catalog:intake:${index}`;
            ledger.set(id, { id, kind: "catalog", label: `${state} formation intake fields`, url: "https://corpuslaw.us/formation", excerpt: body });
            item(`intake_${index}`, "entity", index === 0 ? "Prepare these details for formation" : `Check the ${state} formation questions`, body, [id]);
          }
        }
      } else if (returned) warnings.push("The formation catalog format or jurisdiction could not be verified; its requirements and prices were withheld.");
    }
    if (!catalog) item("entity", "entity", "Review entity and formation-state choices", ENTITY, [checklistEntity]);
    warnings.push(state && input.entityType
      ? `Formation catalog items concern ${state} and ${input.entityType} only; they do not establish operating-state requirements. ${input.mode === "formed" ? "Already-formed mode does not recommend a new formation." : ""}`.trim()
      : "Formation state or entity is not selected. No entity type or formation jurisdiction has been assumed.");

    const raText = input.entityType === "nonprofit" ? "The registered-agent discussion in the linked checklist concerns LLCs. Check the nonprofit-specific requirements for the selected state." : RA;
    item("registered_agent", "registered_agent", "Check the registered-agent or registered-office rules", raText, [guide("guide:ra", "The founder legal checklist — registered agents", CHECKLIST, RA)]);
    item("ein", "ein", "Determine whether an EIN is needed", input.entityType === "nonprofit"
      ? "The single-member LLC exception in the linked guide is specific to LLCs. Check the IRS requirements for this nonprofit. Apply directly through the IRS for free."
      : EIN + " Apply directly through the IRS for free.", [guide("guide:ein", "After forming an LLC — EIN", GUIDE + "#step-ein", EIN), guide("guide:irs", "IRS — single-member LLC guidance", "https://www.irs.gov/businesses/small-businesses-self-employed/single-member-limited-liability-companies", "Official IRS page. No excerpt was retrieved; open the page for the current guidance.")]);
    item("annual_report", "annual_report", "Check reports and recurring state obligations", input.entityType === "nonprofit"
      ? "Check the selected state's nonprofit reporting requirements; the linked checklist describes LLCs." : ANNUAL,
      [guide("guide:annual", "The founder legal checklist — recurring fees", CHECKLIST, ANNUAL)]);
    if (catalog && state) {
      const duties = catalog.split(/\n\n/).find(s => s.startsWith(`AFTER-FORMATION DUTIES in ${state} —`));
      for (const [i, line] of (duties?.split("\n").filter(l => l.startsWith("- ")) ?? []).slice(0, 4).entries()) {
        const body = line.slice(2);
        if (!body || body.length > 3000) continue;
        const id = `catalog:duty:${i}`;
        ledger.set(id, { id, kind: "catalog", label: `${state} formation catalog — after-formation duty`, url: "https://corpuslaw.us/formation", excerpt: body });
        item(`formation_duty_${i}`, /annual|report|franchise/i.test(body) ? "annual_report" : "entity", `${state} formation catalog: after-formation duty`, body, [id]);
      }
    }
    item("state_tax", "state_tax", "Check tax registration in the operating state", input.operatingState
      ? `Operating state: ${input.operatingState}. Tax registration applicability has not been determined. Check the rules using the actual activity and tax situation.`
      : "Operating state is not selected. Tax registration applicability has not been determined.");

    async function search(query: string, jurisdiction: string, jurisdictionName: string, itemId: string) {
      const text = await call("law.search", { query, jurisdiction, mode: "keyword", limit: 2 });
      const sources = text ? parseSearch(text, jurisdictionName) : [];
      for (const source of sources) ledger.set(source.id, source);
      items.find(i => i.id === itemId)!.sourceIds.push(...sources.map(s => s.id));
      if (!sources.length) warnings.push(`No usable ${jurisdiction} source records were retrieved; this does not establish that no requirements apply.`);
      return sources;
    }
    if (catalog && state) await search("annual report", state, STATES[state], "annual_report");
    const taxSources = input.operatingState ? await search("business tax registration", input.operatingState, STATES[input.operatingState], "state_tax") : [];
    if (taxSources[0]?.nodeId && input.operatingState) {
      const text = await call("law.get_node", { id: taxSources[0].nodeId });
      const detail = text ? parseNode(text, taxSources[0].nodeId, STATES[input.operatingState]) : null;
      if (detail) ledger.set(detail.id, detail);
      else warnings.push("Full provision detail could not be verified; the search excerpt remains unresolved.");
    }
    const coverage = input.operatingState && input.operatingCity ? await call("law.list_coverage", {}) : null;
    const local = coverage && input.operatingState ? exactLocalCoverage(coverage, input.operatingState, input.operatingCity) : null;
    item("local", "local", local ? "Review local source matches" : "Local coverage needs checking", local
      ? `Coverage confirms a searchable entry for ${local.name} (${local.code}); it does not establish which rules apply to this activity.`
      : "No exact, unambiguous, searchable coverage entry was confirmed for the operating city. Local requirements have not been determined.");
    if (local) await search("business license", local.code, local.name, "local");
    else warnings.push("Local coverage gap: no local search was run.");

    const lines = catalog?.split("\n").filter(l => /^(?:PRICE(?: \(live\))?:|FOUNDING DISCOUNT:|EXPEDITE \(|SKIP REVIEW \(|TENNESSEE MEMBERS:|EIN ADD-ON: temporarily unavailable)/.test(l)) ?? [];
    const validPrice = lines.filter(l => /^PRICE \(live\): \$\d+(?:,\d{3})*\.\d{2} all-in — /.test(l)).length === 1 &&
      lines.filter(l => /^PRICE/.test(l)).length === 1 && lines.length <= 10 &&
      lines.every(l => l.length <= 6000) && Buffer.byteLength(lines.join("\n")) <= 16384;
    const pricing = { available: input.mode === "ready" && validPrice, state, lines: input.mode === "ready" && validPrice ? lines : [], checkedAt: new Date().toISOString() };
    if (input.mode === "ready" && !pricing.available) warnings.push("Current pricing is unavailable; no price or founding offer has been assumed.");

    const selector = deps.select ?? (process.env.QWEN_API_KEY && process.env.QWEN_BASE_URL ? selectKnown : undefined);
    if (selector && deadline - Date.now() < 2500) {
      warnings.push("Qwen ordering was skipped to finish within the planning deadline; deterministic sourced items are shown.");
    } else if (selector) {
      try {
        const selected = await bounded(s => selector(items.map(i => i.id), s, { input, items: items.map(({ id, title, category }) => ({ id, title, category })) }), signal, Math.min(deps.modelTimeoutMs ?? 2000, 2000));
        if (!Array.isArray(selected) || selected.length > 20 || selected.some(id => typeof id !== "string")) throw new Error("Invalid selection");
        const known = new Set(items.map(i => i.id));
        const ids = [...new Set(selected.filter(id => known.has(id)))];
        if (ids.length !== selected.length) warnings.push("Unknown or repeated model item IDs were ignored.");
        items.sort((a, b) => (ids.includes(a.id) ? ids.indexOf(a.id) : 100) - (ids.includes(b.id) ? ids.indexOf(b.id) : 100));
        tools.push("qwen.order_known_items");
      } catch {
        signal.throwIfAborted();
        warnings.push("Qwen ordering was unavailable; deterministic sourced items are shown.");
      }
    } else warnings.push("Qwen ordering is not configured; deterministic sourced items are shown.");
    return { version: 1, createdAt, items, sources: [...ledger.values()], pricing, tools, warnings };
  }, parent, timeout);
}

export async function handoffPlan(raw: PlanInput, deps: PlanDeps = {}, parent = new AbortController().signal): Promise<PlanHandoff> {
  const input = validatePlanInput(raw);
  if (input.mode !== "ready" || !input.formationState || !input.entityType) throw new PlanError(400, "Choose ready mode, a formation state and an entity before continuing.");
  return bounded(async signal => {
    const text = await requestTools(deps, signal, [], [])("formation.handoff", { entityType: input.entityType, state: input.formationState, ...(input.activity ? { businessActivity: input.activity } : {}) });
    if (!text) throw new PlanError(502, "Formation handoff is unavailable.");
    // Only an entire, bare URL line from the successful hosted tool is acceptable.
    const links = text.split("\n").map(l => l.trim()).filter(l => /^https?:\/\//.test(l));
    if (links.length !== 1) throw new PlanError(502, "Formation handoff is unavailable.");
    const rawUrl = links[0];
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new PlanError(502, "Formation handoff is unavailable."); }
    if (url.origin !== "https://corpuslaw.us" || url.pathname !== "/formation" || url.username || url.password || url.port ||
      !/^https:\/\/corpuslaw\.us\/formation#prefill=[A-Za-z0-9_-]+(?:&(?:src|ref)=[A-Za-z0-9_.~-]+)*$/.test(rawUrl)) throw new PlanError(502, "Formation handoff is unavailable.");
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (["src", "ref"].some(key => fragment.getAll(key).length > 1)) throw new PlanError(502, "Formation handoff is unavailable.");
    const missingBlock = text.match(/(?:^|\n)STILL MISSING:\n((?:- [^\n]+\n?)+)/)?.[1];
    const errorsBlock = text.match(/(?:^|\n)BLOCKING ERRORS \(fix these\):\n((?:- [^\n]+\n?)+)/)?.[1];
    const missing = [missingBlock, errorsBlock].flatMap(b => b ? b.trim().split("\n").map(l => l.slice(2)) : []);
    if ((!missing.length && !/^✓ Draft COMPLETE — /m.test(text)) || missing.length > 40 || missing.some(l => l.length > 500)) throw new PlanError(502, "Formation handoff is unavailable.");
    // Append query UTMs without reserializing the returned query/fragment attribution.
    const hash = rawUrl.indexOf("#");
    const campaign = new URLSearchParams();
    for (const key of CAMPAIGN_KEYS) if (input.campaign[key]) campaign.set(key, input.campaign[key]!);
    const before = rawUrl.slice(0, hash);
    const query = campaign.toString();
    return { url: before + (query ? (before.includes("?") ? "&" : "?") + query : "") + rawUrl.slice(hash), missing };
  }, parent, Math.min(deps.timeoutMs ?? PLAN_TIMEOUT_MS, PLAN_TIMEOUT_MS));
}
