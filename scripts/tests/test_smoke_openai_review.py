"""Protect the smoke harness against accidental paid or mutating tool calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("review_smoke", Path(__file__).parents[1] / "smoke-openai-review.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeSafetyTest(unittest.TestCase):
    def test_payment_account_and_unknown_tools_fail_before_network(self):
        with patch.object(smoke.urllib.request, "urlopen") as network:
            for name in ("formation.checkout", "formation.payment_status", "account.status", "shell"):
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, "read-only"):
                    smoke.call(name, {})
            network.assert_not_called()
