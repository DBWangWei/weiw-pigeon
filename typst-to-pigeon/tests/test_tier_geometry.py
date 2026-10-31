"""Real Typst/PDF checks for semantic wrappers' reserved layout and paint bounds."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

try:
    import pymupdf as fitz
except ImportError:
    fitz = None


SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from export_deck import build

TMP_ROOT = SKILL.parents[1] / "tmp/_for_weiw-pigeon/work/semantic-tiers/tmp"
SCALE = 2


LAYOUT = r'''#import "pigeon-tiers.typ" as sem
#set page(width: 420pt, height: 480pt, margin: 24pt, fill: sem.background(default: white))
#set text(size: 12pt)
#set par(leading: 4pt)
Unwrapped anchor before.
#align(center, sem.hook(rect(width: 144pt, height: 38pt, fill: rgb("E3EEFA"), stroke: 1pt + blue, radius: 4pt)[Centered decorated figure]))
#align(right, sem.answer(block(width: 180pt, fill: rgb("FFF1CC"), inset: 8pt, radius: 5pt, stroke: 1pt + orange)[Right aligned answer]))
Inline before #sem.cue(inline: true)[$x^2 + y^2 = 1$ #text(size: 18pt)[MIX]] after.
#sem.detail(block(width: 100%, fill: rgb("E9F4E9"), inset: 8pt)[
  Outer detail remains.
  #sem.answer(inline: true)[NESTED-ANSWER]
])
#sem.detail(sem.support(to: "figure", region: (x: 0.25, y: 0.2, w: 0.5, h: 0.6), rect(width: 100%, height: 54pt, fill: rgb("D6E4FF"))[REGION-FIGURE]))
Unwrapped anchor after.
#pagebreak()
#set page(width: 320pt, height: 200pt, margin: 18pt)
Unwrapped page with a different physical size.
'''


FIDELITY = r'''#import "pigeon-tiers.typ" as sem
#set page(width: 360pt, height: 250pt, margin: 20pt, fill: white)
#set text(size: 13pt)
#let plain = sys.inputs.at("test-plain", default: "0") == "1"
#let hook(body) = if plain { body } else { sem.hook(body) }
#let answer(body) = if plain { body } else { sem.answer(body) }
#let cue(body) = if plain { body } else { sem.cue(body, inline: true) }
#place(top + center, dy: 8pt, hook(rect(width: 140pt, height: 40pt, fill: rgb("D8E8FF"), stroke: blue, radius: 5pt)[Decorated figure]))
#place(top + right, dy: 70pt, answer(block(width: 170pt, above: 0pt, below: 0pt, fill: rgb("FFF0CC"), inset: 8pt, radius: 4pt)[Decorated answer]))
#place(top + left, dy: 138pt)[Before #cue[$alpha^2 + beta^2$ #text(size: 18pt)[MIX]] after.]
'''


REPLACEMENT = r'''#import "pigeon-tiers.typ" as sem
#set page(width: 260pt, height: 180pt, margin: 20pt, fill: sem.background(default: white))
#set text(size: 12pt)
Unwrapped anchor.
#place(top + left, dy: 35pt, sem.hook(rect(width: 180pt, height: 55pt, fill: rgb("FADEDE"), stroke: none)[EARLIER]))
#place(top + left, dy: 35pt, sem.answer(rect(width: 180pt, height: 55pt, fill: rgb("DEFADE"), stroke: none)[REPLACEMENT]))
'''


@unittest.skipUnless(shutil.which("typst") and fitz, "requires Typst and PyMuPDF")
class TierGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        TMP_ROOT.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix="tier-geometry-", dir=TMP_ROOT)
        cls.root = Path(cls.temp.name)
        shutil.copy2(SKILL / "assets/pigeon-tiers.typ", cls.root / "pigeon-tiers.typ")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def source(self, name, text):
        path = self.root / f"{name}.typ"
        path.write_text(text)
        return path

    def command(self, *args):
        return subprocess.run(["typst", *map(str, args)], capture_output=True, text=True)

    def compile(self, source, name, **inputs):
        output = self.root / f"{name}.pdf"
        args = ["compile", source, output]
        for key, value in inputs.items():
            args.extend(["--input", f"{key}={value}"])
        result = self.command(*args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return output

    def records(self, source, **inputs):
        args = ["eval", "query(<pigeon-tier>).map(x => (page: x.location().page(), value: x.value))", "--in", source]
        for key, value in inputs.items():
            args.extend(["--input", f"{key}={value}"])
        result = self.command(*args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def raster(self, pdf, page=0):
        with fitz.open(pdf) as document:
            pixmap = document[page].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
            return pixmap.width, pixmap.height, pixmap.n, pixmap.samples

    def changed_pixels(self, before, after):
        self.assertEqual(before[:3], after[:3])
        width, height, channels = before[:3]
        a, b = before[3], after[3]
        return [(offset // channels % width, offset // channels // width)
                for offset in range(0, width * height * channels, channels)
                if a[offset:offset + channels] != b[offset:offset + channels]]

    def assert_changes_inside(self, before, after, roles):
        changed = self.changed_pixels(before, after)
        self.assertGreater(len(changed), 100, "the test must remove painted content")
        # A one-point pad covers antialiasing and strokes exactly on the box edge.
        boxes = [(math.floor((r["x"] - 1) * SCALE), math.floor((r["y"] - 1) * SCALE),
                  math.ceil((r["x"] + r["width"] + 1) * SCALE),
                  math.ceil((r["y"] + r["height"] + 1) * SCALE)) for r in roles]
        outside = [(x, y) for x, y in changed
                   if not any(left <= x < right and top <= y < bottom for left, top, right, bottom in boxes)]
        self.assertEqual(outside[:12], [], f"{len(outside)} changed pixels outside removed role bounds")

    def test_filtered_states_keep_physical_geometry_and_unwrapped_artwork(self):
        source = self.source("layout", LAYOUT)
        full = self.compile(source, "layout-full")
        filtered_inputs = {"pigeon-mode": "tier", "pigeon-tier-show": "hook,cue"}
        filtered = self.compile(source, "layout-filtered", **filtered_inputs)
        full_rows = self.records(source)
        self.assertEqual(full_rows, self.records(source, **filtered_inputs), "UIDs, ancestry and bounds must survive hidden content")
        with fitz.open(full) as a, fitz.open(filtered) as b:
            self.assertEqual([tuple(p.rect) for p in a], [(0, 0, 420, 480), (0, 0, 320, 200)])
            self.assertEqual([tuple(p.rect) for p in a], [tuple(p.rect) for p in b])
            self.assertIn("Unwrapped anchor after", b[0].get_text())
            self.assertNotIn("Right aligned answer", b[0].get_text())
        roles = [r["value"] for r in full_rows if r["value"]["kind"] == "role"]
        centered, right = roles[:2]
        self.assertAlmostEqual(centered["x"], (420 - 144) / 2)
        self.assertAlmostEqual(centered["width"], 144)
        self.assertAlmostEqual(right["x"] + right["width"], 420 - 24)
        self.assertAlmostEqual(right["width"], 180)
        removed = [r for r in roles if r["hide"] and r["role"] not in {"hook", "cue"}]
        self.assert_changes_inside(self.raster(full), self.raster(filtered), removed)
        self.assertEqual(self.raster(full, 1), self.raster(filtered, 1), "unwrapped pages must remain pixel-identical")

    def test_nested_role_visibility_and_marking_only_subregion(self):
        source = self.source("nested", LAYOUT)
        detail = self.compile(source, "nested-detail", **{"pigeon-mode": "tier", "pigeon-tier-show": "detail"})
        answer = self.compile(source, "nested-answer", **{"pigeon-mode": "tier", "pigeon-tier-show": "answer"})
        with fitz.open(detail) as document:
            text = document[0].get_text()
            self.assertIn("Outer detail remains", text)
            self.assertIn("REGION-FIGURE", text, "a hidden marking-only support region cannot erase its figure")
            self.assertNotIn("NESTED-ANSWER", text, "a visible parent cannot reveal a hidden child")
        with fitz.open(answer) as document:
            text = document[0].get_text()
            self.assertIn("Right aligned answer", text)
            self.assertNotIn("NESTED-ANSWER", text, "a hidden parent must hide a selected descendant")
            self.assertNotIn("REGION-FIGURE", text)
        roles = [r["value"] for r in self.records(source) if r["value"]["kind"] == "role"]
        nested = next(r for r in roles if r["text"] == "NESTED-ANSWER")
        self.assertEqual(len(nested["ancestry"]), 1)
        region = next(r for r in roles if r["role"] == "support")
        parent = next(r for r in roles if r["uid"] == region["ancestry"][-1])
        self.assertFalse(region["hide"])
        self.assertAlmostEqual(region["x"], parent["x"] + parent["width"] * .25)
        self.assertAlmostEqual(region["width"], parent["width"] * .5)

    def test_full_wrappers_preserve_original_decorations_inline_math_and_mixed_size(self):
        source = self.source("fidelity", FIDELITY)
        full = self.compile(source, "fidelity-wrapped")
        plain = self.compile(source, "fidelity-plain", **{"test-plain": "1"})
        self.assertEqual(self.raster(full), self.raster(plain), "ordinary compilation must preserve the complete authored artwork")

    def test_independent_same_position_alternatives_and_background_changes(self):
        source = self.source("replacement", REPLACEMENT)
        full = self.compile(source, "replacement-full")
        earlier = self.compile(source, "replacement-earlier", **{"pigeon-mode": "tier", "pigeon-tier-show": "hook"})
        later = self.compile(source, "replacement-later", **{"pigeon-mode": "tier", "pigeon-tier-show": "answer"})
        blue = self.compile(source, "replacement-background", **{"pigeon-mode": "tier", "pigeon-tier-show": "answer", "pigeon-tier-background": "#CBDDFF"})
        with fitz.open(earlier) as a, fitz.open(later) as b:
            self.assertIn("EARLIER", a[0].get_text())
            self.assertNotIn("REPLACEMENT", a[0].get_text())
            self.assertIn("REPLACEMENT", b[0].get_text())
            self.assertNotIn("EARLIER", b[0].get_text())
        roles = [r["value"] for r in self.records(source) if r["value"]["kind"] == "role"]
        self.assert_changes_inside(self.raster(earlier), self.raster(later), roles)
        # The opaque later alternative covers the earlier artwork in the full source.
        self.assertEqual(self.raster(full), self.raster(later))
        changed = self.changed_pixels(self.raster(later), self.raster(blue))
        self.assertIn((0, 0), changed, "an opted-in background change intentionally reaches the full page")
        self.assertGreater(len(changed), 260 * 180 * SCALE * SCALE * .6)

    def test_multiline_inline_role_is_rejected(self):
        cases = {
            "normal": "First line #linebreak() Second line",
            "small": "#text(size: 6pt)[First line #linebreak() Second line]",
            "raw-inline": '#raw("First\\nSecond", block: false)',
            "raw-block": '#raw("First\\nSecond", block: true)',
        }
        for name, body in cases.items():
            with self.subTest(body=name):
                source = self.source(f"invalid-inline-{name}", '#import "pigeon-tiers.typ" as sem\n'
                                     '#set page(width: 300pt, height: 200pt, margin: 20pt)\n'
                                     f'#sem.answer(inline: true)[{body}]\n')
                result = self.command("compile", source, self.root / f"invalid-inline-{name}.pdf")
                self.assertNotEqual(result.returncode, 0, "a two-line inline role must fail clearly")
                self.assertIn("one line", result.stderr)

    def test_large_single_line_text_and_tall_inline_math_are_supported(self):
        source = self.source("tall-inline", r'''#import "pigeon-tiers.typ" as sem
#set page(width: 400pt, height: 200pt, margin: 20pt)
#sem.answer(inline: true)[#text(size: 36pt)[BIG] $frac(x^2 + 1, y^2 + 1)$]
#sem.cue(inline: true)[#raw("single line", block: false)]
''')
        pdf = self.compile(source, "tall-inline")
        with fitz.open(pdf) as document:
            self.assertIn("BIG", document[0].get_text())

    @unittest.skipUnless(shutil.which("pdftotext"), "requires Poppler")
    def test_page_spanning_role_is_rejected(self):
        source = self.source("invalid-spanning", r'''#import "pigeon-tiers.typ" as sem
#set page(width: 300pt, height: 200pt, margin: 20pt)
#sem.detail(block(width: 100%, height: 260pt, fill: red)[Too tall for one physical page])
''')
        # Typst may emit an overflowing PDF; Pigeon's exporter is the validation
        # boundary and must reject it before publishing a malformed tier deck.
        with self.assertRaisesRegex(ValueError, "page-spanning|bounds"):
            build(source, self.root / "invalid-spanning-deck")


if __name__ == "__main__":
    unittest.main()
