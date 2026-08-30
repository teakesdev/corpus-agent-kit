#!/usr/bin/env bash
# Regenerate plugins/corpus/skills from the canonical skill roots and fail on
# drift. Generated SKILL.md files are the canonical bytes plus a stamp line
# immediately after the closing frontmatter fence (Agent Plugins v1 requires
# `---` at byte 0, so the stamp must never be first).
#
# Usage:
#   scripts/check-plugin-skill-drift.sh          # compare, exit 1 on drift
#   scripts/check-plugin-skill-drift.sh --write  # write generated copies
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_NAMES=(
  corpus-business-formation
  corpus-legal-research
)
PLUGIN_SKILLS="$ROOT/plugins/corpus/skills"
WRITE=0
if [[ "${1:-}" == "--write" ]]; then
  WRITE=1
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--write]" >&2
  exit 2
fi

python3 - "$ROOT" "$WRITE" "${CANONICAL_NAMES[@]}" <<'PY'
from __future__ import annotations

import hashlib
import re
import shutil
import sys
import tempfile
from pathlib import Path

root = Path(sys.argv[1])
write = sys.argv[2] == "1"
names = sys.argv[3:]
plugin_skills = root / "plugins" / "corpus" / "skills"
frontmatter_close = re.compile(r"\n---\s*\n")
stamp_line = re.compile(
    r"^<!-- generated from (?P<rel>skills/[^ ]+/SKILL\.md) — edit there -->\n",
    re.M,
)


def stamp_skill(text: str, rel: str) -> str:
    if text.startswith("\ufeff"):
        text = text[1:]
    if not text.startswith("---"):
        raise SystemExit(f"{rel}: missing YAML frontmatter")
    match = frontmatter_close.search(text[3:])
    if match is None:
        raise SystemExit(f"{rel}: unterminated YAML frontmatter")
    insert_at = match.end() + 3
    stamp = f"<!-- generated from {rel} — edit there -->\n"
    return text[:insert_at] + stamp + text[insert_at:]


def strip_stamp(text: str) -> tuple[str, str | None]:
    if text.startswith("\ufeff"):
        text = text[1:]
    match = frontmatter_close.search(text[3:])
    if match is None:
        return text, None
    rest_at = match.end() + 3
    rest = text[rest_at:]
    stamped = stamp_line.match(rest)
    if stamped is None:
        return text, None
    return text[:rest_at] + rest[stamped.end() :], stamped.group("rel")


def sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def frontmatter_description(text: str) -> str:
    match = re.search(r"^description:\s*(.*)$", text, re.M)
    if not match:
        return ""
    value = match.group(1).strip()
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    return value


def check_doctrine() -> list[str]:
    formation = (root / "skills/corpus-business-formation/SKILL.md").read_text(
        encoding="utf-8"
    )
    research = (root / "skills/corpus-legal-research/SKILL.md").read_text(encoding="utf-8")
    errors: list[str] = []
    formation_desc = frontmatter_description(formation)
    if "Also use for questions about current US" in formation:
        errors.append("formation skill still claims law-research triggers")
    if re.search(r"permits, zoning, licensing", formation_desc):
        errors.append("formation skill description still claims law-research triggers")
    for needle in ("1,000", "1000", "5,000", "5000", "$0.005", "0.005"):
        if needle in research:
            errors.append(f"research skill hardcodes quota number {needle!r}")
    if re.search(r"\b100\b", research):
        errors.append("research skill hardcodes quota number 100")
    if "account.status" not in research or "Before quoting" not in research:
        errors.append("research skill missing account.status-before-quoting rule")
    if "referral_code" not in research or "Never persist" not in research:
        errors.append("research skill missing referral suppression rule")
    if "Social Security" not in formation or "cannot file" not in formation:
        errors.append("formation skill missing never-SSN / never-file")
    if "Social Security" not in research or "never files" not in research:
        errors.append("research skill missing never-SSN / never-file")
    return errors


doctrine_errors = check_doctrine()
if doctrine_errors:
    sys.stderr.write("skill doctrine:\n")
    for err in doctrine_errors:
        sys.stderr.write(f"  - {err}\n")
    raise SystemExit(1)

