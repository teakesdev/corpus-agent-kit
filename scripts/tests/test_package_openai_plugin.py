"""Exercise packaging against an isolated Git repository, never the user's tags."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
import copy

spec = importlib.util.spec_from_file_location("package_plugin", Path(__file__).parents[1] / "package-openai-plugin.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        original_root = package.ROOT
        self.addCleanup(setattr, package, "ROOT", original_root)
        package.ROOT = self.root
        source_root = Path(__file__).parents[2]
        self.manifest = json.loads((source_root / "plugins/corpus/.codex-plugin/plugin.json").read_text())
        self.manifest["version"] = "0.1.0"
        self.icon = (source_root / "plugins/corpus/assets/corpus-icon.png").read_bytes()
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        for name in package.INPUTS:
            if name.endswith("/skills"):
                for skill in ("corpus-business-formation", "corpus-legal-research"):
                    self.write(f"{name}/{skill}/SKILL.md", "test skill")
            elif name.endswith("/assets"):
                p = self.root / name / "corpus-icon.png"
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(self.icon)
            elif name.endswith(".codex-plugin/plugin.json"):
                self.write(name, json.dumps(self.manifest))
            else:
                self.write(name, json.dumps({"name": "corpus", "version": "0.1.0"}))
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_head_is_reproducible_and_ignores_working_tree(self):
        package.build("HEAD", self.root / "first")
        self.write("LICENSE", "uncommitted edit")
        package.build("HEAD", self.root / "second")
        self.assertEqual((self.root / "first/corpus-openai-0.1.0.zip").read_bytes(),
                         (self.root / "second/corpus-openai-0.1.0.zip").read_bytes())

    def test_valid_annotated_release_tag(self):
        self.git("tag", "-a", "corpus-openai-v0.1.0", "-m", "release")
        package.build("refs/tags/corpus-openai-v0.1.0", self.root / "out")
        self.assertTrue((self.root / "out/corpus-openai-0.1.0.zip").exists())

    def test_rejects_wrong_name_and_wrong_version_tags(self):
        for tag in ("v0.2.0", "corpus-openai-v0.2.0"):
            self.git("tag", tag)
            for ref in (tag, f"refs/tags/{tag}"):
                with self.subTest(ref=ref), self.assertRaisesRegex(ValueError, "Release tag"):
                    package.build(ref, self.root / "out")

    def test_directory_layout_has_one_plugin_root_and_no_marketplace(self):
        package.build("HEAD", self.root / "out", "directory")
        with zipfile.ZipFile(self.root / "out/corpus-openai-0.1.0-submission.zip") as archive:
            names = archive.namelist()
            prefix = "corpus-openai-0.1.0-submission/"
            self.assertIn(prefix + ".codex-plugin/plugin.json", names)
            self.assertIn(prefix + ".mcp.json", names)
            self.assertIn(prefix + "assets/corpus-icon.png", names)
            self.assertNotIn(prefix + ".agents/plugins/marketplace.json", names)
            self.assertFalse(any("plugins/corpus/" in n for n in names))

    def validate(self, manifest=None, icon=None):
        package.validate_submission(manifest or self.manifest, {
            "plugins/corpus/assets/corpus-icon.png": self.icon if icon is None else icon,
        })

    def test_rejects_missing_policy_urls_and_oversized_subtitle(self):
        for field in ("supportURL", "privacyPolicyURL", "termsOfServiceURL"):
            manifest = copy.deepcopy(self.manifest)
            del manifest["interface"][field]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                self.validate(manifest)
        manifest = copy.deepcopy(self.manifest)
        manifest["interface"]["shortDescription"] = "x" * 31
        with self.assertRaisesRegex(ValueError, "shortDescription"):
            self.validate(manifest)

    def test_rejects_missing_nonsquare_and_escaping_icons(self):
        with self.assertRaisesRegex(ValueError, "included PNG"):
            self.validate(icon=b"")
        icon = self.icon[:20] + (256).to_bytes(4, "big") + self.icon[24:]
        with self.assertRaisesRegex(ValueError, "square"):
            self.validate(icon=icon)
        manifest = copy.deepcopy(self.manifest)
        manifest["interface"]["composerIcon"] = "./../secrets.png"
        with self.assertRaisesRegex(ValueError, "package asset"):
            self.validate(manifest)

    def test_rejects_incomplete_review_cases_and_private_urls(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["extensions"]["com.openai"]["review"]["test_cases"]["positive"].pop()
        with self.assertRaisesRegex(ValueError, "5 positive"):
            self.validate(manifest)
        manifest = copy.deepcopy(self.manifest)
        manifest["extensions"]["com.openai"]["review"]["test_cases"]["positive"][0]["expected_behavior"] = ""
        with self.assertRaisesRegex(ValueError, "Incomplete positive"):
            self.validate(manifest)
        manifest = copy.deepcopy(self.manifest)
        manifest["interface"]["supportURL"] = "https://password@example.com/support"
        with self.assertRaisesRegex(ValueError, "without credentials"):
            self.validate(manifest)
