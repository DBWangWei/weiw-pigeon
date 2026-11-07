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
            {"page": 5, "id": "05", "section": "Q&A"},
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

    def test_cover_band_is_suppressed(self):
        data = build_ticker({
            "ticks": [
                {"kind": "now", "id": "cover", "page": 1, "plain": "Cover thread"},
                {"kind": "now", "page": 2, "plain": "Body thread"},
            ],
            "bands": [
                {"page": 1, "x": 0, "y": 500, "w": 320, "h": 28, "fill": "#fff"},
                {"page": 2, "x": 0, "y": 500, "w": 320, "h": 28, "fill": "#fff"},
            ],
        }, [
            {"page": 1, "id": "01", "section": "Cover"},
            {"page": 2, "id": "02", "section": "Body"},
            {"page": 3, "id": "03", "section": "Q&A"},
        ])
        self.assertEqual(len(data["ticks"]), 1)
        self.assertEqual(data["ticks"][0]["page"], 2)
        self.assertIsNone(data["pages"][0]["band"])
        self.assertIsNone(data["pages"][0]["left"])
        self.assertIsNotNone(data["pages"][1]["band"])

    def test_next_row_uses_the_band_left_inset(self):
        data = build_ticker({
            "ticks": [
                {"kind": "now", "page": 2, "plain": "Current"},
                {"kind": "next", "page": 2, "plain": "Next"},
            ],
            "bands": [{
                "page": 2, "x": 0, "y": 500, "w": 320, "h": 28,
                "inset": 10, "left": {"x": 10, "y": 1, "w": 40, "h": 10},
                "right": {"x": 10, "y": 15, "w": 30, "h": 10},
            }],
        }, [
            {"page": 1, "id": "01", "section": "Talk"},
            {"page": 2, "id": "02", "section": "Talk"},
            {"page": 3, "id": "03", "section": "Q&A"},
        ])
        self.assertEqual(data["pages"][1]["band"]["inset"], 10.0)
        self.assertEqual(data["pages"][1]["band"]["right"]["x"], 10.0)

    def test_final_page_ticks_and_band_are_suppressed(self):
        data = build_ticker({
            "ticks": [
                {"kind": "now", "id": "body", "page": 2, "plain": "Body thread"},
                {"kind": "now", "id": "qa", "page": 3, "plain": "Wrong Q&A tick"},
            ],
            "bands": [
                {"page": 2, "x": 0, "y": 500, "w": 320, "h": 28, "fill": "#fff"},
                {"page": 3, "x": 0, "y": 500, "w": 320, "h": 28, "fill": "#fff"},
            ],
        }, [
            {"page": 1, "id": "01", "section": "Intro"},
            {"page": 2, "id": "02", "section": "Talk"},
            {"page": 3, "id": "03", "section": "Q&A"},
        ])
        self.assertEqual([tick["page"] for tick in data["ticks"]], [2])
        self.assertIsNotNone(data["pages"][1]["band"])
        self.assertIsNone(data["pages"][2]["band"])
        self.assertIsNone(data["pages"][2]["left"])
        self.assertIsNone(data["pages"][2]["right"])


if __name__ == "__main__":
    unittest.main()
