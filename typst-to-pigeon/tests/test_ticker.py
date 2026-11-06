"""Deterministic authored ticker normalization tests."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ticker import build_ticker, flatten


class TickerTests(unittest.TestCase):
    def test_flatten_content_tree(self):
        self.assertEqual(flatten({"children": [{"text": "A"}, {"func": "space"}, {"text": "B"}]}), "A B")

    def test_running_state_and_page_mapping(self):
        records = [
            {"page": 1, "id": "01", "section": "Intro"},
            {"page": 2, "id": "02", "section": "Mechanism"},
            {"page": 3, "id": "03", "section": "Mechanism"},
            {"page": 4, "id": "04", "section": "Mechanism"},
        ]
        data = build_ticker({
            "ticks": [
                {"kind": "now", "id": "q1", "page": 2, "body": {"text": "Question"}},
                {"kind": "done", "resolves": "q1", "page": 4, "body": {"text": "Answer"}},
            ],
            "bands": [{"page": page, "x": 0, "y": 150, "w": 320, "h": 28, "fill": "#fff"} for page in (2, 3, 4)],
        }, records)
        self.assertEqual(data["ticks"][0]["slide"], "02")
        self.assertEqual(data["pages"][1]["left"], {"tick": "t1"})
        self.assertEqual(data["pages"][2]["left"], {"tick": "t1"})
        self.assertEqual(data["pages"][3]["left"], {"tick": "t2"})
        self.assertEqual(data["openAtEnd"], [])

    def test_invalid_references_are_reported(self):
        data = build_ticker({
            "ticks": [
                {"kind": "now", "id": "q", "page": 2, "plain": "one"},
                {"kind": "now", "id": "q", "page": 2, "plain": "two"},
                {"kind": "done", "resolves": "missing", "page": 3, "plain": "three"},
            ], "bands": []}, [{"page": 2, "id": "02", "section": "Talk"}, {"page": 3, "id": "03", "section": "Talk"}])
        codes = {warning["code"] for warning in data["warnings"]}
        self.assertIn("tick.duplicate-id", codes)
        self.assertIn("tick.unknown-resolves", codes)


if __name__ == "__main__":
    unittest.main()
