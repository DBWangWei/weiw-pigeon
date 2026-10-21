"""Explicit semantic bounds, including real Typst layout and reveal checks."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / 'scripts'))
from semantic_regions import normalize_semantic_records
from export_deck import build, query


def execute(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result.stdout


def marker(page=1, **fields):
    return dict(page=page, value=dict(target='_fig', x=10, y=20, width=40, height=30, **fields))


class SemanticNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.pages = [dict(width=800, height=600, pointWidth=400, pointHeight=300),
                      dict(width=200, height=500, pointWidth=400, pointHeight=500)]

    def test_physical_pages_native_scaling_hidden_and_page_local_ids(self):
        records = [marker(id='same'), marker(2, id='same'),
                   dict(page=2, value=dict(visible=False, x=float('nan'))), marker(2)]
        result, report = normalize_semantic_records(records, self.pages)
        self.assertEqual(result[1], [dict(id='same', target='_fig', x=20, y=40, width=80, height=60)])
        self.assertEqual(result[2][0], dict(id='same', target='_fig', x=5, y=20, width=20, height=30))
        self.assertEqual(result[2][1]['id'], '_fig-3')
        self.assertEqual(report, dict(total=4, visible=3, hidden=1, pagesWithRegions=2, byTarget={'_fig': 3}))
        self.assertEqual(normalize_semantic_records([], self.pages)[0], {1: [], 2: []})
        edge = dict(page=1, value=dict(target='_fig', x=350, y=250, width=50.0004, height=50.0004))
        clipped = normalize_semantic_records([edge], self.pages)[0][1][0]
        self.assertEqual((clipped['x'] + clipped['width'], clipped['y'] + clipped['height']), (800, 600))

    def test_malformed_or_out_of_page_metadata_fails(self):
        cases = [dict(page=0, value={}), dict(page=True, value={}), dict(page=3, value={}),
                 dict(page=1, value='invalid')]
        base = marker()
        for key, values in dict(x=[-1, float('nan'), float('inf'), True, '10'],
                                y=[-1, 290], width=[0, -1, 391], height=[0, 281],
                                target=['', ' _fig', None], id=['', 1], visible=['false', 0]).items():
            for value in values:
                row = copy.deepcopy(base)
                row['value'][key] = value
                cases.append(row)
        for row in cases:
            with self.subTest(row=row), self.assertRaises(ValueError):
                normalize_semantic_records([row], self.pages)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            normalize_semantic_records([marker(id='dup'), marker(id='dup')], self.pages)
        with self.assertRaisesRegex(ValueError, 'finite'):
            normalize_semantic_records([], [dict(self.pages[0], width=float('inf'))])


FIXTURE = '''#import "pigeon-sem.typ": pigeon-sem, pigeon-hidden
#set page(width: 600pt, height: 500pt, margin: 30pt)
#set text(size: 15pt)
#set par(leading: 8pt)
#let takeaway(body) = pigeon-sem("takeaway", block(width: 100%, fill: rgb("d8f2da"), inset: 12pt, body))
#let _table() = align(center, pigeon-sem("_table", table(columns: (auto, auto), inset: 6pt, [A], [B], [12], [34])))
#let _fig() = align(center, pigeon-sem("_fig", rect(width: 160pt, height: 70pt, fill: blue), id: "plot"))
#metadata((id: "reveal", title: "Marker geometry")) <slide-record>
= Marker geometry
Some previous paragraph.
#_fig()
After centered figure.
#grid(columns: (1fr, 1fr), gutter: 20pt,
  pigeon-sem("_example", block(width: 100%, fill: yellow, inset: 15pt)[Grid example]),
  pigeon-sem("_fig", rect(width: 50%, height: 60pt, fill: red)),
)
#_table()
#takeaway[The decorated box is the target.]
#pagebreak()
#set page(width: 500pt, height: 450pt)
#counter(page).update(99)
#metadata((id: "reveal", title: "Reveal geometry")) <slide-record>
= Reveal geometry
#pigeon-hidden(pigeon-sem("_example", block(fill: red, inset: 8pt)[Hidden example], id: "hidden"))
#pigeon-hidden(pigeon-hidden(pigeon-sem("_fig", rect(width: 60pt, height: 30pt, fill: red))))
#pigeon-sem("_table", hide(table(columns: 2, [Invisible], [table])), visible: false)
#pigeon-sem("_fig", rect(width: 120pt, height: 50pt, fill: green), id: "plot")
#pigeon-sem("_example", block(fill: yellow, inset: 8pt)[Visible example])
'''


@unittest.skipUnless(all(shutil.which(tool) for tool in ('typst', 'pdftotext', 'pdftoppm')), 'requires Typst and Poppler')
class TypstSemanticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pigeon semantic ')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copy2(SKILL / 'assets/pigeon-sem.typ', self.root / 'pigeon-sem.typ')
        self.source = self.root / 'slides.typ'
        self.source.write_text(FIXTURE)

    def test_markers_do_not_change_rasters_and_capture_exact_physical_bounds(self):
        for mode in ('on', 'off'):
            pdf = self.root / f'{mode}.pdf'
            execute(['typst', 'compile', '--input', f'pigeon-sem={mode}', str(self.source), str(pdf)])
            execute(['pdftoppm', '-r', '144', str(pdf), str(self.root / mode)])
        on, off = sorted(self.root.glob('on-*.ppm')), sorted(self.root.glob('off-*.ppm'))
        self.assertEqual(len(on), 2)
        self.assertEqual(len(on), len(off))
        for a, b in zip(on, off):
            self.assertEqual(a.read_bytes(), b.read_bytes(), 'markers must preserve all original artwork and placement')
        rows = query(self.source, 'pigeon-sem')
        self.assertEqual({row['page'] for row in rows}, {1, 2}, 'logical page counter 99 must not replace physical page 2')
        self.assertEqual(sum(not row['value']['visible'] for row in rows), 3)
        first_plot = next(row['value'] for row in rows if row['page'] == 1 and row['value']['id'] == 'plot')
        self.assertAlmostEqual(first_plot['x'], 220)
        self.assertEqual((first_plot['width'], first_plot['height']), (160, 70))
        grid_plot = next(row['value'] for row in rows if row['page'] == 1 and row['value']['target'] == '_fig' and row['value']['id'] is None)
        self.assertAlmostEqual(grid_plot['x'], 310)
        self.assertAlmostEqual(grid_plot['width'], 130, msg='percentage widths must be resolved once in the original grid cell')
        example = next(row['value'] for row in rows if row['page'] == 1 and row['value']['target'] == '_example')
        self.assertEqual(example['width'], 260)
        off_rows = json.loads(execute(['typst', 'eval', 'query(<pigeon-sem>)', '--in', str(self.source), '--input', 'pigeon-sem=off']))
        self.assertEqual(off_rows, [])

    def test_export_manifest_and_report_are_page_specific_and_source_is_untouched(self):
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        output = self.root / 'output'
        manifest = build(self.source, output)
        slides = manifest['slides']
        self.assertEqual([slide['id'] for slide in slides], ['reveal', 'reveal-p2'])
        self.assertEqual([(slide['width'], slide['height']) for slide in slides], [(600, 500), (500, 450)])
        self.assertEqual([len(slide['semanticRegions']) for slide in slides], [5, 2])
        self.assertEqual({r['target'] for r in slides[0]['semanticRegions']}, {'takeaway', '_table', '_fig', '_example'})
        for slide in slides:
            for region in slide['semanticRegions']:
                self.assertEqual(set(region), {'id', 'target', 'x', 'y', 'width', 'height'})
                self.assertGreater(region['width'], 0)
                self.assertGreater(region['height'], 0)
                self.assertLessEqual(region['x'] + region['width'], slide['width'])
                self.assertLessEqual(region['y'] + region['height'], slide['height'])
        report = json.loads((output / 'build-report.json').read_text())
        self.assertEqual(report['semanticRegions']['hidden'], 3)
        self.assertEqual(report['semanticRegions']['visible'], 7)
        self.assertEqual([page['semanticRegions'] for page in report['pages']], [5, 2])
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), before)


if __name__ == '__main__':
    unittest.main()
