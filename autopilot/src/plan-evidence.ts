import type { PlanSource } from "./plan-contract.js";
import { record, STATES } from "./plan-validation.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (s: string) => s.trim().toLowerCase();
export function lawSource(nodeId: string, label: string, excerpt: string): PlanSource {
  return { id: `law:${nodeId.toLowerCase()}`, kind: "law", nodeId: nodeId.toLowerCase(), label,
    // Inspected app/code/[...path]/page.tsx accepts the stable UUID URL.
    url: `https://corpuslaw.us/code/${nodeId.toLowerCase()}`, excerpt };
}

/** Parse only the actual numbered MCP transcript; never harvest arbitrary UUIDs/URLs. */
export function parseSearch(text: string, jurisdictionName: string): PlanSource[] {
  if (!/^\d+ of \d+ results for /m.test(text)) return [];
  const blocks = text.split(/\n\n/);
  const result: PlanSource[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = lines[0]?.match(/^\d+\. (.+)$/)?.[1];
    const id = lines.at(-1)?.match(/^   node_id: (\S+)$/)?.[1];
    const where = lines[1]?.trim().split(" · ")[0];
    if (!heading || heading.length > 400 || !id || !UUID.test(id) || clean(where ?? "") !== clean(jurisdictionName)) continue;
    const excerpt = lines.slice(2, -1).map(l => l.trim()).join("\n");
    if (!excerpt || excerpt.length > 3000) continue;
    const note = text.startsWith("NOTE:") ? text.split("\n\n")[0] + "\n" : "";
    if (note.length > 2000) continue;
    result.push(lawSource(id, heading, note + excerpt));
    if (result.length === 2) break;
  }
  return result;
}

/** get_node may prefix its JSON with an effective-date warning. Preserve it. */
export function parseNode(text: string, expectedId: string, jurisdictionName: string): PlanSource | null {
  try {
    const start = text.indexOf("{");
    if (start < 0) return null;
    const prefix = text.slice(0, start).trim();
    if (prefix.length > 2000 || (prefix && !/^(?:NOTE|WARNING|NOT YET IN EFFECT)\b/i.test(prefix))) return null;
    const node: unknown = JSON.parse(text.slice(start));
    if (!record(node) || typeof node.nodeId !== "string" || !UUID.test(node.nodeId) || node.nodeId.toLowerCase() !== expectedId.toLowerCase() ||
      typeof node.citation !== "string" || !node.citation || node.citation.length > 400 ||
      typeof node.bodyText !== "string" || !node.bodyText.trim() || !record(node.jurisdiction) ||
      typeof node.jurisdiction.name !== "string" || clean(node.jurisdiction.name) !== clean(jurisdictionName)) return null;
    const heading = prefix ? prefix + "\n" : "";
    const marker = "\n…truncated; open the source for the complete provision.";
    const bodyLimit = Math.min(3000, 5000 - heading.length);
    const body = node.bodyText.length > bodyLimit
      ? node.bodyText.slice(0, bodyLimit - marker.length) + marker : node.bodyText;
    return lawSource(node.nodeId, node.citation, heading + body);
  } catch { return null; }
}

export function exactLocalCoverage(text: string, state: string, city: string): { code: string; name: string } | null {
  // Strip only an exact selected-state suffix; another state or a second comma fails closed.
  const parts = city.split(",").map(s => s.trim());
  if (parts.length > 2 || (parts.length === 2 && ![state, STATES[state]].some(s => clean(s) === clean(parts[1])))) return null;
  const name = parts[0];
  if (!name) return null;
  const names = [name, `${name}, ${state}`, `${name}, ${STATES[state]}`].map(clean);
  const matches: { code: string; name: string }[] = [];
  for (const line of text.split("\n")) {
    const row = line.match(/^- ([A-Z0-9-]+) — (.+) \((?:municipal|city)\): (.+)$/);
    if (!row || !row[1].startsWith(`${state}-`) || !names.includes(clean(row[2]))) continue;
    const status = row[3];
    if (/PLACEHOLDER|not yet searchable/i.test(status)) continue;
    const count = status.match(/([\d,]+) searchable chunks/);
    if (!(count && Number(count[1].replace(/,/g, "")) > 0) && !/^delivered after the last daily count — searchable now;/.test(status)) continue;
    matches.push({ code: row[1], name: row[2] });
  }
  return matches.length === 1 ? matches[0] : null;
}
