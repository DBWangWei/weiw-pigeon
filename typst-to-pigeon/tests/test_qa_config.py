"""Q&A build configuration contract tests."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from qa_config import resolve_qa_config


class QaConfigTests(unittest.TestCase):
    def test_defaults_are_enabled_and_camel_case(self):
        qa = resolve_qa_config({})
        self.assertEqual(qa, {"enabled": True, "target": "_qa", "model": "gpt-4.1-mini", "maxLength": 4000, "maxItems": 50})

    def test_overrides_and_strict_validation(self):
        qa = resolve_qa_config({"enabled": False, "target": "questions", "model": "fast", "max_length": 800, "max_items": 3})
        self.assertFalse(qa["enabled"])
        self.assertEqual(qa["target"], "questions")
        self.assertEqual(qa["maxLength"], 800)
        for settings in ({"unknown": True}, {"enabled": 1}, {"target": "bad target"}, {"model": ""}, {"max_length": 1}, {"max_items": 101}):
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                resolve_qa_config(settings)
        original = copy.deepcopy(resolve_qa_config({}))
        self.assertEqual(resolve_qa_config({}), original)


if __name__ == "__main__":
    unittest.main()
