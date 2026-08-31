#!/usr/bin/env bash
# Regenerate plugins/corpus/skills from the canonical skill roots and fail on
# drift. Generated SKILL.md files are the canonical bytes plus a stamp line
# immediately after the closing frontmatter fence (Agent Plugins v1 requires
# `---` at byte 0, so the stamp must never be first). Other packaged files
# (skill `references/`) get the same stamp after the first line.
#
# Packaged per skill: SKILL.md and anything under references/. Skill READMEs
# stay at the canonical roots (they describe copying a skill folder, not the
# plugin package).
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
    r"^<!-- generated from (?P<rel>skills/.+?) — edit there -->\n",
    re.M,
)


def stamp_text(text: str, rel: str) -> str:
    if text.startswith("\ufeff"):
        text = text[1:]
    stamp = f"<!-- generated from {rel} — edit there -->\n"
    if text.startswith("---"):
        match = frontmatter_close.search(text[3:])
        if match is None:
            raise SystemExit(f"{rel}: unterminated YAML frontmatter")
        insert_at = match.end() + 3
        generated = text[:insert_at] + stamp + text[insert_at:]
        if not generated.startswith("---"):
            raise SystemExit(f"{rel}: stamp must not precede frontmatter")
        return generated
    nl = text.find("\n")
    if nl < 0:
        return text + "\n" + stamp
    return text[: nl + 1] + stamp + text[nl + 1 :]


def strip_stamp(text: str) -> tuple[str, str | None]:
    if text.startswith("\ufeff"):
        text = text[1:]
    stamped = stamp_line.search(text)
    if stamped is None:
        return text, None
    return text[: stamped.start()] + text[stamped.end() :], stamped.group("rel")


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


def packaged_rel_paths(name: str) -> list[Path]:
    src_root = root / "skills" / name
    files: list[Path] = []
    skill_md = src_root / "SKILL.md"
    if skill_md.is_file():
        files.append(Path("SKILL.md"))
    refs = src_root / "references"
    if refs.is_dir():
        for path in sorted(refs.rglob("*")):
            if path.is_file() and path.name != ".DS_Store":
                files.append(path.relative_to(src_root))
    return files


def iter_plugin_rel_paths(skill_dir: Path) -> list[Path]:
    if not skill_dir.is_dir():
        return []
    files: list[Path] = []
    for path in sorted(skill_dir.rglob("*")):
        if path.is_file() and path.name != ".DS_Store":
            files.append(path.relative_to(skill_dir))
    return files


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
    if "references/harness-setup.md" in formation:
        ref = root / "skills/corpus-business-formation/references/harness-setup.md"
        if not ref.is_file():
            errors.append("formation skill points at references/harness-setup.md but it is missing")
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
    packaged: dict[str, list[Path]] = {}
    for name in names:
        rels = packaged_rel_paths(name)
        if Path("SKILL.md") not in rels:
            raise SystemExit(f"missing canonical skill: skills/{name}/SKILL.md")
        packaged[name] = rels
        dest_root = tmp / name
        dest_root.mkdir(parents=True)
        for rel_path in rels:
            canon_rel = f"skills/{name}/{rel_path.as_posix()}"
            src = root / canon_rel
            canonical = src.read_text(encoding="utf-8")
            generated = stamp_text(canonical, canon_rel)
            stripped, stamp_rel = strip_stamp(generated)
            if stamp_rel != canon_rel:
                raise SystemExit(f"{canon_rel}: stamp path mismatch ({stamp_rel!r})")
            if stripped != canonical.lstrip("\ufeff"):
                raise SystemExit(f"{canon_rel}: stamped copy is not reversible to canonical")
            dest = dest_root / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(generated, encoding="utf-8")
            expected_hashes[canon_rel] = sha256(canonical.lstrip("\ufeff"))

    if write:
        if plugin_skills.exists():
            shutil.rmtree(plugin_skills)
        plugin_skills.mkdir(parents=True)
        copied = 0
        for name in names:
            for rel_path in packaged[name]:
                dest = plugin_skills / name / rel_path
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(tmp / name / rel_path, dest)
                copied += 1
        print(f"wrote {copied} generated skill files under {plugin_skills}")
        raise SystemExit(0)

    if not plugin_skills.is_dir():
        raise SystemExit(
            f"missing {plugin_skills} — run scripts/check-plugin-skill-drift.sh --write"
        )

    errors: list[str] = []
    expected_names = set(names)
    actual_names = {p.name for p in plugin_skills.iterdir() if p.is_dir()}
    extra_dirs = sorted(actual_names - expected_names)
    missing_dirs = sorted(expected_names - actual_names)
    if extra_dirs:
        errors.append("unexpected plugin skill dirs: " + ", ".join(extra_dirs))
    if missing_dirs:
        errors.append("missing plugin skill dirs: " + ", ".join(missing_dirs))

    for name in names:
        expected_rels = {p.as_posix() for p in packaged[name]}
        actual_rels = {p.as_posix() for p in iter_plugin_rel_paths(plugin_skills / name)}
        extra = sorted(actual_rels - expected_rels)
        missing = sorted(expected_rels - actual_rels)
        if extra:
            errors.append(
                f"plugins/corpus/skills/{name}/ has extra files: " + ", ".join(extra)
            )
        if missing:
            errors.append(
                f"plugins/corpus/skills/{name}/ missing generated files: "
                + ", ".join(missing)
            )
        for rel_path in packaged[name]:
            canon_rel = f"skills/{name}/{rel_path.as_posix()}"
            generated_path = plugin_skills / name / rel_path
            expected_path = tmp / name / rel_path
            if not generated_path.is_file():
                continue
            actual = generated_path.read_text(encoding="utf-8")
            expected = expected_path.read_text(encoding="utf-8")
            if actual != expected:
                errors.append(
                    f"drift in plugins/corpus/skills/{name}/{rel_path.as_posix()} "
                    "(edit the canonical file, then --write)"
                )
            stripped, stamp_rel = strip_stamp(actual)
            canonical = (root / canon_rel).read_text(encoding="utf-8").lstrip("\ufeff")
            if stamp_rel != canon_rel:
                errors.append(
                    f"plugins/corpus/skills/{name}/{rel_path.as_posix()} is missing or has the wrong stamp"
                )
            if stripped != canonical:
                errors.append(
                    f"plugins/corpus/skills/{name}/{rel_path.as_posix()} is not byte-identical to {canon_rel} after stripping the stamp"
                )
            elif sha256(stripped) != expected_hashes[canon_rel]:
                errors.append(f"hash mismatch vs canonical {canon_rel}")

    if errors:
        sys.stderr.write("plugin skill drift:\n")
        for err in errors:
            sys.stderr.write(f"  - {err}\n")
        sys.stderr.write("fix: scripts/check-plugin-skill-drift.sh --write\n")
        raise SystemExit(1)

    n_files = sum(len(v) for v in packaged.values())
    print(f"ok: {n_files} generated skill files match canonical roots")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
PY
