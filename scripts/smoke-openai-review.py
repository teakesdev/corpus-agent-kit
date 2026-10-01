#!/usr/bin/env python3
"""Bounded anonymous backend checks; never a substitute for client review cases."""
import argparse
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
import re
import urllib.request

ENDPOINT = "https://corpuslaw.us/api/mcp/openai"
ALLOWED = frozenset({"law.list_coverage", "law.search", "law.get_node",
                     "formation.requirements", "formation.lookup_naics"})


def call(name, arguments):
    if name not in ALLOWED:
        raise ValueError("This review smoke test allows only read-only tools")
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": name, "arguments": arguments}}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=25) as response:
        result = json.loads(response.read(2 * 1024 * 1024))
    if result.get("error"):
        raise RuntimeError(str(result["error"]))
    result = result["result"]
    structured = result.get("structuredContent", {})
    if result.get("isError") or structured.get("isError"):
        raise RuntimeError(str(structured.get("text", result.get("content"))))
    text = structured.get("text") or "\n".join(c.get("text", "") for c in result.get("content", []))
    return {"tool": name, "arguments": arguments, "text": text}


def run():
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "endpoint": ENDPOINT,
              "scope": "Anonymous backend checks only; client behavior and N1–N3 are NOT RUN.",
              "cases": []}
    def check(case, calls, predicate, note=""):
        entry = {"case": case, "calls": [], "client_behavior": "NOT RUN", "note": note}
        try:
            for name, args in calls:
                entry["calls"].append(call(name, args))
            entry["backend_result"] = "PASS" if predicate(entry["calls"]) else "FAIL"
        except Exception as error:
            entry["backend_result"] = "ERROR"
            entry["error"] = str(error)
        report["cases"].append(entry)
        return entry
    check("P1", [("formation.requirements", {"entityType": "llc", "state": "MS"})],
          lambda c: '"jurisdiction": "US-MS"' in c[0]["text"] and "principal office" in c[0]["text"])
    check("P2", [("formation.requirements", {"entityType": "nonprofit", "state": "MS"})],
          lambda c: "nonprofit" in c[0]["text"].lower() and "requiredInformation" in c[0]["text"])
    check("P3", [("formation.lookup_naics", {"businessDescription": "retail bakery making bread and pastries on site"})],
          lambda c: "311811" in c[0]["text"] and "Retail Bakeries" in c[0]["text"] and not any(code in c[0]["text"] for code in ["445240", "458210", "712120", "458310", "444140"]),
          "Checks relevant bakery code and rejects the observed unrelated retail/site alternatives.")
    p4 = check("P4", [("law.list_coverage", {}),
                       ("law.search", {"query": "limited liability company formation certificate", "jurisdiction": "MS", "mode": "keyword", "limit": 2})],
               lambda c: False,
               "Keyword mode avoids embedding/model work. Relevance must be checked against full text; a returned node alone does not pass this case.")
    if len(p4["calls"]) == 2:
        ids = [n["nodeId"] for n in json.loads(p4["calls"][1]["text"]).get("results", [])]
        if ids:
            try:
                p4["calls"].append(call("law.get_node", {"id": ids[0]}))
                text = p4["calls"][-1]["text"].lower()
                p4["backend_result"] = "PASS" if "certificate of formation" in text and "limited liability company" in text else "FAIL"
            except Exception as error:
                p4["backend_result"] = "ERROR"
                p4["error"] = str(error)
    check("P5", [("law.list_coverage", {})], lambda c: "jurisdictions" in c[0]["text"] and "placeholder" in c[0]["text"], "Coverage counts do not establish completeness or freshness.")
    report["negative_cases"] = {"N1": "NOT RUN", "N2": "NOT RUN", "N3": "NOT RUN"}
    # Keep receipts reviewable: a get_node response can include a very large
    # body. Assertions above use the complete response; evidence retains a
    # bounded excerpt, original length and SHA-256, without pretending it is full.
    for entry in report["cases"]:
        for item in entry["calls"]:
            text = item["text"]
            item["text_chars"] = len(text)
            item["text_sha256"] = hashlib.sha256(text.encode()).hexdigest()
            item["text_truncated"] = len(text) > 12000
            item["text"] = text[:12000]
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = run()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for case in report["cases"]:
        print(case["case"], case["backend_result"], "(client behavior NOT RUN)")
    raise SystemExit(0 if all(c["backend_result"] == "PASS" for c in report["cases"]) else 1)