tmp = Path(tempfile.mkdtemp(prefix="corpus-plugin-skills-"))
try:
    expected_hashes: dict[str, str] = {}
    for name in names:
        rel = f"skills/{name}/SKILL.md"
        src = root / rel
        if not src.is_file():
            raise SystemExit(f"missing canonical skill: {rel}")
        canonical = src.read_text(encoding="utf-8")
        generated = stamp_skill(canonical, rel)
        if not generated.startswith("---"):
            raise SystemExit(f"{rel}: stamp must not precede frontmatter")
        stripped, stamp_rel = strip_stamp(generated)
        if stamp_rel != rel:
            raise SystemExit(f"{rel}: stamp path mismatch ({stamp_rel!r})")
        if stripped != canonical.lstrip("\ufeff"):
            raise SystemExit(f"{rel}: stamped copy is not reversible to canonical")
        dest_dir = tmp / name
        dest_dir.mkdir(parents=True)
        dest = dest_dir / "SKILL.md"
        dest.write_text(generated, encoding="utf-8")
        expected_hashes[rel] = sha256(canonical.lstrip("\ufeff"))

    if write:
        if plugin_skills.exists():
            shutil.rmtree(plugin_skills)
        plugin_skills.mkdir(parents=True)
        for name in names:
            dest_dir = plugin_skills / name
            dest_dir.mkdir(parents=True)
            shutil.copy2(tmp / name / "SKILL.md", dest_dir / "SKILL.md")
        print(f"wrote {len(names)} generated skill copies under {plugin_skills}")
        raise SystemExit(0)

    if not plugin_skills.is_dir():
        raise SystemExit(
            f"missing {plugin_skills} — run scripts/check-plugin-skill-drift.sh --write"
        )

    errors: list[str] = []
    expected_names = set(names)
    actual_names = {p.name for p in plugin_skills.iterdir() if p.is_dir()}
    extra = sorted(actual_names - expected_names)
    missing = sorted(expected_names - actual_names)
    if extra:
        errors.append("unexpected plugin skill dirs: " + ", ".join(extra))
    if missing:
        errors.append("missing plugin skill dirs: " + ", ".join(missing))

    for name in names:
        rel = f"skills/{name}/SKILL.md"
        generated_path = plugin_skills / name / "SKILL.md"
        expected_path = tmp / name / "SKILL.md"
        if not generated_path.is_file():
            errors.append(f"missing generated copy: plugins/corpus/skills/{name}/SKILL.md")
            continue
        actual = generated_path.read_text(encoding="utf-8")
        expected = expected_path.read_text(encoding="utf-8")
        if actual != expected:
            errors.append(
                f"drift in plugins/corpus/skills/{name}/SKILL.md "
                "(edit the canonical skill, then --write)"
            )
        stripped, stamp_rel = strip_stamp(actual)
        canonical = (root / rel).read_text(encoding="utf-8").lstrip("\ufeff")
        if stamp_rel != rel:
            errors.append(
                f"plugins/corpus/skills/{name}/SKILL.md is missing or has the wrong stamp"
            )
        if stripped != canonical:
            errors.append(
                f"plugins/corpus/skills/{name}/SKILL.md is not byte-identical to {rel} after stripping the stamp"
            )
        elif sha256(stripped) != expected_hashes[rel]:
            errors.append(f"hash mismatch vs canonical {rel}")

        extras = [
            p.name
            for p in (plugin_skills / name).iterdir()
            if p.name not in {".", "..", "SKILL.md"}
        ]
        if extras:
            errors.append(
                f"plugins/corpus/skills/{name}/ has extra files: " + ", ".join(sorted(extras))
            )

    if errors:
        sys.stderr.write("plugin skill drift:\n")
        for err in errors:
            sys.stderr.write(f"  - {err}\n")
        sys.stderr.write("fix: scripts/check-plugin-skill-drift.sh --write\n")
        raise SystemExit(1)

    print(f"ok: {len(names)} generated skill copies match canonical roots")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
PY
