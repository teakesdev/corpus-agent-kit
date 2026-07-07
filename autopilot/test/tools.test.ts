import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupNaics } from "../src/tools/naics.js";
import { searchLaw } from "../src/tools/law-search.js";
import { formatChecklist } from "../src/tools/checklist.js";
import { buildHandoffUrl, validateDraft } from "../src/tools/handoff.js";

afterEach(() => vi.unstubAllGlobals());

describe("lookupNaics", () => {
  it("scores keyword matches", () => {
    const hits = lookupNaics("I bake sourdough bread at home");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toHaveProperty("code");
  });
  it("returns [] for empty input", () => expect(lookupNaics("")).toEqual([]));
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
    const decoded = JSON.parse(Buffer.from(url.searchParams.get("prefill")!, "base64url").toString());
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
