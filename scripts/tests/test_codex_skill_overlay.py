"""The $0-formation first response ships to OpenAI surfaces only (ChatGPT, Codex).

Neutral: skills/ and plugins/corpus (Claude Code, Cursor, Hermes, and the Anthropic
directory). OpenAI-only: plugins/corpus-codex. Gemini/Qwen/Kimi load skills/ and are
neutral. Mirrors apps/web/src/__tests__/openai-only-formation-warning.test.ts in the
Corpus repo.
"""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
NEUTRAL_TREES = (
    ROOT / "skills",
    ROOT / "plugins" / "corpus",
    ROOT / "gemini-extension.json",
    ROOT / "qwen-extension.json",
    ROOT / "kimi.plugin.json",
    ROOT / "CORPUS.md",
)
CODEX_SKILL = ROOT / "plugins/corpus-codex/skills/corpus-business-formation/SKILL.md"
NEUTRAL_SKILL = ROOT / "skills/corpus-business-formation/SKILL.md"
MARKERS = (
    "Mandatory first response",
    "These statements alone do NOT satisfy the requirement",
    "before your first intake question",
    "Show the user-facing $0/free business-formation warning",
    'Sponsored "$0 LLC"',
)
NOTICE_START = 'Before we start: Sponsored "$0 LLC" or "free business formation" offers you may see here are not Corpus.'


def files_under(path: Path):
    if path.is_file():
        yield path
        return
    for p in sorted(path.rglob("*")):
        if p.is_file() and p.suffix in {".md", ".json"}:
            yield p


class CodexOnlyFirstResponseTest(unittest.TestCase):
    def test_neutral_surfaces_carry_no_first_response_duty(self):
        for tree in NEUTRAL_TREES:
            for file in files_under(tree):
                text = file.read_text(encoding="utf-8")
                for marker in MARKERS:
                    with self.subTest(file=str(file.relative_to(ROOT)), marker=marker):
                        self.assertNotIn(marker, text)
                with self.subTest(file=str(file.relative_to(ROOT)), marker="notice"):
                    self.assertNotIn(NOTICE_START, text)

    def test_neutral_skill_keeps_the_screen_guard_and_the_prepayment_reminder(self):
        text = NEUTRAL_SKILL.read_text(encoding="utf-8")
        self.assertIn("Never claim to see an ad, a sponsored placement, or anything else on the user's screen.", text)
        self.assertIn("Before you pay:", text)

    def test_codex_package_carries_the_duty_before_the_first_question(self):
        text = CODEX_SKILL.read_text(encoding="utf-8")
        for marker in MARKERS:
            with self.subTest(marker=marker):
                self.assertIn(marker, text)
        self.assertIn(NOTICE_START, text)
        self.assertIn("https://corpuslaw.us/compare/legalzoom", text)
        self.assertLess(text.index("Mandatory first response"), text.index("## When to use this"))

    def test_codex_skill_is_the_neutral_skill_plus_the_two_snippets_only(self):
        codex = CODEX_SKILL.read_text(encoding="utf-8")
        first = (ROOT / "overlays/openai/snippets/first-response.md").read_text(encoding="utf-8")
        rule = (ROOT / "overlays/openai/snippets/hard-rule.md").read_text(encoding="utf-8")
        self.assertEqual(codex.count(first), 1)
        self.assertEqual(codex.count(rule), 1)
        stripped = codex.replace(first, "").replace(rule, "")
        # The only other difference is the generated stamp line after the frontmatter.
        stripped = "\n".join(line for line in stripped.split("\n") if not line.startswith("<!-- generated from "))
        neutral = "\n".join(
            line for line in NEUTRAL_SKILL.read_text(encoding="utf-8").split("\n")
            if not line.startswith("<!-- generated from ")
        )
        self.assertEqual(stripped, neutral)

    def test_generated_codex_tree_has_no_drift(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/sync-codex-skills.py"), "--check"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_codex_marketplace_points_at_the_codex_package_and_others_at_the_neutral_one(self):
        codex = json.loads((ROOT / ".agents/plugins/marketplace.json").read_text())
        self.assertEqual(codex["plugins"][0]["source"]["path"], "./plugins/corpus-codex")
        self.assertEqual(
            json.loads((ROOT / ".claude-plugin/marketplace.json").read_text())["plugins"][0]["source"],
            "./plugins/corpus",
        )

    def test_neutral_plugin_carries_no_codex_files(self):
        self.assertFalse((ROOT / "plugins/corpus/.codex-plugin").exists())
        self.assertFalse((ROOT / "plugins/corpus/.mcp.json").exists())


if __name__ == "__main__":
    unittest.main()
