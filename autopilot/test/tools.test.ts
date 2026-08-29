import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupNaics } from "../src/tools/naics.js";
import { searchLaw } from "../src/tools/law-search.js";
import { formatChecklist } from "../src/tools/checklist.js";
import { buildHandoffUrl, validateDraft, resolveHandoffUrl } from "../src/tools/handoff.js";

afterEach(() => vi.unstubAllGlobals());

describe("lookupNaics", () => {
  it("scores keyword matches", () => {
    const hits = lookupNaics("I bake sourdough bread at home");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toHaveProperty("code");
  });
  it("returns [] for empty input", () => expect(lookupNaics("")).toEqual([]));
  // ── Relevance parity with the monorepo scorer (stopwords + plural folding + 2022 dataset) ──
  it("matches singular query words against plural titles (bakery → Retail Bakeries)", () => {
    expect(lookupNaics("neighborhood bakery").map((x) => x.code)).toContain("311811");
  });
  it("never matches on connector words like 'and' (no Land Subdivision / Hog Farming for a bakery)", () => {
    const codes = lookupNaics("neighborhood bakery selling bread and cakes").map((x) => x.code);
    expect(codes).toContain("311811");
    expect(codes).not.toContain("237210");
    expect(codes).not.toContain("112210");
  });
  it("codes a liquor store from the full Census 2022 dataset", () => {
    expect(lookupNaics("liquor store")[0]?.code).toBe("445320");
  });
  it("pins coffee shops to Snack and Nonalcoholic Beverage Bars", () => {
    expect(lookupNaics("coffee shop")[0]?.code).toBe("722515");
  });
  it("pins software development and SaaS to Custom Computer Programming Services", () => {
    expect(lookupNaics("software development")[0]?.code).toBe("541511");
    expect(lookupNaics("saas platform")[0]?.code).toBe("541511");
  });
});

describe("searchLaw", () => {
  it("POSTs a search_law tools/call and flattens content text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0", id: 1,
      result: { content: [{ type: "text", text: "§ 79-29-101 — Mississippi LLC Act…" }] },
    }))));
    const text = await searchLaw("llc formation filing fee", "MS");
    expect(text).toContain("79-29-101");
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("search_law");
    expect(body.params.arguments.jurisdiction).toBe("MS");
  });
  it("surfaces hosted errors as a readable string, never a throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 503 })));
    const text = await searchLaw("anything");
    expect(text).toMatch(/unavailable/i);
  });
});

describe("formatChecklist", () => {
  it("renders numbered items with citation links", () => {
    const md = formatChecklist([
      { task: "File the Certificate of Formation", citation: "Miss. Code § 79-29-201", nodeId: "abc-123" },
      { task: "Get an EIN" },
    ]);
    expect(md).toContain("1. File the Certificate of Formation");
    expect(md).toContain("(Miss. Code § 79-29-201 — https://corpuslaw.us/code/abc-123)");
    expect(md).toContain("2. Get an EIN");
  });
});

