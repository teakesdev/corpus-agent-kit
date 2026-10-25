import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlan, handoffPlan } from "../src/plan.js";
import { validatePlanInput } from "../src/plan-validation.js";
import type { PlanInput } from "../src/plan-contract.js";
import { exactLocalCoverage, parseNode, parseSearch } from "../src/plan-evidence.js";
import { hostedTool, bounded, MAX_TOOL_BYTES } from "../src/plan-tools.js";
import type { ToolCall } from "../src/plan-tools.js";

const input: PlanInput = { mode: "ready", activity: "Fictional software business", formationState: "MS", operatingState: "TX", operatingCity: "Austin", entityType: "llc", campaign: {} };
const catalog = `Formation requirements — LLC in MS (US-MS):

REQUIRED (collect ALL of these from your user, in conversation):
- proposed name
- registered agent

AFTER-FORMATION DUTIES in MS — tell your user about these BEFORE they pay:
- Annual report: confirm the current due date.

EIN ADD-ON: needed for everyone.

PRICE (live): $123.00 all-in — test quote only.

FOUNDING DISCOUNT: $10 off only while slots remain; a quote does not reserve one.`;
const emptyTool = async () => "No results found.";
const uuid = "11111111-2222-3333-4444-555555555555";
const otherId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const search = (name = "Texas", id = uuid) => `1 of 1 results for "business tax registration" in TX (keyword):\n\n1. Tax Code § 1 — Registration\n   ${name} · Tax Code\n   Test source excerpt, not a conclusion.\n   node_id: ${id}`;
const coverage = "- TX-AUS — Austin (municipal): 100 provisions, 80 searchable chunks";
const node = (id = uuid, name = "Texas") => JSON.stringify({ nodeId: id, citation: "Tax Code § 1", bodyText: "Full test provision.", jurisdiction: { name } });
function fixture(overrides: Partial<Record<string, string>> = {}): ToolCall {
  return async (name, args) => overrides[name] ?? (name === "formation.requirements" ? catalog : name === "law.list_coverage" ? coverage : name === "law.get_node" ? node() : args.jurisdiction === "TX" ? search() : args.jurisdiction === "TX-AUS" ? search("Austin", otherId) : "No results found.");
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("sourced planning", () => {
  it("rejects unsupported state and client-supplied sources", () => {
    expect(() => validatePlanInput({ ...input, formationState: "ZZ" })).toThrow();
    expect(() => validatePlanInput({ ...input, sources: [] })).toThrow();
  });
  it("ignores injected model prose and fabricated item/citation IDs", async () => {
    const p = await buildPlan(input, { tool: async n => n === "formation.requirements" ? catalog : emptyTool(), select: async () => ["invented-law", "entity", "https://evil.test"] });
    expect(p.items.some(i => i.id === "invented-law")).toBe(false);
    expect(p.sources.some(s => s.kind === "law")).toBe(false);
    expect(JSON.stringify(p)).not.toContain("needed for everyone");
    expect(p.items.find(i => i.category === "ein")?.body).toContain("no employees");
  });
  it("normalizes multiline descriptions and supplies bounded context to ordering", async () => {
    expect(validatePlanInput({ ...input, activity: "software\nconsulting\tshop" }).activity).toBe("software consulting shop");
    const select = vi.fn(async () => ["entity"]);
    const plan = await buildPlan(input, { tool: fixture(), select });
    expect(select.mock.calls[0]).toEqual([expect.any(Array), expect.any(AbortSignal), expect.objectContaining({ input, items: expect.arrayContaining([expect.objectContaining({ id: "entity", category: "entity" })]) })]);
    expect(plan.items.find(i => i.id === "intake_0")?.body).toContain("proposed name");
    const formed = await buildPlan({ ...input, mode: "formed" }, { tool: fixture() });
    expect(formed.items.some(i => i.id.startsWith("intake_"))).toBe(false);
  });
  it("never creates a handoff locally", async () => {
    await expect(handoffPlan(input, { tool: emptyTool })).rejects.toThrow();
  });
  it.each([
    { mode: "other" }, { entityType: "corp" }, { operatingState: "PR" }, { formationState: "Mississippi" },
    { activity: "a".repeat(501) }, { operatingCity: "a".repeat(101) }, { activity: "line\u0000line" },
    { campaign: { ref: "x" } }, { campaign: { utm_source: "x".repeat(101) } },
    { campaign: { utm_source: "x&src=evil" } }, { campaign: [] }, { contactEmail: "a@b.test" },
  ])("rejects invalid input %j", delta => expect(() => validatePlanInput({ ...input, ...delta })).toThrow());

  it.each(["exploring", "formed"] as const)("does not assume a state/entity in %s mode", async mode => {
    const tool = vi.fn(emptyTool);
    const p = await buildPlan({ ...input, mode, formationState: null, entityType: null, operatingState: null, operatingCity: "" }, { tool });
    expect(tool).not.toHaveBeenCalled();
    expect(p.pricing).toMatchObject({ available: false, state: null, lines: [] });
    expect(p.warnings.join(" ")).toContain("No entity type");
    expect(p.items.every(i => i.needsCheck)).toBe(true);
  });
  it("binds only same-request sources and ignores model-injected citations", async () => {
    const p = await buildPlan(input, { tool: fixture(), select: async () => ["ein", `law:${otherId}`, "MS § invented"] });
    expect(p.sources.filter(s => s.kind === "law").map(s => s.nodeId)).toEqual([uuid, otherId]);
    expect(p.items[0].id).toBe("ein");
    expect(p.items.every(i => i.sourceIds.every(id => p.sources.some(s => s.id === id)))).toBe(true);
    expect(p.sources.find(s => s.nodeId === uuid)).toMatchObject({ label: "Tax Code § 1", excerpt: "Full test provision.", url: `https://corpuslaw.us/code/${uuid}` });
    expect(JSON.stringify(p)).not.toContain("MS § invented");
    const second = await buildPlan(input, { tool: fixture({ "law.search": "No results found." }) });
    expect(second.sources.some(s => s.kind === "law")).toBe(false);
  });
  it("keeps formation and operating jurisdictions separate", async () => {
    const tool = vi.fn(fixture({ "law.search": search("Mississippi") }));
    const p = await buildPlan(input, { tool });
    expect(tool.mock.calls.some(([n, a]) => n === "law.search" && a.jurisdiction === "TX")).toBe(true);
    expect(p.items.find(i => i.id === "state_tax")?.sourceIds).toEqual([]);
    expect(p.items.find(i => i.id === "state_tax")?.body).toContain("Operating state: TX");
    expect(p.sources.filter(s => s.kind === "law")).toHaveLength(1); // MS search only
    expect(p.items.every(i => i.needsCheck)).toBe(true);
  });
  it.each(["", "- TX-AUS — Austin (municipal): PLACEHOLDER — listed but not yet searchable", "- TX-AUS — Austin (municipal): 100 provisions, 0 searchable chunks", "- CA-AUS — Austin (municipal): 100 provisions, 10 searchable chunks", "- TX-AUS — Austin City (municipal): 100 provisions, 10 searchable chunks", coverage + "\n- TX-AUS2 — Austin (municipal): 100 provisions, 10 searchable chunks"])("does not search local law without exact unambiguous searchable coverage: %s", async cov => {
    const tool = vi.fn(fixture({ "law.list_coverage": cov || "Coverage temporarily unavailable." }));
    const p = await buildPlan(input, { tool });
    expect(tool.mock.calls.some(([n, a]) => n === "law.search" && a.jurisdiction === "TX-AUS")).toBe(false);
    expect(p.warnings.join(" ")).toContain("Local coverage gap");
  });
  it("accepts exact delivered searchable city entries", () => {
    expect(exactLocalCoverage("- TX-AUS — Austin (municipal): delivered after the last daily count — searchable now; counts appear after the next daily refresh", "TX", "Austin")?.code).toBe("TX-AUS");
  });
  it("degrades on search and model failure without provider diagnostics", async () => {
    const p = await buildPlan(input, { tool: async (n, a, s) => { if (n === "law.search") throw new Error("secret provider diagnostic"); return fixture()(n, a, s); }, select: async () => { throw new Error("secret provider diagnostic"); } });
    expect(p.items.length).toBeGreaterThanOrEqual(6);
    expect(p.sources.some(s => s.kind === "law")).toBe(false);
    expect(p.warnings.join(" ")).toContain("Qwen ordering was unavailable");
    expect(JSON.stringify(p)).not.toContain("secret provider");
  });
  it.each([catalog.replace("PRICE (live): $123.00 all-in — test quote only.", "PRICE: temporarily unavailable"), catalog.replace("MS (US-MS)", "TX (US-TX)"), "Error: unsupported entity", catalog.replace("PRICE (live): $123.00 all-in — test quote only.", "PRICE (live): unknown")])("withholds unavailable or unverified pricing", async text => {
    const p = await buildPlan(input, { tool: fixture({ "formation.requirements": text }) });
    expect(p.pricing).toMatchObject({ available: false, lines: [] });
  });
  it("preserves the complete current price and offer qualifier", async () => {
    const p = await buildPlan(input, { tool: fixture() });
    expect(p.pricing).toMatchObject({ available: true, state: "MS", lines: ["PRICE (live): $123.00 all-in — test quote only.", "FOUNDING DISCOUNT: $10 off only while slots remain; a quote does not reserve one."] });
    expect(JSON.stringify(p)).not.toContain("needed for everyone");
  });
  it("uses a bounded six-tool budget", async () => {
    const tool = vi.fn(fixture());
    await buildPlan(input, { tool });
    expect(tool).toHaveBeenCalledTimes(6);
  });
  it("cancels a hung tool and degrades deterministically", async () => {
    let observed: AbortSignal | undefined;
    const p = await buildPlan({ ...input, operatingState: null, operatingCity: "" }, { toolTimeoutMs: 5, tool: async (_n, _a, signal) => { observed = signal; return new Promise(() => {}); } });
    expect(observed?.aborted).toBe(true);
    expect(p.pricing.available).toBe(false);
    expect(p.warnings.join(" ")).toContain("formation.requirements was unavailable");
  });
  it("cancels a hung model without losing the plan", async () => {
    let observed: AbortSignal | undefined;
    const p = await buildPlan(input, { tool: fixture(), modelTimeoutMs: 5, select: async (_ids, s) => { observed = s; return new Promise(() => {}); } });
    expect(observed?.aborted).toBe(true);
    expect(p.items.length).toBeGreaterThanOrEqual(6);
    expect(p.tools).not.toContain("qwen.order_known_items");
  });
  it("enforces total duration even with an uncooperative tool", async () => {
    await expect(buildPlan(input, { timeoutMs: 5, tool: async () => new Promise(() => {}) })).rejects.toThrow("timed out");
  });
  it("parses node warnings and rejects mismatched/malformed evidence", () => {
    expect(parseNode("NOT YET IN EFFECT: test warning.\n" + node(), uuid, "Texas")?.excerpt).toContain("NOT YET IN EFFECT");
    expect(parseNode(node(otherId), uuid, "Texas")).toBeNull();
    expect(parseNode(node(uuid, "Mississippi"), uuid, "Texas")).toBeNull();
    expect(parseNode("arbitrary prose " + node(), uuid, "Texas")).toBeNull();
    expect(parseNode(node() + " broken", uuid, "Texas")).toBeNull();
    expect(parseSearch(search("Texas", "fabricated"), "Texas")).toEqual([]);
    expect(parseSearch(`node_id: ${uuid}`, "Texas")).toEqual([]);
    expect(parseSearch("NOTE: results are PARTIAL\n\n" + search(), "Texas")[0].excerpt).toContain("PARTIAL");
  });
});

describe("hosted formation handoff", () => {
  const link = "https://corpuslaw.us/formation#prefill=abc_DEF-1&src=opaque.token-D&ref=Original_Code";
  const text = `Draft saved into the link, but NOT yet complete.\n\nSTILL MISSING:\n- proposed name\n- contact email\n\nOr hand off now:\n${link}`;
  it("uses minimal hosted draft and preserves attribution byte-for-byte while appending UTMs before hash", async () => {
    const tool = vi.fn(async () => text);
    const result = await handoffPlan({ ...input, campaign: { utm_source: "qwen", utm_campaign: "founder_launch" } }, { tool });
    expect(tool.mock.calls[0]).toEqual(["formation.handoff", { entityType: "llc", state: "MS", businessActivity: input.activity }, expect.any(AbortSignal)]);
    expect(result).toEqual({ url: link.replace("#", "?utm_source=qwen&utm_campaign=founder_launch#"), missing: ["proposed name", "contact email"] });
  });
  it("returns complete hosted draft without invented missing fields", async () => {
    expect(await handoffPlan(input, { tool: async () => `✓ Draft COMPLETE — every required intake field is collected.\n\n${link}` })).toEqual({ url: link, missing: [] });
  });
  it.each(["exploring", "formed"] as const)("rejects %s without calling the tool", async mode => {
    const tool = vi.fn(emptyTool);
    await expect(handoffPlan({ ...input, mode }, { tool })).rejects.toThrow();
    expect(tool).not.toHaveBeenCalled();
  });
  it.each(["https://evil.test/formation#prefill=abc", "https://corpuslaw.us.evil.test/formation#prefill=abc", "https://corpuslaw.us/formation/other#prefill=abc", "https://corpuslaw.us:443/formation#prefill=abc", "https://user@corpuslaw.us/formation#prefill=abc", "http://corpuslaw.us/formation#prefill=abc", "https://corpuslaw.us/formation#prefill=abc&redirect=evil", "https://corpuslaw.us/x/../formation#prefill=abc"])("fails closed for malicious/noncanonical handoff URL %s", async url => {
    await expect(handoffPlan(input, { tool: async () => text.replace(link, url) })).rejects.toThrow("unavailable");
  });
  it("fails closed when missing-field status cannot be parsed", async () => {
    await expect(handoffPlan(input, { tool: async () => link })).rejects.toThrow("unavailable");
  });
  it.each(["?src=original&ref=old", "?redirect=https://evil.test"])("rejects unsupported hosted query %s", async query => {
    await expect(handoffPlan(input, { tool: async () => text.replace(link, link.replace("#", query + "#")) })).rejects.toThrow("unavailable");
  });
  it("rejects duplicate attribution fragment values", async () => {
    await expect(handoffPlan(input, { tool: async () => text.replace(link, link + "&src=other") })).rejects.toThrow("unavailable");
  });
  it.each([{ formationState: null }, { entityType: null }])("requires explicit formation choices: %j", async delta => {
    const tool = vi.fn(emptyTool);
    await expect(handoffPlan({ ...input, ...delta }, { tool })).rejects.toThrow();
    expect(tool).not.toHaveBeenCalled();
  });
});

describe("MCP wire transport", () => {
  it.each([true, false])("reads the real text envelope (structured=%s) and forwards configured API key", async structured => {
    vi.stubEnv("CORPUS_API_KEY", "test-key-not-a-secret");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ result: structured ? { structuredContent: { text: catalog } } : { content: [{ type: "text", text: catalog }] } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await hostedTool("formation.requirements", { state: "MS", entityType: "llc" }, new AbortController().signal)).toBe(catalog);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options.headers).toMatchObject({ Authorization: "Bearer test-key-not-a-secret" });
    expect(JSON.parse(options.body as string).params.name).toBe("formation.requirements");
  });
  it.each([{ error: { message: "provider diagnostics" } }, { result: { isError: true, content: [{ type: "text", text: catalog }] } }, { result: { structuredContent: { isError: true, text: catalog } } }, { result: { nodes: [{ node_id: uuid }] } }])("fails closed on malformed/failed tool envelopes", async body => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body)));
    await expect(hostedTool("law.search", {}, new AbortController().signal)).rejects.toThrow();
  });
  it("bounds response bytes before JSON parsing", async () => {
    vi.stubGlobal("fetch", async () => new Response("a".repeat(MAX_TOOL_BYTES + 1)));
    await expect(hostedTool("law.search", {}, new AbortController().signal)).rejects.toThrow("too large");
  });
  it("handles already-cancelled requests", async () => {
    const controller = new AbortController(); controller.abort();
    const work = vi.fn(async () => 1);
    await expect(bounded(work, controller.signal, 10)).rejects.toThrow("timed out");
    expect(work).not.toHaveBeenCalled();
  });
});
