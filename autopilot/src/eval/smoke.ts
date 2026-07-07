/** Live eval: runs scenarios against real Qwen + a Corpus backend. Costs a few cents. */
import scenarios from "./scenarios.json" with { type: "json" };
import { runAutopilot } from "../agent.js";

// Default the eval to a LOCAL Corpus so repeated runs never spend the production
// project's Vercel transfer quota. Law search POSTs to /api/mcp, which is not
// edge-cacheable, so every eval search re-streams from the function — running the
// suite against prod is what helped burn Fast Origin Transfer. Override
// CORPUS_BASE_URL for a one-off hosted check; hitting prod requires an explicit
// ALLOW_PROD_EVAL=1 opt-in. (law-search reads this env lazily, so setting it here
// — after the import but before runAutopilot is called — takes effect.)
process.env.CORPUS_BASE_URL ||= "http://localhost:3000";
if (/corpuslaw\.us/i.test(process.env.CORPUS_BASE_URL) && process.env.ALLOW_PROD_EVAL !== "1") {
  console.error(
    `Refusing to run the eval against production (${process.env.CORPUS_BASE_URL}).\n` +
      `Point CORPUS_BASE_URL at a local/preview Corpus, or set ALLOW_PROD_EVAL=1 to override.`,
  );
  process.exit(2);
}
console.log(`eval target: ${process.env.CORPUS_BASE_URL}`);

let failed = 0;
for (const s of scenarios as any[]) {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let last: Awaited<ReturnType<typeof runAutopilot>> | null = null;
  for (const turn of s.turns) {
    history.push({ role: "user", content: turn });
    last = await runAutopilot(history);
    history.push({ role: "assistant", content: last.reply });
  }
  const toolOk = s.expect.toolCalledAnyOf.some((t: string) => last!.toolCalls.includes(t));
  const decoded = last!.handoffUrl
    ? Buffer.from(new URL(last!.handoffUrl).searchParams.get("prefill")!, "base64url").toString()
    : "";
  const handoffOk = s.expect.handoffContains.every((frag: string) => decoded.includes(frag));
  const ok = toolOk && handoffOk;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.name}  tools=[${last!.toolCalls.join(",")}] handoff=${last!.handoffUrl ?? "none"}`);
}
process.exit(failed ? 1 : 0);
