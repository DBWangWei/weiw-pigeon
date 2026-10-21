"""PDF integration fixtures: native geometry, conservative titles and failure recovery."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import weakref
import xml.etree.ElementTree as ET

try:
    import pymupdf as fitz
except ImportError:
    fitz = None

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / 'scripts'))
from pdf_input import prepare_pdf, infer_title
from export_deck import build


def fixture(path):
    doc = fitz.open()
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 60), 'Geometry without a separator', fontsize=30)
    page.insert_text((40, 140), 'Body words stay visible during title effects.', fontsize=16)
    page.insert_link({'kind': fitz.LINK_URI, 'from': fitz.Rect(40, 125, 300, 145), 'uri': 'https://example.org'})
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 65), 'Ordinary text at the top.', fontsize=24)
    page.insert_text((40, 145), 'Equally sized body text.', fontsize=24)
    page.insert_text((40, 225), 'This page has no heading.', fontsize=24)
    page = doc.new_page(width=500, height=700)
    page.insert_text((35, 60), 'A wrapped heading', fontsize=30)
    page.insert_text((35, 95), 'on two lines', fontsize=30)
    page.insert_text((35, 240), 'The body uses a smaller font.', fontsize=16)
    page.draw_line((35, 115), (450, 115))
    page = doc.new_page(width=800, height=600)
    page.insert_text((40, 60), 'Tables and pictures', fontsize=36)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 80, 60), False)
    pix.clear_with(110)
    image = pix.tobytes('png')
    page.insert_image(fitz.Rect(500, 110, 740, 290), stream=image)
    for x in [40, 190, 340]: page.draw_line((x, 220), (x, 340))
    for y in [220, 260, 300, 340]: page.draw_line((40, y), (340, y))
    for y, row in zip([245, 285, 325], [('Name', 'Value'), ('Alpha', '10'), ('Beta', '20')]):
        for x, value in zip([50, 200], row): page.insert_text((x, y), value, fontsize=16)
    # A connected vector diagram, separate from text and table regions.
    page.draw_rect(fitz.Rect(500, 380, 730, 500))
    for i in range(6): page.draw_line((500, 390+i*18), (730, 490-i*18))
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 60), 'Borderless table', fontsize=30)
    for y, row in zip([150, 180, 210], [('Method', 'Accuracy'), ('Alpha', '0.92'), ('Beta', '0.87')]):
        for x, value in zip([40, 280], row): page.insert_text((x, y), value, fontsize=16)
    doc.new_page(width=600, height=400)  # A truly blank page stays in the route.
    page = doc.new_page(width=600, height=400)
    page.insert_image(page.rect, stream=image)  # OCR unavailable remains a valid release.
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 60), 'Rotated heading', fontsize=30)
    page.insert_link({'kind': fitz.LINK_GOTO, 'from': fitz.Rect(40, 30, 250, 65), 'page': 0})
    for x in [40, 140, 240]: page.draw_line((x, 130), (x, 230))
    for y in [130, 180, 230]: page.draw_line((40, y), (240, y))
    for y in [155, 205]:
        for x in [50, 150]: page.insert_text((x, y), 'data', fontsize=16)
    page.set_rotation(90)
    page = doc.new_page(width=700, height=500)
    page.insert_text((90, 110), 'Cropped heading', fontsize=30)
    page.insert_text((90, 220), 'Body after crop.', fontsize=16)
    page.set_cropbox(fitz.Rect(50, 50, 650, 450))
    doc.set_metadata({'title': 'PDF geometry regression'})
    doc.save(path)
    doc.close()


@unittest.skipUnless(fitz, 'Install requirements-pdf.txt to run PDF regression tests')
class PDFTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='pigeon PDF ')
        cls.root = Path(cls.tmp.name)
        cls.source = cls.root / 'slides.PDF'
        fixture(cls.source)
        cls.output = cls.root / 'output'
        cls.manifest = build(cls.source, cls.output)
        cls.deck = cls.output / 'public/deck'

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_titles_are_conservative_and_keep_native_artwork(self):
        slides = self.manifest['slides']
        self.assertEqual([s['title'] for s in slides], [
            'Geometry without a separator', '', 'A wrapped heading on two lines',
            'Tables and pictures', 'Borderless table', '', '', '', 'Cropped heading'])
        self.assertEqual(slides[1]['navigationLabel'], 'Slide 2')
        self.assertIsNone(slides[1]['titleLayer'])
        self.assertIsNone(slides[5]['titleLayer'])
        self.assertEqual((slides[7]['width'], slides[7]['height']), (400, 600))
        self.assertEqual((slides[8]['width'], slides[8]['height']), (600, 400))
        for number in [0, 2, 3, 4, 8]:
            slide = slides[number]
            self.assertTrue(slide['titleLayer'])
            # Real SVG rasterization proves splitting neither drops nor moves paint.
            original = (self.deck / slide['asset']).read_bytes()
            base = ET.parse(self.deck / slide['titleLayer']['baseAsset']).getroot()
            title = ET.parse(self.deck / slide['titleLayer']['asset']).getroot()
            for element in title:
                if element.tag.split('}')[-1] != 'defs': base.append(copy.deepcopy(element))
            with fitz.open(stream=original, filetype='svg') as before, fitz.open(stream=ET.tostring(base), filetype='svg') as after:
                self.assertEqual(before[0].get_pixmap().samples, after[0].get_pixmap().samples)
            # Body letters are not accidentally isolated with the first heading.
            if number == 0:
                self.assertEqual(slide['titleLayer']['glyphs'], len(slide['title']))

    def test_images_tables_links_and_bounds(self):
        slides = self.manifest['slides']
        methods = {r.get('method') for r in slides[3]['wandRegions']}
        self.assertTrue({'embedded-image', 'ruled-grid', 'vector-cluster'} <= methods, methods)
        self.assertIn('aligned-text-columns', {r.get('method') for r in slides[4]['wandRegions']})
        self.assertFalse(any(r['kind'] == 'table' for r in slides[1]['wandRegions']))
        self.assertFalse(any(r['kind'] == 'takeaway' for s in slides for r in s['wandRegions']))
        self.assertEqual(slides[0]['links'][0]['href'], 'https://example.org')
        link = slides[7]['links'][0]
        self.assertEqual((link['x'], link['y'], link['width'], link['height'], link['page']), (335, 40, 35, 210, 1))
        table = next(r for r in slides[7]['wandRegions'] if r.get('method') == 'ruled-grid')
        self.assertEqual((table['x'], table['y'], table['width'], table['height']), (170, 40, 100, 200))
        for slide in slides:
            for region in slide['wandRegions'] + slide['links']:
                self.assertGreaterEqual(region['x'], 0)
                self.assertGreaterEqual(region['y'], 0)
                self.assertLessEqual(region['x']+region['width'], slide['width']+.01)
                self.assertLessEqual(region['y']+region['height'], slide['height']+.01)

    def test_local_pdf_launcher_needs_no_typst_and_obeys_config(self):
        with tempfile.TemporaryDirectory(prefix='pigeon PDF cli ') as tmp:
            root = Path(tmp); source = root / '07.lecture slides.PDF'; shutil.copy2(self.source, source)
            bin_dir = root / 'bin'; bin_dir.mkdir()
            for name, exe in [('python3', sys.executable), ('node', shutil.which('node'))]:
                (bin_dir / name).symlink_to(exe)
            env = dict(os.environ, PATH=f'{bin_dir}:/usr/bin:/bin')
            env.pop('PIGEON_SKILL_DIR', None)  # Bundled launcher must choose its own skill, not an older global copy.
            self.assertIsNone(shutil.which('typst', path=env['PATH']))
            (root / 'pigeon.toml').write_text('title_effect="shiny-text"\nslide_transition="fade"\nno_zip=true\n')
            command = ['/bin/bash', str(SKILL/'scripts/typst-to-pigeon.sh'), str(source), '--title-effect', 'none']
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            output = root / 'pigeon-07.lecture slides'; deck = output / 'public/deck'
            manifest = json.loads((deck/'manifest.json').read_text())
            graph = json.loads((deck/'knowledge-graph.json').read_text())
            release = json.loads((output/'release.json').read_text())
            self.assertEqual(manifest['sourceType'], 'pdf')
            self.assertEqual(manifest['titleEffect'], 'none')
            self.assertEqual(manifest['slideTransition'], 'fade')
            self.assertEqual(manifest['pigeonVersion'], '1.0.3')
            self.assertEqual(release['version'], '1.0.3')
            self.assertEqual(graph['revision'], manifest['revision'])
            self.assertEqual(graph['extraction']['mode'], 'lexical')
            self.assertEqual((deck/manifest['pdf']).read_bytes(), source.read_bytes())
            self.assertIn('public/deck/slides/page-01.svg', (deck/'embedded-deck.js').read_text())
            before = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
            for mode in ['encrypted', 'malformed']:
                if mode == 'encrypted':
                    with fitz.open(self.source) as doc:
                        data = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw='owner', user_pw='password')
                else: data = b'not a PDF'
                source.write_bytes(data)
                failed = subprocess.run(command+['--force'], env=env, capture_output=True, text=True)
                self.assertNotEqual(failed.returncode, 0)
                self.assertNotIn('Traceback', failed.stderr)
                after = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
                self.assertEqual(before, after)

    def test_ocr_missing_and_ocr_geometry_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'slides').mkdir(); (root/'thumbs').mkdir()
            with patch.object(fitz.Page, 'get_textpage_ocr', side_effect=RuntimeError('no language data')):
                pages, _, warnings = prepare_pdf(self.source, root/'copy.pdf', root/'slides', root/'thumbs')
            self.assertEqual(pages[6]['textMode'], 'visual-only')
            self.assertTrue(pages[6]['visual'])
            self.assertTrue(any('OCR unavailable' in w for w in warnings))
            # Feed a real TextPage as OCR output to check that search and wand
            # use its coordinates; this is not a test of OCR recognition quality.
            with fitz.open() as recognized:
                page = recognized.new_page(width=600, height=400)
                page.insert_text((40, 60), 'Recognized heading', fontsize=30)
                page.insert_text((40, 180), 'Recognized body words.', fontsize=16)
                def recognized_textpage(original, **kwargs):
                    textpage = page.get_textpage()
                    textpage.parent = weakref.proxy(original)
                    return textpage
                with patch.object(fitz.Page, 'get_textpage_ocr', autospec=True, side_effect=recognized_textpage):
                    manifest = build(self.source, root/'ocr-output')
                scan = manifest['slides'][6]
                self.assertIn('Recognized body', scan['text'])
                self.assertTrue(scan['textRegions'])
                self.assertIsNone(scan['titleLayer'], 'OCR-only text must not erase native SVG artwork')

    def test_cover_heading_and_repeated_small_header(self):
        def line(text, size, y):
            return dict(text=text, fontSize=size, y=y, x=40, width=300, height=size, words=[], horizontal=True)
        geo = dict(width=600, height=400, lines=[line('A cover title', 36, 45)])
        self.assertEqual(infer_title(geo, set())[0], 'A cover title')
        geo['lines'] = [line('Repeated course label', 21, 10), line('Body text at normal size.', 16, 180)]
        self.assertEqual(infer_title(geo, {'repeated course label'})[0], '')

    def test_navigation_can_disable_or_supply_a_title(self):
        nav = self.root / 'override.json'
        nav.write_text(json.dumps({'slides': {'1': {'title': ''}, '2': {'title': 'Ordinary text at the top.'}}}))
        manifest = build(self.source, self.root/'override', navigation=nav)
        self.assertEqual(manifest['slides'][0]['title'], '')
        self.assertIsNone(manifest['slides'][0]['titleLayer'])
        self.assertEqual(manifest['slides'][1]['title'], 'Ordinary text at the top.')
        self.assertTrue(manifest['slides'][1]['titleLayer'])

    def test_model_graph_receives_pdf_page_images_without_poppler(self):
        import model_graph
        shutil.copytree(SKILL/'assets/pigeon-template/prompts', self.output/'prompts', dirs_exist_ok=True)
        response = {'concepts': [{'id': 'geometry', 'label': 'Geometry', 'mentions': [
            {'slideId': '01', 'kind': 'text', 'evidence': 'Geometry without a separator'}]}], 'relationships': []}
        with patch.object(sys, 'argv', ['model_graph.py', '--root', str(self.output)]), \
             patch.object(model_graph, 'provider_config', return_value=('https://example.invalid', 'fake-test', 'test')), \
             patch.object(model_graph, 'request_model', return_value=response) as request, \
             patch.object(subprocess, 'run', side_effect=AssertionError('No external renderer should run')):
            self.assertEqual(model_graph.main(), 0)
        content = request.call_args.args[3]
        self.assertEqual(sum(item['type']=='input_image' for item in content), 9)
        graph = json.loads((self.deck/'knowledge-graph.json').read_text())
        self.assertEqual(graph['revision'], self.manifest['revision'])
        self.assertEqual(graph['extraction']['mode'], 'model-assisted')


if __name__ == '__main__': unittest.main()
