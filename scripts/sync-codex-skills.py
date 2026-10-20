#!/usr/bin/env python3
"""Generate plugins/corpus-codex/skills: the OpenAI-only skill tree.

The $0-formation "mandatory first response" is a duty for the surfaces that can show
a sponsored placement beside the conversation: ChatGPT and, from the same vendor,
Codex. Every other harness gets the neutral skill (skills/ and plugins/corpus/skills).
So Codex gets its own package, whose business-formation SKILL.md is the neutral skill
plus two snippets from overlays/openai/snippets:

  first-response.md   inserted before "## When to use this"
  hard-rule.md        inserted before the neutral never-claim-to-see-an-ad rule

Nothing is removed or reworded, so the Codex skill cannot drift from the neutral one
except by those snippets. Every other generated file is the canonical file plus the
same stamp scripts/check-plugin-skill-drift.sh writes.

  python3 scripts/sync-codex-skills.py          write plugins/corpus-codex/skills
  python3 scripts/sync-codex-skills.py --check  exit 1 on any drift
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_NAMES = ("corpus-business-formation", "corpus-legal-research")
DEST = ROOT / "plugins" / "corpus-codex" / "skills"
SNIPPETS = ROOT / "overlays" / "openai" / "snippets"
OVERLAID = ("corpus-business-formation", "SKILL.md")

FIRST_RESPONSE_ANCHOR = "## When to use this\n"
HARD_RULE_ANCHOR = (
    "- **Never claim to see an ad, a sponsored placement, or anything else on the user's screen.**\n"
)
FRONTMATTER_CLOSE = re.compile(r"\n---\s*\n")


def insert_before(text: str, anchor: str, insert: str, label: str) -> str:
    at = text.find(anchor)
    if at == -1 or text.find(anchor, at + 1) != -1:
        raise SystemExit(f"{label}: anchor must appear exactly once in the neutral skill: {anchor[:70]!r}")
    return text[:at] + insert + text[at:]


def apply_overlay(neutral: str) -> str:
    out = insert_before(
        neutral, FIRST_RESPONSE_ANCHOR, (SNIPPETS / "first-response.md").read_text(encoding="utf-8"), "first-response"
    )
    return insert_before(out, HARD_RULE_ANCHOR, (SNIPPETS / "hard-rule.md").read_text(encoding="utf-8"), "hard-rule")


def stamp_text(text: str, label: str) -> str:
    """Stamp after the closing frontmatter fence (Agent Plugins v1 needs `---` at byte 0)."""
    if text.startswith("﻿"):
        text = text[1:]
    stamp = f"<!-- generated from {label} — edit there -->\n"
    if text.startswith("---"):
        match = FRONTMATTER_CLOSE.search(text[3:])
        if match is None:
            raise SystemExit(f"{label}: unterminated YAML frontmatter")
        at = match.end() + 3
        return text[:at] + stamp + text[at:]
    nl = text.find("\n")
    return text + "\n" + stamp if nl < 0 else text[: nl + 1] + stamp + text[nl + 1 :]


def packaged_files(name: str) -> list[Path]:
    src = ROOT / "skills" / name
    files = [Path("SKILL.md")]
    refs = src / "references"
    if refs.is_dir():
        files += [p.relative_to(src) for p in sorted(refs.rglob("*")) if p.is_file() and p.name != ".DS_Store"]
    return files


def build() -> dict[str, str]:
    """Relative path under plugins/corpus-codex/skills -> expected file text."""
    out: dict[str, str] = {}
    for name in SKILL_NAMES:
        for rel in packaged_files(name):
            canon = f"skills/{name}/{rel.as_posix()}"
            text = (ROOT / canon).read_text(encoding="utf-8")
            label = canon
            if (name, rel.as_posix()) == OVERLAID:
                text = apply_overlay(text)
                label = f"{canon} + overlays/openai/snippets"
            out[f"{name}/{rel.as_posix()}"] = stamp_text(text, label)
    return out


def actual_files() -> dict[str, str]:
    if not DEST.is_dir():
        return {}
    return {
        p.relative_to(DEST).as_posix(): p.read_text(encoding="utf-8")
        for p in sorted(DEST.rglob("*"))
        if p.is_file() and p.name != ".DS_Store"
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 on drift instead of writing")
    args = parser.parse_args()
    expected = build()
    if args.check:
        actual = actual_files()
        errors = [f"missing {p}" for p in sorted(expected.keys() - actual.keys())]
        errors += [f"unexpected {p}" for p in sorted(actual.keys() - expected.keys())]
        errors += [f"drift in {p}" for p in sorted(expected.keys() & actual.keys()) if expected[p] != actual[p]]
        if errors:
            sys.stderr.write("codex skill drift under plugins/corpus-codex/skills:\n")
            sys.stderr.write("".join(f"  - {e}\n" for e in errors))
            sys.stderr.write("fix: python3 scripts/sync-codex-skills.py\n")
            return 1
        print(f"ok: {len(expected)} generated Codex skill files match canonical roots + overlay")
        return 0
    if DEST.exists():
        shutil.rmtree(DEST)
    for rel, text in expected.items():
        path = DEST / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    print(f"wrote {len(expected)} generated Codex skill files under {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
