"""Integration checks using real Typst/Poppler and a local fake Responses API.

Run: python3 -m unittest discover -s tests -p 'test_*.py' -v
No credentials, external network, or browser are used.
"""
import copy
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import xml.etree.ElementTree as ET

SKILL = Path(__file__).resolve().parents[1]
BUILDER = SKILL / 'scripts/typst_to_pigeon.py'


def execute(command, **kwargs):
    result = subprocess.run(command, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result


class PipelineTests(unittest.TestCase):
    def test_configured_model_cache_and_failure_preserves_output(self):
        requests = []
        response_mode = ['repair']

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_): pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                requests.append(body)
                if response_mode[0] == 'fail':
                    self.send_response(503); self.end_headers(); return
                slide = json.loads(body['input'][0]['content'][0]['text'])['slides'][0]
                evidence = 'not a quote in the deck' if len(requests) == 1 else slide['title']
                graph = {'concepts': [{'id': 'geometry', 'label': 'Geometry',
                         'mentions': [{'slideId': slide['id'], 'kind': 'text', 'evidence': evidence}]}],
                         'relationships': []}
                result = json.dumps({'output': [{'content': [{'type': 'output_text', 'text': json.dumps(graph)}]}]}).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(result))); self.end_headers(); self.wfile.write(result)

        with tempfile.TemporaryDirectory(prefix='pigeon pipeline ') as tmp:
            root = Path(tmp)
            source = root / 'slides.typ'
            shutil.copy2(SKILL / 'tests/fixtures/geometry.typ', source)
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
            env = dict(os.environ, OPENAI_API_KEY='local-test-only', OPENAI_MODEL='pigeon-test',
                       OPENAI_BASE_URL=f'http://127.0.0.1:{server.server_port}/v1')
            (root / 'pigeon.toml').write_text('graph = "model"\ngraph_provider = "env"\nno_zip = true\n')
            command = [sys.executable, str(BUILDER), str(source)]
            execute(command, env=env, cwd=SKILL)
            output = root / 'pigeon-slides'
            deck = output / 'public/deck'
            manifest = json.loads((deck / 'manifest.json').read_text())
            graph = json.loads((deck / 'knowledge-graph.json').read_text())
            self.assertEqual(manifest['titleEffect'], 'text-type')
            self.assertEqual(graph['extraction']['mode'], 'model-assisted')
            self.assertEqual(graph['revision'], manifest['revision'])
            self.assertEqual(len(requests), 2, 'invalid quote should trigger exactly one repair')
            self.assertEqual(sum(item['type'] == 'input_image' for item in requests[0]['input'][0]['content']), 3)
            self.assertEqual([(s['width'], s['height']) for s in manifest['slides']], [(800, 600), (500, 850), (1024, 576)])
            self.assertTrue(all(s['titleLayer'] for s in manifest['slides']))
            self.assertTrue(any(r['kind'] == 'takeaway' for r in manifest['slides'][0]['wandRegions']))
            self.assertTrue(any(r['kind'] == 'table' for r in manifest['slides'][0]['wandRegions']))
            execute(command + ['--force'], env=env)
            self.assertEqual(len(requests), 2, 'unchanged rebuild should reuse validated cache')
            before = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
            response_mode[0] = 'fail'
            source.write_text(source.read_text().replace('Geometry and color', 'Geometry revised'))
            failed = subprocess.run(command + ['--force'], env=env, capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('HTTP 503', failed.stderr)
            self.assertEqual(len(requests), 3)
            source.write_text('#unknown-function()')
            failed = subprocess.run(command + ['--force'], env=env, capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            after = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
            self.assertEqual(before, after, 'failed replacement must leave old output byte-for-byte intact')

    def test_unicode_blank_pages_repeated_ids_resources_and_title_artwork(self):
        with tempfile.TemporaryDirectory(prefix='pigeon artwork ') as tmp:
            root = Path(tmp)
            source = root / 'slides.typ'
            source.write_text('''#set page(width: 700pt, height: 500pt, margin: 35pt, fill: rgb("eef3ff"))
#set text(size: 24pt)
#metadata((id: "one", title: "Über Ω title\\nSecond line")) <slide-record>
#text(size: 38pt, fill: blue)[Über Ω title\\ Second line]
#v(20pt)
Some body content stays visible.
#link("./example.html")[Interactive example]
#pagebreak()
#metadata((id: "one-p3", title: "Second")) <slide-record>
= Second
#pagebreak()
#metadata((id: "one", title: "Third")) <slide-record>
= Third
#pagebreak()
#box(width: 1pt, height: 1pt)
''')
            (root / 'example.html').write_text('<!doctype html><p>Local example</p>')
            (root / 'slides.navigation.json').write_text(json.dumps({'resources': {'./example.html': 'example.html'}}))
            output = root / 'output'
            execute([sys.executable, str(BUILDER), str(source), '--output', str(output), '--graph', 'local'])
            deck = output / 'public/deck'
            manifest = json.loads((deck / 'manifest.json').read_text())
            self.assertEqual([s['id'] for s in manifest['slides']], ['one', 'one-p3', 'one-p3-2', '04'])
            slide = manifest['slides'][0]
            self.assertIsNotNone(slide['titleLayer'])
            self.assertIsNone(manifest['slides'][3]['titleLayer'])
            self.assertEqual(slide['links'][0]['resource'], 'resources/001-example.html')
            bundle = (deck / 'embedded-deck.js').read_text()
            self.assertIn('resources/001-example.html', bundle)
            # Compare the original SVG with recombined animation body + glyphs
            # through real SVG rendering in Typst and rasterization in Poppler.
            base = ET.parse(deck / slide['titleLayer']['baseAsset']).getroot()
            title = ET.parse(deck / slide['titleLayer']['asset']).getroot()
            for el in title:
                if el.tag.split('}')[-1] != 'defs': base.append(copy.deepcopy(el))
            ET.ElementTree(base).write(root / 'recombined.svg')
            shutil.copy2(deck / slide['asset'], root / 'original.svg')
            (root / 'compare.typ').write_text('''#set page(width: 700pt, height: 500pt, margin: 0pt)
#image("original.svg", width: 700pt, height: 500pt)
#pagebreak()
#image("recombined.svg", width: 700pt, height: 500pt)
''')
            execute(['typst', 'compile', str(root / 'compare.typ'), str(root / 'compare.pdf')])
            execute(['pdftoppm', '-scale-to', '700', str(root / 'compare.pdf'), str(root / 'render')])
            images = sorted(root.glob('render-*.ppm'))
            self.assertEqual(len(images), 2)
            self.assertEqual(images[0].read_bytes(), images[1].read_bytes(), 'title layer must preserve original glyph paint and placement')
            import zipfile
            with zipfile.ZipFile(root / 'slides-pigeon.zip') as archive:
                self.assertIsNone(archive.testzip())
                self.assertFalse(any('/cache/' in p or p.endswith('.typ') for p in archive.namelist()))


if __name__ == '__main__': unittest.main()
