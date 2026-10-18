import unittest
from pathlib import Path
import sys
import json
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from outline_sections import outline_items, assign_sections


def line(text, y, x=40, height=20):
    return {'text': text, 'y': y, 'x': x, 'height': height,
            'width': max(20, len(text) * 7), 'words': []}


class OutlineTests(unittest.TestCase):
    def geo(self, lines):
        return {'lines': lines, 'width': 800, 'height': 600}

    def slide(self, page, title, lines, section='Talk'):
        return {'id': f'{page:02d}', 'page': page, 'title': title, 'height': 600,
                'wandRegions': [], 'section': section, 'lines': lines}

    def test_only_flat_bullets_under_overview_are_outline_items(self):
        slide = self.slide(1, 'Overview', [line('Overview', 30), line('• Foundations', 110), line('2. Practice', 150), line('3) Reflection', 190)])
        self.assertEqual(outline_items(slide, self.geo(slide.pop('lines'))), ['Foundations', 'Practice', 'Reflection'])
        ordinary = self.slide(2, 'Overview', [line('Overview', 30), line('A paragraph is not a list.', 110)])
        self.assertEqual(outline_items(ordinary, self.geo(ordinary.pop('lines'))), [])

    def test_repeated_outline_pages_advance_sections_and_respect_explicit_sections(self):
        slides = [
            self.slide(1, 'Overview', [line('Overview', 30), line('1. Foundations', 110), line('2. Practice', 150)]),
            self.slide(2, 'Foundations', [line('Foundations', 30), line('Body', 110)]),
            self.slide(3, 'Outline', [line('Outline', 30), line('1. Foundations', 110), line('2. Practice', 150)]),
            self.slide(4, 'Practice', [line('Practice', 30), line('Body', 110)], section='Lecturer override'),
            self.slide(5, 'Closing', [line('Closing', 30), line('Body', 110)]),
        ]
        geometry = [self.geo(s.pop('lines')) for s in slides]
        found = assign_sections(slides, geometry, {'04'}, [])
        self.assertEqual([item['sectionNumber'] for item in found], [1, 2])
        self.assertEqual([s['section'] for s in slides], ['1. Foundations', '1. Foundations', '2. Practice', 'Lecturer override', '2. Practice'])
        self.assertTrue(slides[0]['isOutline']); self.assertTrue(slides[2]['isOutline'])

    def test_different_repeated_list_is_reported_without_changing_current_section(self):
        slides = [self.slide(1, 'Overview', [line('Overview', 30), line('1. A', 110), line('2. B', 150)]), self.slide(2, 'Outline', [line('Outline', 30), line('1. A', 110), line('2. Changed', 150)])]
        geometry = [self.geo(s.pop('lines')) for s in slides]; warnings = []
        found = assign_sections(slides, geometry, set(), warnings)
        self.assertEqual([item['sectionNumber'] for item in found], [1])
        self.assertTrue(any('differs' in warning for warning in warnings))
        self.assertEqual(slides[1]['section'], '1. A')

    def test_wrapped_items_separate_markers_nested_lists_and_mixed_content(self):
        slide = self.slide(1, 'Overview', [])
        wrapped = [line('Overview', 30), line('•', 110), line('Foundations and', 110, x=60),
                   line('applications', 135, x=60), line('• Practice', 180)]
        self.assertEqual(outline_items(slide, self.geo(wrapped)), ['Foundations and applications', 'Practice'])
        self.assertEqual(outline_items(slide, self.geo([line('Overview', 30), line('• One section', 110)])), ['One section'])
        self.assertEqual(outline_items(slide, self.geo([line('Overview', 30), line('• A', 110), line('• Nested', 150, x=90)])), [])
        self.assertEqual(outline_items(slide, self.geo([line('Overview', 30), line('• A', 110), line('Paragraph', 180)])), [])
        slide['wandRegions'] = [{'kind': 'table', 'x': 60, 'y': 250, 'width': 200, 'height': 100}]
        self.assertEqual(outline_items(slide, self.geo(wrapped)), [])

    def test_real_typst_and_pdf_outline_pages_infer_the_same_sections(self):
        from export_deck import build
        with tempfile.TemporaryDirectory(prefix='pigeon-outline-') as temporary:
            root = Path(temporary)
            source = root / 'outline.typ'
            source.write_text('''#set page(width: 800pt, height: 600pt, margin: 40pt)
#set text(size: 22pt)
#let title(body) = block(below: 30pt)[#text(size: 36pt, weight: "bold", body)]
#title[Welcome]
Introduction to this talk.
#pagebreak()
#title[Overview]
- Foundations
- Practice
#pagebreak()
#title[Foundations]
Some body text for the first section.
#pagebreak()
#title[Outline]
+ Foundations
+ Practice
#pagebreak()
#title[Practice]
Some body text for the second section.
''')
            typst = build(source, root / 'typst-output')
            pdf = build(root / 'typst-output/public/deck/outline.pdf', root / 'pdf-output')
            for manifest in [typst, pdf]:
                self.assertEqual([s['section'] for s in manifest['slides']],
                    ['Introduction', '1. Foundations', '1. Foundations', '2. Practice', '2. Practice'])
                self.assertEqual([s['outlineSectionNumber'] for s in manifest['slides'] if s.get('isOutline')], [1, 2])
            report = json.loads((root / 'pdf-output/build-report.json').read_text())
            self.assertEqual(len(report['outlines']), 2)


if __name__ == '__main__': unittest.main()