describe("handoff", () => {
  it("rejects a draft missing entityType/jurisdiction", () => {
    const res = validateDraft({ v: 1, proposedName: "X" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/entityType/);
  });
  it("builds a base64url prefill URL that round-trips", () => {
    const res = validateDraft({ v: 1, entityType: "llc", jurisdiction: "US-MS", proposedName: "Magnolia Loaf LLC", naicsCode: "311811" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const url = new URL(buildHandoffUrl(res.draft));
    expect(url.pathname).toBe("/formation");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#prefill=/);
    const decoded = JSON.parse(Buffer.from(url.hash.replace(/^#prefill=/, ""), "base64url").toString());
    expect(decoded.jurisdiction).toBe("US-MS");
    expect(decoded.llc.naicsCode).toBe("311811");
  });
  it("normalizes verbose entityType and non-canonical jurisdictions", () => {
    const nonprofit = validateDraft({ v: 1, entityType: "501(c)(3) nonprofit", jurisdiction: "Wyoming" });
    expect(nonprofit.ok).toBe(true);
    if (nonprofit.ok) {
      expect(nonprofit.draft.entityType).toBe("nonprofit");
      expect(nonprofit.draft.jurisdiction).toBe("US-WY");
    }
    const llc = validateDraft({ v: 1, entityType: "Limited Liability Company (LLC)", jurisdiction: "MS" });
    expect(llc.ok).toBe(true);
    if (llc.ok) {
      expect(llc.draft.entityType).toBe("llc");
      expect(llc.draft.jurisdiction).toBe("US-MS");
    }
    expect(validateDraft({ v: 1, entityType: "corporation", jurisdiction: "US-MS" }).ok).toBe(false);
    expect(validateDraft({ v: 1, entityType: "llc", jurisdiction: "Narnia" }).ok).toBe(false);
  });
  it("normalizes model casing (LLC / us-ms) instead of rejecting the draft", () => {
    const res = validateDraft({ v: 1, entityType: "LLC", jurisdiction: "us-ms", proposedName: "Gulf Coast Sourdough LLC" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.entityType).toBe("llc");
    expect(res.draft.jurisdiction).toBe("US-MS");
  });
  it("never passes unknown keys through (no PII smuggling)", () => {
    const res = validateDraft({ v: 1, entityType: "llc", jurisdiction: "US-MS", ssn: "123-45-6789" } as any);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(JSON.stringify(res.draft)).not.toContain("6789");
  });
});

describe("resolveHandoffUrl — attribution", () => {
  const draft = { v: 1, entityType: "llc", jurisdiction: "US-MS", proposedName: "Magnolia Loaf LLC", naicsCode: "311811" } as const;
  const attributed =
    "✓ Draft COMPLETE — every required MS intake field is collected.\n\n" +
    "Formation handoff link (opens fully pre-loaded on corpuslaw.us):\n" +
    "https://corpuslaw.us/formation#prefill=eyJ2IjoxfQ&src=eyJrIjoiYWJjIn0\n\nCorpus service fee: $96.00";
  const hosted = (text: string) =>
    vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })));

  it("routes through the hosted tool when a key is set, and keeps the #src= token", async () => {
    vi.stubEnv("CORPUS_API_KEY", "ck_test");
    vi.stubGlobal("fetch", hosted(attributed));
    const url = await resolveHandoffUrl(draft);
    expect(url).toContain("#prefill=");
    expect(url).toContain("&src=");
    const req = (fetch as any).mock.calls[0][1];
    expect(req.headers.Authorization).toBe("Bearer ck_test");
    const body = JSON.parse(req.body);
    expect(body.params.name).toBe("formation.handoff");
    // The hosted tool takes a bare state, not the US-XX jurisdiction form.
    expect(body.params.arguments.state).toBe("MS");
    expect(body.params.arguments.entityType).toBe("llc");
  });

  it("stays local (no network) when no key is configured — attribution is impossible without one", async () => {
    vi.stubEnv("CORPUS_API_KEY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const url = await resolveHandoffUrl(draft);
    expect(spy).not.toHaveBeenCalled();
    expect(url).toContain("#prefill=");
    expect(url).not.toContain("&src=");
  });

  it("falls back to the local link when the hosted call throws — attribution never costs the handoff", async () => {
    vi.stubEnv("CORPUS_API_KEY", "ck_test");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await resolveHandoffUrl(draft)).toContain("#prefill=");
  });

  it("falls back when the hosted tool returns a JSON-RPC error", async () => {
    vi.stubEnv("CORPUS_API_KEY", "ck_test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "rate limited" } }))));
    expect(await resolveHandoffUrl(draft)).toContain("#prefill=");
  });

  it("falls back when the hosted response carries no link (e.g. an unsupported combo refusal)", async () => {
    vi.stubEnv("CORPUS_API_KEY", "ck_test");
    vi.stubGlobal("fetch", hosted("Error: Nonprofit formation is not available in US-NH."));
    expect(await resolveHandoffUrl(draft)).toBe(buildHandoffUrl(draft as any));
  });
});
