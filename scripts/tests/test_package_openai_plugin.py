"""Exercise packaging against an isolated Git repository, never the user's tags."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

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
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        for name in package.INPUTS:
            if name.endswith("/skills"):
                for skill in ("corpus-business-formation", "corpus-legal-research"):
                    self.write(f"{name}/{skill}/SKILL.md", "test skill")
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
