#!/usr/bin/env python3
"""Build an OpenAI-only, reproducible marketplace archive from a committed ref."""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
# Explicit inputs: never archive the whole checkout or copy local configuration.
INPUTS = (
    ".agents/plugins/marketplace.json",
    "plugins/corpus/.codex-plugin/plugin.json",
    "plugins/corpus/.mcp.json",
    "plugins/corpus/skills",
    "plugins/corpus/assets/logo.png",
    "docs/OPENAI_PLUGIN.md",
    "LICENSE",
)


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def build(ref, output_dir):
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
                member.name.startswith("plugins/corpus/skills/")
                and (path.name == "SKILL.md" or "references" in path.parts)
                and path.name != ".DS_Store"
            ):
                raise ValueError(f"Unexpected package file: {member.name}")
            files[member.name] = archive.extractfile(member).read()

    manifest = json.loads(files["plugins/corpus/.codex-plugin/plugin.json"])
    version = manifest["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Release version must be major.minor.patch")
    resolved_ref = git("rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", ref).decode().strip()
    tag = resolved_ref.removeprefix("refs/tags/")
    if resolved_ref.startswith("refs/tags/") and tag != f"corpus-openai-v{version}":
        raise ValueError("Release tag does not match the OpenAI manifest version")
    for name in ("corpus-business-formation", "corpus-legal-research"):
        if f"plugins/corpus/skills/{name}/SKILL.md" not in files:
            raise ValueError(f"Missing skill: {name}")
    files["README.md"] = files.pop("docs/OPENAI_PLUGIN.md")
    files["release.json"] = (json.dumps({
        "plugin": manifest["name"], "version": version,
        "ref": ref, "commit": commit,
    }, indent=2) + "\n").encode()

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"corpus-openai-{version}"
    destination = output_dir / f"{stem}.zip"
    # Fixed metadata and no compression make bytes independent of clock and zlib.
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(f"{stem}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
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
    args = parser.parse_args()
    try:
        build(args.ref, args.output_dir)
    except (subprocess.CalledProcessError, ValueError, KeyError) as error:
        parser.exit(1, f"Package build failed: {error}\n")
