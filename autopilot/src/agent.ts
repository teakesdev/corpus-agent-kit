import type OpenAI from "openai";
import { chat as realChat } from "./qwen.js";
import { searchLaw } from "./tools/law-search.js";
import { lookupNaics } from "./tools/naics.js";
import { formatChecklist, type ChecklistItem } from "./tools/checklist.js";
import { buildHandoffUrl, validateDraft } from "./tools/handoff.js";

export interface AutopilotResult {
  reply: string;
  handoffUrl?: string;
  toolCalls: string[];
}

const SYSTEM = `You are Formation Autopilot, an open-source agent for the Corpus legal platform (corpuslaw.us).
You turn a founder's ambiguous business description into (1) a concrete, CITED launch checklist and (2) a prefilled
handoff into Corpus's human-approved formation checkout.

Rules:
- State procedural facts with citations from search_law. NEVER give legal advice or "you should" recommendations;
  say what the law requires and cite it.
- Ask ONE clarifying question at a time when the description is ambiguous (state? entity type? name?).
- Use lookup_naics for the business activity code. Use format_checklist to render any checklist.
- When you have entityType, jurisdiction (US-XX), and ideally a proposed name, call finalize_handoff.
  Payment, human review, and the actual state filing all happen on the hosted platform after handoff —
  make that explicit to the founder.`;

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

interface Deps {
  chat?: typeof realChat;
}

export async function runAutopilot(
  history: { role: "user" | "assistant"; content: string }[],
  deps: Deps = {},
): Promise<AutopilotResult> {
  const chat = deps.chat ?? realChat;
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM }, ...history];
  const toolCalls: string[] = [];
  let handoffUrl: string | undefined;

  for (let turn = 0; turn < 8; turn++) {
    const completion = await chat("fast", messages, TOOLS);
    const msg = completion.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? "", handoffUrl, toolCalls };
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
      let result: string;
      if (name === "search_law") {
        result = await searchLaw(String(args.query ?? ""), args.jurisdiction ? String(args.jurisdiction) : undefined);
      } else if (name === "lookup_naics") {
        result = JSON.stringify(lookupNaics(String(args.description ?? "")));
      } else if (name === "format_checklist") {
        result = formatChecklist((args.items ?? []) as ChecklistItem[]);
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
          reviewed = JSON.parse(reviewText);
        } catch {
          /* fall back to the un-reviewed args; validateDraft still gates */
        }
        const validated = validateDraft(reviewed);
        if (validated.ok) {
          handoffUrl = buildHandoffUrl(validated.draft);
          result =
            `Handoff ready: ${handoffUrl}\n` +
            (reducedConfidence ? "(Note: the draft review ran on the fast lane — double-check the summary with the founder.)\n" : "") +
            `Tell the founder: a human reviews and approves the exact filing before anything is submitted or charged beyond checkout.`;
        } else {
          result = `Draft incomplete: ${validated.errors.join("; ")}. Ask the founder for the missing field(s).`;
        }
      } else {
        result = `Unknown tool: ${name}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return {
    reply: "This is taking longer than expected — here's what I have so far. You can continue directly at " +
      (handoffUrl ?? "https://corpuslaw.us/formation") + ".",
    handoffUrl,
    toolCalls,
  };
}
