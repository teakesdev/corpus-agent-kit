import type OpenAI from "openai";
import { chat as realChat } from "./qwen.js";
import { searchLaw } from "./tools/law-search.js";
import { lookupNaics } from "./tools/naics.js";
import { formatChecklist, type ChecklistItem } from "./tools/checklist.js";
import { resolveHandoffUrl, validateDraft } from "./tools/handoff.js";

export interface AutopilotResult {
  reply: string;
  handoffUrl?: string;
  toolCalls: string[];
  /** Rendered output of the last format_checklist call this turn — the UI shows
   *  it directly, so the cited checklist appears even when the model narrates
   *  around it instead of echoing it. */
  checklist?: string;
}

export const SYSTEM = `You are Formation Autopilot, an open-source agent for the Corpus legal platform (corpuslaw.us).
You turn a founder's ambiguous business description into (1) a concrete, CITED launch checklist and (2) a prefilled
handoff into Corpus's human-approved formation checkout.

Rules:
- State procedural facts with citations from search_law. NEVER give legal advice or "you should" recommendations;
  say what the law requires and cite it.
- NEVER ask for, collect, or accept an SSN, ITIN, passport number, or any government ID number. If the founder
  pastes one into chat, briefly tell them not to share it here, then continue.
- INTERNATIONAL FOUNDERS — if (and only if) asked, state these as plain fixed facts, never searched, never
  given an invented citation or link: no US citizenship/residency is needed to form or own a US LLC (founders
  anywhere in the world can order); no SSN is needed to form (tax-ID steps happen later in the hosted secure
  panel); the required in-state registered agent is bundled with every order; the principal office may be
  outside the US; without an SSN/ITIN an EIN is obtained via IRS Form SS-4 by mail/fax with "Foreign" on
  line 7b; S-corp election is unavailable with any nonresident-alien shareholder (IRC § 1361(b)(1)(C)); never
  advise on home-country (e.g. China ODI) rules — out of scope.
- Ask ONE clarifying question at a time when the description is ambiguous (state? entity type? name?).
- Use lookup_naics for the business activity code.
- Any time you present requirements or steps — and ALWAYS when the founder asks for a checklist — you MUST
  call format_checklist with your cited items. Never hand-write a numbered list in prose instead.
- When format_checklist returns, reproduce its full numbered checklist (with every citation) verbatim in
  your reply — never summarize it away or replace it with more questions.
- When you have entityType, jurisdiction (US-XX), and ideally a proposed name, call finalize_handoff.
  Payment, human review, and the actual state filing all happen on the hosted platform after handoff —
  make that explicit to the founder.
- The moment the founder has stated entity type and state, call finalize_handoff — do not run more searches first.
  Research supports the checklist; it must never delay the handoff. (One exception: if search_law has not
  been called at all in this conversation, make exactly ONE search_law call for the formation requirements,
  then finalize_handoff in the same turn — the founder must get at least one cited fact.)
- If the founder explicitly asks you to prepare or finalize the handoff, your FIRST tool call that turn
  MUST be finalize_handoff — no search_law or lookup_naics calls first. Everything you need is already
  in the conversation.
- Budget: at most 3 search_law calls per user turn. If a search returns a "temporarily unavailable" message,
  do NOT retry it — proceed with what you have.`;

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_law",
      description: "Search the Corpus law database (statutes, municipal codes). Returns cited excerpts.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          jurisdiction: { type: "string", description: "Short code, e.g. MS, WY, CA-SF." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_naics",
      description: "Find NAICS activity codes for a plain-English business description.",
      parameters: { type: "object", properties: { description: { type: "string" } }, required: ["description"] },
    },
  },
  {
    type: "function",
    function: {
      name: "format_checklist",
      description: "Render checklist items as consistently formatted, citation-linked markdown.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { task: { type: "string" }, citation: { type: "string" }, nodeId: { type: "string" } },
              required: ["task"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_handoff",
      description:
        "Validate the collected draft and produce the prefilled corpuslaw.us/formation handoff URL. Call once the founder confirms entity type and state.",
      parameters: {
        type: "object",
        properties: {
          entityType: { type: "string", enum: ["llc", "nonprofit"] },
          jurisdiction: { type: "string", description: "US-XX, e.g. US-MS" },
          proposedName: { type: "string" },
          contactEmail: { type: "string" },
          naicsCode: { type: "string" },
        },
        required: ["entityType", "jurisdiction"],
      },
    },
  },
];

const REVIEW_SYSTEM = `You are the pre-handoff reviewer. Given the conversation and a candidate formation draft,
return ONLY a corrected JSON object with keys v(=1), entityType, jurisdiction, proposedName?, contactEmail?, naicsCode?.
Fix obvious inconsistencies (e.g. state named in conversation differs from draft). No commentary.`;

/** Strip a leading/trailing ``` or ```json fence (Qwen models often wrap JSON in one). */
function extractJson(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
}

interface Deps {
  chat?: typeof realChat;
}

