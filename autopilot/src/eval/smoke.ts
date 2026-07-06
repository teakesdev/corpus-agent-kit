/** Live eval: runs scenarios against real Qwen + hosted Corpus. Costs a few cents. */
import scenarios from "./scenarios.json" with { type: "json" };
import { runAutopilot } from "../agent.js";

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
