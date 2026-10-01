#!/usr/bin/env python3
"""Build an OpenAI-only, reproducible marketplace archive from a committed ref."""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import struct
import tarfile
from urllib.parse import urlsplit
import zipfile


ROOT = Path(__file__).resolve().parent.parent
# Explicit inputs: never archive the whole checkout or copy local configuration.
INPUTS = (
    ".agents/plugins/marketplace.json",
    "plugins/corpus-openai/.codex-plugin/plugin.json",
    "plugins/corpus-openai/.mcp.json",
    "plugins/corpus-openai/skills",
    "plugins/corpus-openai/assets",
    "docs/OPENAI_PLUGIN.md",
    "LICENSE",
)


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def validate_submission(manifest, files):
    """Check our directory package's local structure, not policy approval."""
    interface = manifest["interface"]
    for field, limit in (("displayName", 30), ("shortDescription", 30),
                         ("longDescription", 4000), ("developerName", 80)):
        value = interface.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f"{field} must be nonempty and at most {limit} characters")
    for field in ("websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"):
        value = interface.get(field, "")
        parsed = urlsplit(value)
        if (len(value) > 1024 or parsed.scheme != "https" or not parsed.hostname
                or parsed.username is not None or parsed.password is not None):
            raise ValueError(f"{field} must be a public HTTPS URL without credentials")
    for field in ("logo", "composerIcon"):
        value = interface.get(field, "")
        path = PurePosixPath(value)
        if not value.startswith("./") or path.is_absolute() or ".." in path.parts:
            raise ValueError(f"{field} must be a ./-prefixed package asset path")
        data = files.get("plugins/corpus-openai/" + value[2:], b"")
        # Corpus uses PNG assets. Reject missing/truncated/non-PNG files rather
        # than silently treating an arbitrary payload as a valid icon.
        if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
            raise ValueError(f"{field} must refer to an included PNG")
        width, height = struct.unpack(">II", data[16:24])
        if width != height or not 48 <= width <= 4096 or len(data) > 5 * 1024 * 1024:
            raise ValueError(f"{field} must be square, 48–4096px, and at most 5 MiB")
    prompts = interface.get("defaultPrompt", [])
    if isinstance(prompts, str):
        prompts = [prompts]
    if (not isinstance(prompts, list) or len(prompts) > 3
            or any(not isinstance(p, str) or not p.strip() or len(p) > 128 for p in prompts)):
        raise ValueError("defaultPrompt allows at most three nonempty prompts of 128 characters")
    cases = manifest.get("extensions", {}).get("com.openai", {}).get("review", {}).get("test_cases", {})
    for kind, count in (("positive", 5), ("negative", 3)):
        entries = cases.get(kind, [])
        if not isinstance(entries, list) or len(entries) != count:
            raise ValueError(f"Initial MCP review needs exactly {count} {kind} cases")
        for case in entries:
            required = ("description", "prompt", "tools_triggered", "expected_behavior") if kind == "positive" else ("description", "prompt")
            if not isinstance(case, dict) or any(not isinstance(case.get(k), str) or not case[k].strip() for k in required):
                raise ValueError(f"Incomplete {kind} review case")


def build(ref, output_dir, layout="marketplace"):
    if layout not in ("marketplace", "directory"):
        raise ValueError("Unknown archive layout")
    commit = git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}").decode().strip()
    source = git("archive", "--format=tar", commit, "--", *INPUTS)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(source)) as archive:
        for member in archive:
            if member.isdir():
                continue
            path = PurePosixPath(member.name)
            if not member.isfile() or path.is_absolute() or ".." in path.parts:
                raise ValueError(f"Unsafe archive member: {member.name}")
            if member.name not in INPUTS and not (
                member.name.startswith("plugins/corpus-openai/skills/")
                and (path.name == "SKILL.md" or "references" in path.parts)
                and path.name != ".DS_Store"
            ) and member.name not in (
                "plugins/corpus-openai/assets/logo.png", "plugins/corpus-openai/assets/corpus-icon.png"
            ):
                raise ValueError(f"Unexpected package file: {member.name}")
            files[member.name] = archive.extractfile(member).read()

    manifest = json.loads(files["plugins/corpus-openai/.codex-plugin/plugin.json"])
    version = manifest["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Release version must be major.minor.patch")
    resolved_ref = git("rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", ref).decode().strip()
    tag = resolved_ref.removeprefix("refs/tags/")
    if resolved_ref.startswith("refs/tags/") and tag != f"corpus-openai-v{version}":
        raise ValueError("Release tag does not match the OpenAI manifest version")
    for name in ("corpus-business-formation", "corpus-legal-research"):
        if f"plugins/corpus-openai/skills/{name}/SKILL.md" not in files:
            raise ValueError(f"Missing skill: {name}")
    if layout == "directory":
        validate_submission(manifest, files)
        files = {
            (name.removeprefix("plugins/corpus-openai/") if name.startswith("plugins/corpus-openai/") else name): content
            for name, content in files.items()
            if name != ".agents/plugins/marketplace.json"
        }
    files["README.md"] = files.pop("docs/OPENAI_PLUGIN.md")
    files["release.json"] = (json.dumps({
        "plugin": manifest["name"], "version": version,
        "ref": ref, "commit": commit, "layout": layout,
    }, indent=2) + "\n").encode()

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"corpus-openai-{version}"
    if layout == "directory":
        stem += "-submission"
    destination = output_dir / f"{stem}.zip"
    # Fixed metadata and no compression make bytes independent of clock and zlib.
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(name if layout == "directory" else f"{stem}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".zip.sha256").write_text(f"{digest}  {destination.name}\n")
    print(f"Built {destination} from {ref} ({commit})")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ref", help="Committed Git ref, ideally corpus-openai-v<version>")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    parser.add_argument("--layout", choices=("marketplace", "directory"), default="marketplace",
                        help="directory places the plugin at the ZIP root for portal upload")
    args = parser.parse_args()
    try:
        build(args.ref, args.output_dir, args.layout)
    except (subprocess.CalledProcessError, ValueError, KeyError) as error:
        parser.exit(1, f"Package build failed: {error}\n")