/** Produce a stable JSON key for a tool-call args object (sorted keys). */
function canonicalArgs(args: unknown): string {
  if (typeof args !== "object" || args === null) return JSON.stringify(args);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(args as object).sort()) sorted[k] = (args as Record<string, unknown>)[k];
  return JSON.stringify(sorted);
}

export async function runAutopilot(
  history: { role: "user" | "assistant"; content: string }[],
  deps: Deps = {},
): Promise<AutopilotResult> {
  const chat = deps.chat ?? realChat;
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM }, ...history];
  const toolCalls: string[] = [];
  let handoffUrl: string | undefined;
  let checklist: string | undefined;
  const dispatchedCalls = new Set<string>();
  // The SYSTEM prompt's "at most 3 search_law calls per user turn" enforced in
  // code — qwen-flash sometimes ignores the rule and search-spirals until the
  // loop cap, never reaching finalize_handoff.
  const SEARCH_BUDGET = 3;
  let searchesExecuted = 0;

  for (let turn = 0; turn < 8; turn++) {
    const completion = await chat("fast", messages, TOOLS);
    const msg = completion.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? "", handoffUrl, toolCalls, checklist };
    }
    messages.push(msg as OpenAI.ChatCompletionMessageParam);
    for (const call of msg.tool_calls) {
      const name = call.function.name;
      toolCalls.push(name);
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave args empty; tool will report */
      }

      // Repeat-call guard: identical (name, args) pairs are not re-executed.
      const callKey = `${name}:${canonicalArgs(args)}`;
      if (dispatchedCalls.has(callKey)) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            "You already made this exact call. Use the results you have. If you have the founder's entity type and state, call finalize_handoff now.",
        });
        continue;
      }
      dispatchedCalls.add(callKey);

      let result: string;
      if (name === "search_law") {
        if (searchesExecuted >= SEARCH_BUDGET) {
          result =
            "Search budget for this reply is exhausted — do NOT search again. Use the results you already have. " +
            "If the founder has stated entity type and state, call finalize_handoff now; " +
            "otherwise ask your single most important clarifying question.";
        } else {
          searchesExecuted++;
          result = await searchLaw(String(args.query ?? ""), args.jurisdiction ? String(args.jurisdiction) : undefined);
        }
      } else if (name === "lookup_naics") {
        result = JSON.stringify(lookupNaics(String(args.description ?? "")));
      } else if (name === "format_checklist") {
        result = formatChecklist((args.items ?? []) as ChecklistItem[]);
        checklist = result;
      } else if (name === "finalize_handoff") {
        // Gate-critical step: normalize on the flagship lane, then validate
        // deterministically. Critical-lane failure → retry once → fast lane
        // with an explicit reduced-confidence marker (spec §8).
        const reviewMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: REVIEW_SYSTEM },
          ...history,
          { role: "user", content: `Candidate draft: ${JSON.stringify({ v: 1, ...args })}` },
        ];
        let reviewText = "";
        let reducedConfidence = false;
        try {
          reviewText = (await chat("critical", reviewMessages)).choices[0]?.message?.content ?? "";
        } catch {
          try {
            reviewText = (await chat("critical", reviewMessages)).choices[0]?.message?.content ?? "";
          } catch {
            reviewText = (await chat("fast", reviewMessages)).choices[0]?.message?.content ?? "";
            reducedConfidence = true;
          }
        }
        let reviewed: unknown = { v: 1, ...args };
        try {
          reviewed = JSON.parse(extractJson(reviewText));
        } catch {
          /* fall back to the un-reviewed args; validateDraft still gates */
        }
        const validated = validateDraft(reviewed);
        if (validated.ok) {
          // An email the founder never typed is a model fabrication (placeholder
          // addresses like founder@example.com show up in finalize args) — drop it
          // rather than prefill the hosted form with it.
          if (
            validated.draft.contactEmail &&
            !history.some((m) => m.content.toLowerCase().includes(validated.draft.contactEmail!.toLowerCase()))
          ) {
            delete validated.draft.contactEmail;
          }
          handoffUrl = await resolveHandoffUrl(validated.draft);
          result =
            `Handoff ready: ${handoffUrl}\n` +
            (reducedConfidence ? "(Note: the draft review ran on the fast lane — double-check the summary with the founder.)\n" : "") +
            `Tell the founder: a human reviews and approves the exact filing before anything is submitted or charged beyond checkout.`;
        } else {
          result = `Draft incomplete: ${validated.errors.join("; ")}. Ask the founder for the missing field(s).`;
        }
      } else {
        // qwen-flash occasionally invents tools it saw named in search results
        // (e.g. the hosted MCP server's list_coverage) — redirect, don't dead-end.
        result =
          `Unknown tool: ${name}. Your ONLY tools are search_law, lookup_naics, format_checklist, ` +
          `and finalize_handoff. If the founder has stated entity type and state, call finalize_handoff now.`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return {
    reply: "This is taking longer than expected — here's what I have so far. You can continue directly at " +
      (handoffUrl ?? "https://corpuslaw.us/formation") + ".",
    handoffUrl,
    toolCalls,
    checklist,
  };
}
